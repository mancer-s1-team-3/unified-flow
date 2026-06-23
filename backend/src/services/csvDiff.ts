import { PublicKey } from "@solana/web3.js";

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
  mode?: "create" | "edit";
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

function parseMilestoneParts(value: unknown) {
  const raw = normalizeMilestones(value);
  if (!raw) return [] as string[];

  return raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

function rebalanceMilestonesToBaseUnits(
  totalAmountBaseUnits: number,
  milestoneCount: number
) {
  const normalizedCount = Math.floor(milestoneCount);
  if (!Number.isFinite(totalAmountBaseUnits) || normalizedCount <= 0) {
    return "";
  }

  const baseShare = Math.floor(totalAmountBaseUnits / normalizedCount);
  const remainder = totalAmountBaseUnits % normalizedCount;

  return Array.from({ length: normalizedCount }, (_, index) =>
    String(baseShare + (index < remainder ? 1 : 0))
  ).join(";");
}

function formatMilestonePartToBaseUnits(part: string, decimals: number) {
  return String(toBaseUnits(toNumber(part, 0), decimals));
}

// ── NEW: convert a human-readable token amount (e.g. "2" for 2 USDC) into
// raw base units (e.g. 2_000_000 for 6 decimals), matching the scale that
// normalizeStreamRecord() already uses for on-chain stream.totalAmount.
// Math.round (not truncate) avoids floating point drift like 1.999999996.
function toBaseUnits(humanAmount: number, decimals: number): number {
  if (!Number.isFinite(humanAmount) || humanAmount === 0) return 0;
  return Math.round(humanAmount * Math.pow(10, decimals));
}

function normalizeCsvRecord(
  row: CsvRow | CsvDiffRecord,
  decimals: number = 0
): CsvDiffRecord {
  const recipient = String(row.recipient ?? "").trim();
  const id = row.id ? String(row.id).trim() : undefined;
  const amount = toBaseUnits(toNumber(row.amount, 0), decimals);
  const milestoneParts = parseMilestoneParts(row.milestones);
  const milestones =
    Number(row.type ?? 0) === 2 && milestoneParts.length > 0
      ? (() => {
          const parsedMilestoneTotal = milestoneParts.reduce(
            (sum, part) => sum + toBaseUnits(toNumber(part, 0), decimals),
            0
          );

          if (parsedMilestoneTotal === amount) {
            return milestoneParts
              .map((part) => formatMilestonePartToBaseUnits(part, decimals))
              .join(";");
          }

          return rebalanceMilestonesToBaseUnits(amount, milestoneParts.length);
        })()
      : normalizeMilestones(row.milestones);

  return {
    matchKey:
      id ||
      (recipient
        ? `recipient:${recipient.toLowerCase()}`
        : `row:${Math.random().toString(36).slice(2, 10)}`),
    id,
    recipient,
    // CSV "amount" is always human-readable (e.g. "2" = 2 tokens), so it must be
    // scaled to base units here to match normalizeStreamRecord()'s output —
    // otherwise rows from CSV and rows from the DB end up mixed at different
    // scales inside the same added/modified/unchanged arrays.
    amount,
    mint: String(row.mint ?? "").trim(),
    type: toNumber(row.type, 0),
    duration: toNumber(row.duration, 0),
    cliffDuration: toNumber(row.cliffDuration, 0),
    cancelable: toBoolean(row.cancelable, true),
    milestones,
    creator: row.creator,
  };
}

function normalizeStreamRecord(stream: any): CsvDiffRecord {
  const recipient = String(stream.recipient ?? "").trim();
  const id = stream.id ? String(stream.id).trim() : undefined;

  return {
    matchKey:
      id ||
      (recipient
        ? `recipient:${recipient.toLowerCase()}`
        : `row:${Math.random().toString(36).slice(2, 10)}`),
    id,
    recipient,
    // stream.totalAmount is already raw base units (BigInt from Prisma) —
    // no scaling needed here, this was always correct.
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

export function buildExactRecordKey(
  record: Pick<
    CsvDiffRecord,
    | "recipient"
    | "mint"
    | "type"
    | "amount"
    | "duration"
    | "cliffDuration"
    | "cancelable"
    | "milestones"
  >
) {
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

function buildIdentityRecordKey(
  record: Pick<CsvDiffRecord, "recipient" | "mint" | "type">
) {
  return [
    record.recipient.trim().toLowerCase(),
    record.mint.trim(),
    record.type,
  ].join("|");
}

/**
 * Robust CSV parser that parses text into key-value objects, converting numeric and boolean fields appropriately.
 *
 * NOTE: `row.amount` returned here is intentionally left as the raw
 * human-readable number written in the CSV (e.g. 2, not 2_000_000). Scaling
 * to base units happens later in normalizeCsvRecord(), once the per-row mint
 * decimals are known — callers needing the raw CSV value (e.g.
 * validateCsvContent) keep working unchanged.
 */
export function parseCsvText(csvText: string): CsvRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return [];

  const headers = lines[0]
    .split(",")
    .map((header) => header.trim().toLowerCase());
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

const MAX_CSV_ROWS = 500;
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isValidPubkey(value: string): boolean {
  const v = value.trim();
  if (!BASE58_REGEX.test(v)) return false;
  try {
    new PublicKey(v);
    return true;
  } catch {
    return false;
  }
}

/**
 * Server-side content validation for uploaded CSV payloads. Mirrors (a loose
 * superset of) the frontend checks so the backend never blindly persists garbage
 * — but is deliberately a *subset* (skips per-mint precision / DB-aware duration
 * rules) so any payload the gated UI accepts also passes here. Returns a list of
 * human-readable error messages; empty array means valid.
 */
export function validateCsvContent(
  content: string,
  mode: "create" | "edit"
): string[] {
  const errors: string[] = [];
  if (typeof content !== "string" || content.trim() === "") {
    return ["CSV content is empty."];
  }
  if (content.charCodeAt(0) === 0xfeff) {
    errors.push(
      "File starts with a byte-order mark (BOM). Re-save as UTF-8 without BOM."
    );
  }

  const lines = content
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    errors.push("CSV must contain a header row and at least one data row.");
    return errors;
  }

  const headerLine = lines[0];
  if (!headerLine.includes(",") && /[;\t|]/.test(headerLine)) {
    errors.push(
      "CSV must be comma-delimited (found ';', tab, or '|' in the header)."
    );
    return errors;
  }

  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());
  const at = (name: string) => headers.indexOf(name);
  const recipientIdx = at("recipient");
  const amountIdx = at("amount");
  const typeIdx = at("type");
  const mintIdx = at("mint");
  const idIdx = at("id");
  const milestonesIdx = at("milestones");

  const missing: string[] = [];
  if (mode === "create") {
    if (recipientIdx === -1) missing.push("recipient");
    if (amountIdx === -1) missing.push("amount");
    if (typeIdx === -1) missing.push("type");
  } else if (idIdx === -1 && recipientIdx === -1) {
    missing.push("id (or recipient)");
  }
  if (missing.length) {
    errors.push(`Missing required column(s): ${missing.join(", ")}.`);
  }

  const dataRows = lines.length - 1;
  if (dataRows > MAX_CSV_ROWS) {
    errors.push(`Too many rows (${dataRows}). Max ${MAX_CSV_ROWS} per upload.`);
  }

  const isNumeric = (raw: string) => /^\d+(\.\d+)?$/.test(raw.trim());
  const minCols = milestonesIdx !== -1 ? milestonesIdx : headers.length;
  const seenRow = new Map<string, number>();
  const seenId = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i;
    const values = lines[i].split(",").map((v) => v.trim());

    if (values.length < minCols) {
      errors.push(
        `Row ${rowNum}: malformed — expected at least ${minCols} columns, found ${values.length}.`
      );
      continue;
    }

    const typeRaw = typeIdx !== -1 ? values[typeIdx] ?? "" : "";

    if (mode === "create") {
      if (typeIdx !== -1 && !/^[012]$/.test(typeRaw)) {
        errors.push(
          `Row ${rowNum}: type must be 0 (linear), 1 (cliff), or 2 (milestone).`
        );
      }
      const recipient = recipientIdx !== -1 ? values[recipientIdx] ?? "" : "";
      if (!recipient.trim()) {
        errors.push(`Row ${rowNum}: recipient is required.`);
      } else if (!isValidPubkey(recipient)) {
        errors.push(`Row ${rowNum}: recipient is not a valid Solana address.`);
      }
      const mintVal = mintIdx !== -1 ? values[mintIdx] ?? "" : "";
      if (mintVal.trim() && !isValidPubkey(mintVal)) {
        errors.push(`Row ${rowNum}: mint is not a valid Solana address.`);
      }
      const amtRaw = amountIdx !== -1 ? values[amountIdx] ?? "" : "";
      if (!amtRaw.trim()) {
        errors.push(`Row ${rowNum}: amount is required.`);
      } else if (!isNumeric(amtRaw) || Number(amtRaw) <= 0) {
        errors.push(`Row ${rowNum}: amount must be a positive number.`);
      }
      // Milestone (type 2): milestone amounts must be present and positive.
      // We intentionally do NOT require the milestone sum to equal the row
      // amount: a mismatch is auto-rebalanced at create time (frontend
      // buildCsvCreateInput + normalizeCsvRecord's rebalanceMilestonesToBaseUnits),
      // so rejecting it here would block the very payloads the gated UI accepts.
      if (typeRaw === "2" && milestonesIdx !== -1 && isNumeric(amtRaw)) {
        const parts = values
          .slice(milestonesIdx)
          .map((v) => v.trim())
          .filter(Boolean);
        if (parts.length === 0) {
          errors.push(
            `Row ${rowNum}: milestone stream requires milestone amounts.`
          );
        } else if (!parts.every(isNumeric)) {
          errors.push(
            `Row ${rowNum}: milestone amounts must all be positive numbers.`
          );
        }
      }
      const rowKey = values.join("|").toLowerCase();
      if (seenRow.has(rowKey)) {
        errors.push(
          `Row ${rowNum}: identical to row ${seenRow.get(
            rowKey
          )} — remove the duplicate.`
        );
      } else {
        seenRow.set(rowKey, rowNum);
      }
    } else {
      if (typeIdx !== -1 && typeRaw.trim() && !/^[012]$/.test(typeRaw)) {
        errors.push(`Row ${rowNum}: type must be 0, 1, or 2.`);
      }
      const amtRaw = amountIdx !== -1 ? values[amountIdx] ?? "" : "";
      if (amtRaw.trim() && (!isNumeric(amtRaw) || Number(amtRaw) <= 0)) {
        errors.push(`Row ${rowNum}: amount must be a positive number.`);
      }
      const id = idIdx !== -1 ? (values[idIdx] ?? "").trim() : "";
      if (id) {
        if (seenId.has(id)) {
          errors.push(
            `Row ${rowNum}: duplicate id — already edited in row ${seenId.get(
              id
            )}.`
          );
        } else {
          seenId.set(id, rowNum);
        }
      }
    }
  }

  return errors;
}

function pickFirstUnmatched(
  candidates: CsvDiffRecord[],
  matchedRefIds: Set<string>
) {
  return (
    candidates.find((candidate) => !matchedRefIds.has(candidate.matchKey)) ??
    null
  );
}

function pushChange(
  changes: DiffChange[],
  field: string,
  oldVal: CsvPrimitive,
  newVal: CsvPrimitive
) {
  if (oldVal === newVal) return;
  changes.push({ field, oldVal, newVal });
}

/**
 * Compute the diff between incoming CSV rows and a set of reference rows.
 *
 * @param decimalsByMint Optional map of mint address -> decimals, used to
 * scale each CSV row's human-readable `amount` into raw base units so it's
 * comparable with `refStreams[].totalAmount` (which is already base units
 * straight from the on-chain/Prisma data). Without this, CSV rows and DB
 * rows end up at different numeric scales inside the same added/modified/
 * unchanged arrays (e.g. "2" vs "2000000" for the same 2-USDC stream).
 * @param fallbackDecimals Decimals to use when a row's mint isn't present in
 * decimalsByMint (unknown/custom mint). Defaults to 6, matching the
 * USDC-style fallback already used throughout the frontend.
 */
export function computeCsvDiff(
  newRows: CsvRow[],
  refStreams: any[],
  mode: "create" | "edit",
  decimalsByMint: Map<string, number> = new Map(),
  fallbackDecimals: number = 6
): CsvDiffResult {
  const added: any[] = [];
  const modified: DiffItem[] = [];
  const deleted: any[] = [];
  const unchanged: any[] = [];

  const resolveDecimals = (mint: string | undefined) => {
    if (!mint || mint.trim() === "") return fallbackDecimals;
    return decimalsByMint.get(mint.trim()) ?? fallbackDecimals;
  };

  const normalizedNewRows = newRows.map((row) =>
    normalizeCsvRecord(row, resolveDecimals(row.mint))
  );

  const normalizedRefRows = refStreams.map((stream) =>
    Object.prototype.hasOwnProperty.call(stream, "totalAmount") ||
    Object.prototype.hasOwnProperty.call(stream, "vestingType")
      ? normalizeStreamRecord(stream)
      : normalizeCsvRecord(stream, resolveDecimals(stream.mint))
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

  const takeFirstUnusedIndex = (indexes: number[]) =>
    indexes.find((index) => !consumedRefIndexes.has(index));

  if (mode === "create") {
    normalizedNewRows.forEach((row, idx) => {
      added.push({
        id:
          row.id ||
          `StreamCSV-NEW-${idx}-${Math.random()
            .toString(36)
            .substring(2, 6)
            .toUpperCase()}`,
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
        mint: stream.mint, // FIX: was missing — caused unchanged items to lose
        // their mint, so CsvDiffPanel fell back to the parent's
        // selectedMint (e.g. USDC) instead of the stream's real mint (e.g. WSOL).
        duration: stream.duration,
        cliffDuration: stream.cliffDuration,
        cancelable: stream.cancelable,
        type: stream.type,
        milestones: stream.milestones,
      });
    });

    return { added, modified, deleted: [], unchanged, mode };
  }

  normalizedNewRows.forEach((row, idx) => {
    if (mode === "edit" && row.id) {
      const normalizedRowId = row.id.trim();
      const refIndexById = normalizedRefRows.findIndex(
        (refRow, refIndex) =>
          !consumedRefIndexes.has(refIndex) &&
          String(refRow.id || "").trim() === normalizedRowId
      );

      if (refIndexById >= 0) {
        consumedRefIndexes.add(refIndexById);
        const matchedStream = normalizedRefRows[refIndexById];
        const changes: DiffChange[] = [];

        pushChange(changes, "amount", matchedStream.amount, row.amount);
        pushChange(changes, "duration", matchedStream.duration, row.duration);
        pushChange(
          changes,
          "cliffDuration",
          matchedStream.cliffDuration,
          row.cliffDuration
        );
        pushChange(
          changes,
          "milestones",
          matchedStream.milestones,
          row.milestones
        );

        if (changes.length > 0) {
          modified.push({
            id: matchedStream.id || normalizedRowId || `StreamCSV-MOD-${idx}`,
            recipient: matchedStream.recipient,
            changes,
            details: {
              creator: matchedStream.creator,
              mint: matchedStream.mint,
              type: matchedStream.type,
              amount: row.amount,
              duration: row.duration,
              cliffDuration: row.cliffDuration,
              milestones: row.milestones,
            },
          });
        } else {
          unchanged.push({
            id: matchedStream.id || normalizedRowId || `StreamCSV-UNCH-${idx}`,
            recipient: matchedStream.recipient,
            amount: matchedStream.amount,
            mint: matchedStream.mint, // FIX: was missing
            duration: matchedStream.duration,
            cliffDuration: matchedStream.cliffDuration,
            cancelable: matchedStream.cancelable,
            type: matchedStream.type,
            milestones: matchedStream.milestones,
          });
        }
      }

      return;
    }

    const exactKey = buildExactRecordKey(
      normalizeCsvRecord(row, resolveDecimals(row.mint))
    );
    const identityKey = buildIdentityRecordKey(
      normalizeCsvRecord(row, resolveDecimals(row.mint))
    );

    const exactCandidateIndex = takeFirstUnusedIndex(
      refExactKeyBuckets.get(exactKey) || []
    );

    if (exactCandidateIndex !== undefined) {
      consumedRefIndexes.add(exactCandidateIndex);
      const matchedStream = normalizedRefRows[exactCandidateIndex];
      unchanged.push({
        id: matchedStream.id || row.id || `StreamCSV-UNCH-${idx}`,
        recipient: matchedStream.recipient,
        amount: matchedStream.amount,
        mint: matchedStream.mint, // FIX: was missing
        duration: matchedStream.duration,
        cliffDuration: matchedStream.cliffDuration,
        cancelable: matchedStream.cancelable,
        type: matchedStream.type,
        milestones: matchedStream.milestones,
      });
      return;
    }

    const identityCandidateIndex = takeFirstUnusedIndex(
      refIdentityKeyBuckets.get(identityKey) || []
    );

    if (!identityCandidateIndex && identityCandidateIndex !== 0) {
      // Edit mode represents updates to existing on-chain streams only.
      return;
    }

    consumedRefIndexes.add(identityCandidateIndex);
    const matchedStream = normalizedRefRows[identityCandidateIndex];

    const changes: DiffChange[] = [];

    pushChange(changes, "amount", matchedStream.amount, row.amount);
    pushChange(changes, "duration", matchedStream.duration, row.duration);
    pushChange(
      changes,
      "cliffDuration",
      matchedStream.cliffDuration,
      row.cliffDuration
    );

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
        mint: matchedStream.mint, // FIX: was missing
        duration: matchedStream.duration,
        cliffDuration: matchedStream.cliffDuration,
        cancelable: matchedStream.cancelable,
        type: matchedStream.type,
        milestones: matchedStream.milestones,
      });
    }
  });

  return { added: [], modified, deleted: [], unchanged, mode };
}

/**
 * Utility to map CSV rows into diff-friendly records.
 *
 * NOTE: this maps rows at decimals=0 (no scaling) since callers (currently
 * only the historical-CSV-as-reference-for-edit-mode path in server.ts) treat
 * the result as a reference snapshot, not as something compared directly
 * against a fresh CSV upload's already-scaled amounts in this same pass.
 * If this utility starts feeding into computeCsvDiff's create-mode amount
 * comparisons against live CSV rows, it will need the same decimals
 * treatment as normalizedRefRows does above.
 */
export function mapCsvRowsToStreams(rows: CsvRow[]): any[] {
  return rows.map((row) => normalizeCsvRecord(row));
}
