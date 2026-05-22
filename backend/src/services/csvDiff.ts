type CsvPrimitive = string | number | boolean | undefined;

export interface CsvRow {
  id?: string;
  recipient?: string;
  creator?: string;
  amount?: number;
  mint?: string;
  type?: number;
  duration?: number;
  cliffDuration?: number;
  cancelable?: boolean;
  milestones?: string;
}

type CsvDiffRecord = {
  matchKey: string;
  id?: string;
  recipient: string;
  amount: number;
  mint: string;
  type: number;
  duration: number;
  cliffDuration: number;
  cancelable: boolean;
  milestones: string;
  creator?: string;
};

export interface DiffChange {
  field: string;
  oldVal: CsvPrimitive;
  newVal: CsvPrimitive;
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
    cliffDuration?: number;
    cancelable?: boolean;
    milestones?: string;
  };
}

export interface CsvDiffResult {
  added: any[];
  modified: DiffItem[];
  deleted: any[];
  unchanged: any[];
}

function toNumber(value: unknown, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const text = String(value).trim().toLowerCase();
  if (text === "true" || text === "1") return true;
  if (text === "false" || text === "0") return false;

  return fallback;
}

function normalizeMilestones(value: unknown) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function normalizeCsvRecord(row: CsvRow | CsvDiffRecord): CsvDiffRecord {
  const recipient = String(row.recipient ?? "").trim();
  const id = row.id ? String(row.id).trim() : undefined;

  return {
    matchKey: id || (recipient ? `recipient:${recipient.toLowerCase()}` : `row:${Math.random().toString(36).slice(2, 10)}`),
    id,
    recipient,
    amount: toNumber(row.amount, 0),
    mint: String(row.mint ?? "").trim(),
    type: toNumber(row.type, 0),
    duration: toNumber(row.duration, 0),
    cliffDuration: toNumber(row.cliffDuration, 0),
    cancelable: toBoolean(row.cancelable, true),
    milestones: normalizeMilestones(row.milestones),
    creator: row.creator,
  };
}

function normalizeStreamRecord(stream: any): CsvDiffRecord {
  const recipient = String(stream.recipient ?? "").trim();
  const id = stream.id ? String(stream.id).trim() : undefined;

  return {
    matchKey: id || (recipient ? `recipient:${recipient.toLowerCase()}` : `row:${Math.random().toString(36).slice(2, 10)}`),
    id,
    recipient,
    amount: toNumber(stream.totalAmount ?? stream.amount, 0),
    mint: String(stream.mint ?? "").trim(),
    type: toNumber(stream.vestingType ?? stream.type, 0),
    duration: toNumber(stream.endTs, 0) - toNumber(stream.startTs, 0),
    cliffDuration: toNumber(stream.cliffTs, 0) - toNumber(stream.startTs, 0),
    cancelable: toBoolean(stream.cancelable, true),
    milestones: normalizeMilestones(stream.milestones),
    creator: stream.creator ? String(stream.creator) : undefined,
  };
}

export function buildExactRecordKey(record: Pick<CsvDiffRecord, "recipient" | "mint" | "type" | "amount" | "duration" | "cliffDuration" | "cancelable" | "milestones">) {
  return [
    record.recipient.trim().toLowerCase(),
    record.mint.trim(),
    record.type,
    record.amount,
    record.duration,
    record.cliffDuration,
    record.cancelable ? 1 : 0,
    record.milestones.trim(),
  ].join("|");
}

function buildIdentityRecordKey(record: Pick<CsvDiffRecord, "recipient" | "mint" | "type">) {
  return [record.recipient.trim().toLowerCase(), record.mint.trim(), record.type].join("|");
}

/**
 * Robust CSV parser that parses text into key-value objects, converting numeric and boolean fields appropriately.
 */
export function parseCsvText(csvText: string): CsvRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((value) => value.trim());
    if (values.length < headers.length) continue;

    const row: CsvRow = {};

    headers.forEach((header, index) => {
      const val = values[index];
      if (val === undefined || val === "") return;

      if (header === "id") {
        row.id = val;
        return;
      }

      if (header === "recipient") {
        row.recipient = val;
        return;
      }

      if (header === "amount" || header === "type" || header === "duration") {
        row[header] = toNumber(val, 0);
        return;
      }

      if (header === "cliffduration" || header === "cliff_duration") {
        row.cliffDuration = toNumber(val, 0);
        return;
      }

      if (header === "cancelable") {
        row.cancelable = toBoolean(val, true);
        return;
      }

      if (header === "mint") {
        row.mint = val;
        return;
      }

      if (header === "milestones") {
        row.milestones = values
          .slice(index)
          .map((value) => value.trim())
          .filter(Boolean)
          .join(";");
        return;
      }
    });

    rows.push(row);
  }

  return rows;
}

function pickFirstUnmatched(candidates: CsvDiffRecord[], matchedRefIds: Set<string>) {
  return candidates.find((candidate) => !matchedRefIds.has(candidate.matchKey)) ?? null;
}

function pushChange(changes: DiffChange[], field: string, oldVal: CsvPrimitive, newVal: CsvPrimitive) {
  if (oldVal === newVal) return;
  changes.push({ field, oldVal, newVal });
}

