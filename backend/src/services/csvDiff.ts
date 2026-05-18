import prisma from "../db/prisma";

export interface CsvRow {
  id?: string;
  recipient?: string;
  amount?: number;
  mint?: string;
  type?: number;
  duration?: number;
  cancelable?: boolean;
}

export interface DiffChange {
  field: string;
  oldVal: any;
  newVal: any;
}

export interface DiffItem {
  id: string;
  recipient: string;
  changes: DiffChange[];
  details: {
    creator?: string;
    mint?: string;
    type?: number;
    amount?: number;
    duration?: number;
    cancelable?: boolean;
  };
}

export interface CsvDiffResult {
  added: any[];
  modified: DiffItem[];
  deleted: any[];
  unchanged: any[];
}

/**
 * Robust CSV parser that parses text into key-value objects, converting numeric and boolean fields appropriately.
 */
export function parseCsvText(csvText: string): CsvRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.trim());
    if (values.length < headers.length) continue;

    const row: any = {};
    headers.forEach((header, index) => {
      const val = values[index];
      if (!val) return;

      if (header === "amount" || header === "type" || header === "duration") {
        row[header] = Number(val);
      } else if (header === "cancelable") {
        row[header] = val.toLowerCase() === "true" || val === "1";
      } else {
        row[header] = val;
      }
    });
    rows.push(row);
  }

  return rows;
}

/**
 * Compute the diff between incoming CSV rows and a set of reference streams (either live or historical).
 */
export function computeCsvDiff(
  newRows: CsvRow[],
  refStreams: any[],
  mode: "create" | "edit"
): CsvDiffResult {
  const added: any[] = [];
  const modified: DiffItem[] = [];
  const deleted: any[] = [];
  const unchanged: any[] = [];

  // Create lookup maps for reference streams
  const refMap = new Map<string, any>();
  const refByRecipient = new Map<string, any[]>();

  refStreams.forEach(stream => {
    refMap.set(stream.id, stream);
    if (!refByRecipient.has(stream.recipient)) {
      refByRecipient.set(stream.recipient, []);
    }
    refByRecipient.get(stream.recipient)!.push(stream);
  });

  const matchedRefIds = new Set<string>();

  // Process rows in the new CSV
  newRows.forEach((row, idx) => {
    let matchedStream: any = null;

    if (row.id) {
      matchedStream = refMap.get(row.id);
    } else if (mode === "create" && row.recipient) {
      // In create mode, if no ID is specified, we match by recipient (if recipient exists in reference)
      const potentialMatches = refByRecipient.get(row.recipient) || [];
      const unmatchedPotential = potentialMatches.filter(s => !matchedRefIds.has(s.id));
      if (unmatchedPotential.length > 0) {
        matchedStream = unmatchedPotential[0]; // Match the first unmatched stream for this recipient
      }
    }

    if (!matchedStream) {
      // Stream is newly added!
      added.push({
        id: row.id || `StreamCSV-NEW-${idx}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        recipient: row.recipient || "Unknown Recipient",
        amount: row.amount || 0,
        mint: row.mint || "EHHDgoeiRa4FCNgwCtjuL69wX2Hre3q3bSddh1LZB3pr",
        type: row.type !== undefined ? row.type : 0,
        duration: row.duration || 3600,
        cancelable: row.cancelable !== undefined ? row.cancelable : true,
        isNew: true
      });
    } else {
      matchedRefIds.add(matchedStream.id);

      const changes: DiffChange[] = [];

      // Check for parameter differences
      if (row.amount !== undefined && Number(matchedStream.totalAmount) !== row.amount) {
        changes.push({
          field: "amount",
          oldVal: Number(matchedStream.totalAmount),
          newVal: row.amount
        });
      }

      if (row.cancelable !== undefined && Boolean(matchedStream.cancelable) !== row.cancelable) {
        changes.push({
          field: "cancelable",
          oldVal: Boolean(matchedStream.cancelable),
          newVal: row.cancelable
        });
      }

      if (row.duration !== undefined) {
        const currentDuration = Number(matchedStream.endTs) - Number(matchedStream.startTs);
        if (currentDuration !== row.duration) {
          changes.push({
            field: "duration",
            oldVal: currentDuration,
            newVal: row.duration
          });
        }
      }

      // Check type / mint ONLY in create mode if they are supplied and different
      if (mode === "create") {
        if (row.type !== undefined && Number(matchedStream.vestingType) !== row.type) {
          changes.push({
            field: "type",
            oldVal: Number(matchedStream.vestingType),
            newVal: row.type
          });
        }
        if (row.mint !== undefined && matchedStream.mint !== row.mint) {
          changes.push({
            field: "mint",
            oldVal: matchedStream.mint,
            newVal: row.mint
          });
        }
      }

      if (changes.length > 0) {
        modified.push({
          id: matchedStream.id,
          recipient: matchedStream.recipient,
          changes,
          details: {
            creator: matchedStream.creator,
            mint: row.mint || matchedStream.mint,
            type: row.type !== undefined ? row.type : matchedStream.vestingType,
            amount: row.amount !== undefined ? row.amount : Number(matchedStream.totalAmount),
            duration: row.duration !== undefined ? row.duration : (Number(matchedStream.endTs) - Number(matchedStream.startTs)),
            cancelable: row.cancelable !== undefined ? row.cancelable : matchedStream.cancelable
          }
        });
      } else {
        unchanged.push({
          id: matchedStream.id,
          recipient: matchedStream.recipient,
          amount: Number(matchedStream.totalAmount),
          duration: Number(matchedStream.endTs) - Number(matchedStream.startTs),
          cancelable: matchedStream.cancelable,
          type: matchedStream.vestingType
        });
      }
    }
  });

  // Any reference stream that was not matched counts as DELETED/CANCELLED in the new CSV revision
  refStreams.forEach(stream => {
    if (!matchedRefIds.has(stream.id)) {
      deleted.push({
        id: stream.id,
        recipient: stream.recipient,
        amount: Number(stream.totalAmount),
        duration: Number(stream.endTs) - Number(stream.startTs),
        cancelable: stream.cancelable,
        type: stream.vestingType
      });
    }
  });

  return { added, modified, deleted, unchanged };
}

/**
 * Utility to map simple CSV parsed rows into full DB Stream-like objects
 */
export function mapCsvRowsToStreams(rows: CsvRow[]): any[] {
  return rows.map((row, idx) => ({
    id: row.id || `StreamCSV-REF-${idx}`,
    creator: "SystemReference",
    recipient: row.recipient || "Unknown",
    mint: row.mint || "EHHDgoeiRa4FCNgwCtjuL69wX2Hre3q3bSddh1LZB3pr",
    totalAmount: BigInt(row.amount || 0),
    cancelable: row.cancelable !== undefined ? row.cancelable : true,
    startTs: BigInt(0),
    endTs: BigInt(row.duration || 0),
    vestingType: row.type !== undefined ? row.type : 0,
    isCsvCreated: true
  }));
}