/**
 * Compute the diff between incoming CSV rows and a set of reference rows.
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

  const normalizedNewRows = newRows.map(normalizeCsvRecord);

  const normalizedRefRows = refStreams.map((stream) =>
    Object.prototype.hasOwnProperty.call(stream, "totalAmount") || Object.prototype.hasOwnProperty.call(stream, "vestingType")
      ? normalizeStreamRecord(stream)
      : normalizeCsvRecord(stream)
  );

  const refExactKeyBuckets = new Map<string, number[]>();
  const refIdentityKeyBuckets = new Map<string, number[]>();
  const consumedRefIndexes = new Set<number>();

  normalizedRefRows.forEach((stream, index) => {
    const exactKey = buildExactRecordKey(stream);
    const identityKey = buildIdentityRecordKey(stream);

    if (!refExactKeyBuckets.has(exactKey)) {
      refExactKeyBuckets.set(exactKey, []);
    }
    refExactKeyBuckets.get(exactKey)!.push(index);

    if (!refIdentityKeyBuckets.has(identityKey)) {
      refIdentityKeyBuckets.set(identityKey, []);
    }
    refIdentityKeyBuckets.get(identityKey)!.push(index);
  });

  const takeFirstUnusedIndex = (indexes: number[]) => indexes.find((index) => !consumedRefIndexes.has(index));

  if (mode === "create") {
    normalizedNewRows.forEach((row, idx) => {
      added.push({
        id: row.id || `StreamCSV-NEW-${idx}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        recipient: row.recipient || "Unknown Recipient",
        amount: row.amount,
        mint: row.mint || "Unknown Mint",
        type: row.type,
        duration: row.duration,
        cliffDuration: row.cliffDuration,
        cancelable: row.cancelable,
        milestones: row.milestones,
        isNew: true,
      });
    });

    normalizedRefRows.forEach((stream, idx) => {
      unchanged.push({
        id: stream.id || `StreamCSV-UNCH-${idx}`,
        recipient: stream.recipient,
        amount: stream.amount,
        duration: stream.duration,
        cliffDuration: stream.cliffDuration,
        cancelable: stream.cancelable,
        type: stream.type,
        milestones: stream.milestones,
      });
    });

    return { added, modified, deleted, unchanged };
  }

  normalizedNewRows.forEach((row, idx) => {
    const exactKey = buildExactRecordKey(normalizeCsvRecord(row));
    const identityKey = buildIdentityRecordKey(normalizeCsvRecord(row));

    const exactCandidateIndex = takeFirstUnusedIndex(refExactKeyBuckets.get(exactKey) || []);

    if (exactCandidateIndex !== undefined) {
      consumedRefIndexes.add(exactCandidateIndex);
      const matchedStream = normalizedRefRows[exactCandidateIndex];
      unchanged.push({
        id: matchedStream.id || row.id || `StreamCSV-UNCH-${idx}`,
        recipient: matchedStream.recipient,
        amount: matchedStream.amount,
        duration: matchedStream.duration,
        cliffDuration: matchedStream.cliffDuration,
        cancelable: matchedStream.cancelable,
        type: matchedStream.type,
        milestones: matchedStream.milestones,
      });
      return;
    }

    const identityCandidateIndex = takeFirstUnusedIndex(refIdentityKeyBuckets.get(identityKey) || []);

    if (!identityCandidateIndex && identityCandidateIndex !== 0) {
      added.push({
        id: row.id || `StreamCSV-NEW-${idx}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        recipient: row.recipient || "Unknown Recipient",
        amount: row.amount,
        mint: row.mint || "Unknown Mint",
        type: row.type,
        duration: row.duration,
        cliffDuration: row.cliffDuration,
        cancelable: row.cancelable,
        milestones: row.milestones,
        isNew: true,
      });
      return;
    }

    consumedRefIndexes.add(identityCandidateIndex);
    const matchedStream = normalizedRefRows[identityCandidateIndex];

    const changes: DiffChange[] = [];

    pushChange(changes, "amount", matchedStream.amount, row.amount);
    pushChange(changes, "cancelable", matchedStream.cancelable, row.cancelable);
    pushChange(changes, "duration", matchedStream.duration, row.duration);
    pushChange(changes, "cliffDuration", matchedStream.cliffDuration, row.cliffDuration);

    pushChange(changes, "milestones", matchedStream.milestones, row.milestones);

    if (changes.length > 0) {
      modified.push({
        id: matchedStream.id || row.id || `StreamCSV-MOD-${idx}`,
        recipient: matchedStream.recipient,
        changes,
        details: {
          creator: matchedStream.creator,
          mint: row.mint || matchedStream.mint,
          type: row.type,
          amount: row.amount,
          duration: row.duration,
          cliffDuration: row.cliffDuration,
          cancelable: row.cancelable,
          milestones: row.milestones,
        },
      });
    } else {
      unchanged.push({
        id: matchedStream.id || row.id || `StreamCSV-UNCH-${idx}`,
        recipient: matchedStream.recipient,
        amount: matchedStream.amount,
        duration: matchedStream.duration,
        cliffDuration: matchedStream.cliffDuration,
        cancelable: matchedStream.cancelable,
        type: matchedStream.type,
        milestones: matchedStream.milestones,
      });
    }
  });

  normalizedRefRows.forEach((stream, index) => {
    if (!consumedRefIndexes.has(index)) {
      deleted.push({
        id: stream.id,
        recipient: stream.recipient,
        amount: stream.amount,
        duration: stream.duration,
        cliffDuration: stream.cliffDuration,
        cancelable: stream.cancelable,
        type: stream.type,
        milestones: stream.milestones,
      });
    }
  });

  return { added, modified, deleted, unchanged };
}

/**
 * Utility to map CSV rows into diff-friendly records.
 */
export function mapCsvRowsToStreams(rows: CsvRow[]): any[] {
  return rows.map((row) => normalizeCsvRecord(row));
}
