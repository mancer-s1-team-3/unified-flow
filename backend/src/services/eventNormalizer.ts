type MaybeEventValue = unknown;

function firstDefined(event: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = event[key];
        if (value !== undefined && value !== null) {
            return value;
        }
    }

    return undefined;
}

function asString(value: MaybeEventValue): string | null {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === "string") {
        return value;
    }

    if (typeof value === "object" || typeof value === "bigint" || typeof value === "number" || typeof value === "boolean") {
        return value.toString();
    }

    return null;
}

function asBigInt(value: MaybeEventValue, fallback?: bigint): bigint | null {
    if (value === undefined || value === null) {
        return fallback ?? null;
    }

    try {
        return BigInt(value.toString());
    } catch {
        return fallback ?? null;
    }
}

function asNumber(value: MaybeEventValue, fallback?: number): number | null {
    if (value === undefined || value === null) {
        return fallback ?? null;
    }

    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : fallback ?? null;
}

function asBoolean(value: MaybeEventValue, fallback = false): boolean {
    if (value === undefined || value === null) {
        return fallback;
    }

    if (typeof value === "boolean") {
        return value;
    }

    const text = value.toString().toLowerCase();
    if (text === "true") return true;
    if (text === "false") return false;
    if (text === "1") return true;
    if (text === "0") return false;

    return fallback;
}

export function normalizeStreamCreated(event: Record<string, unknown>) {
    const stream = asString(firstDefined(event, ["stream", "streamKey", "stream_address"]));
    const creator = asString(firstDefined(event, ["creator"]));
    const recipient = asString(firstDefined(event, ["recipient"]));
    const mint = asString(firstDefined(event, ["mint"]));
    const vault = asString(firstDefined(event, ["vault"]));
    const totalAmount = asBigInt(firstDefined(event, ["total_amount", "totalAmount"]));
    const startTs = asBigInt(firstDefined(event, ["start_ts", "startTs"]));
    const cliffTsRaw = firstDefined(event, ["cliff_ts", "cliffTs"]);
    const endTs = asBigInt(firstDefined(event, ["end_ts", "endTs"]));
    const vestingType = asNumber(firstDefined(event, ["vesting_type", "vestingType"]), 0);
    const milestoneCount = asNumber(firstDefined(event, ["milestone_count", "milestoneCount"]), 0);
    const cancelable = asBoolean(firstDefined(event, ["cancelable"]), false);
    const nonce = asBigInt(firstDefined(event, ["nonce"]), 0n);

    if (!stream || !creator || !recipient || !mint || !vault || totalAmount === null || startTs === null || endTs === null || vestingType === null || milestoneCount === null || nonce === null) {
        return null;
    }

    return {
        stream,
        creator,
        recipient,
        mint,
        vault,
        totalAmount,
        startTs,
        cliffTs: asBigInt(cliffTsRaw, startTs) ?? startTs,
        endTs,
        vestingType,
        milestoneCount,
        cancelable,
        nonce,
    };
}

export function normalizeTokensClaimed(event: Record<string, unknown>) {
    const stream = asString(firstDefined(event, ["stream"]));
    const recipient = asString(firstDefined(event, ["recipient"]));
    const mint = asString(firstDefined(event, ["mint"]));
    const claimable = asBigInt(firstDefined(event, ["claimable"]));
    const feeLamports = asBigInt(firstDefined(event, ["fee_lamports", "feeLamports"]));
    const withdrawnTotal = asBigInt(firstDefined(event, ["withdrawn_total", "withdrawnTotal"]));

    if (!stream || !recipient || !mint || claimable === null || feeLamports === null || withdrawnTotal === null) {
        return null;
    }

    return {
        stream,
        recipient,
        mint,
        claimable,
        feeLamports,
        withdrawnTotal,
    };
}

export function normalizeMilestoneUnlocked(event: Record<string, unknown>) {
    const stream = asString(firstDefined(event, ["stream"]));
    const milestone = asString(firstDefined(event, ["milestone"]));
    const index = asNumber(firstDefined(event, ["index"]), 0);
    const amount = asBigInt(firstDefined(event, ["amount"]));
    const unlockTs = asBigInt(firstDefined(event, ["unlock_ts", "unlockTs"]));

    if (!stream || !milestone || index === null || amount === null) {
        return null;
    }

    return {
        stream,
        milestone,
        index,
        amount,
        unlockTs,
    };
}

export function normalizeStreamCancelled(event: Record<string, unknown>) {
    const stream = asString(firstDefined(event, ["stream"]));
    const creator = asString(firstDefined(event, ["creator"]));
    const recipient = asString(firstDefined(event, ["recipient"]));
    const vestedAmount = asBigInt(firstDefined(event, ["vested_amount", "vestedAmount"]));
    const returnedToCreator = asBigInt(firstDefined(event, ["returned_to_creator", "returnedToCreator"]));
    const claimableForRecipient = asBigInt(firstDefined(event, ["claimable_for_recipient", "claimableForRecipient"]));
    const timestamp = asBigInt(firstDefined(event, ["timestamp"]));

    if (!stream || !creator || !recipient || vestedAmount === null || returnedToCreator === null || claimableForRecipient === null || timestamp === null) {
        return null;
    }

    return {
        stream,
        creator,
        recipient,
        vestedAmount,
        returnedToCreator,
        claimableForRecipient,
        timestamp,
    };
}

export function normalizeMilestoneEdited(event: Record<string, unknown>) {
    const stream = asString(firstDefined(event, ["stream"]));
    const milestone = asString(firstDefined(event, ["milestone"]));
    const index = asNumber(firstDefined(event, ["index"]), 0);
    const oldAmount = asBigInt(firstDefined(event, ["old_amount", "oldAmount"]));
    const newAmount = asBigInt(firstDefined(event, ["new_amount", "newAmount"]));
    const timestamp = asBigInt(firstDefined(event, ["timestamp"]));

    if (!stream || !milestone || index === null || oldAmount === null || newAmount === null || timestamp === null) {
        return null;
    }

    return {
        stream,
        milestone,
        index,
        oldAmount,
        newAmount,
        timestamp,
    };
}

export function normalizeLinearEdited(event: Record<string, unknown>) {
    const stream = asString(firstDefined(event, ["stream"]));
    const oldEndTs = asBigInt(firstDefined(event, ["old_end_ts", "oldEndTs"]));
    const newEndTs = asBigInt(firstDefined(event, ["new_end_ts", "newEndTs"]));
    const oldTotalAmount = asBigInt(firstDefined(event, ["old_total_amount", "oldTotalAmount"]));
    const newTotalAmount = asBigInt(firstDefined(event, ["new_total_amount", "newTotalAmount"]));
    const topupAmount = asBigInt(firstDefined(event, ["topup_amount", "topupAmount"]));
    const timestamp = asBigInt(firstDefined(event, ["timestamp"]));

    if (!stream || oldEndTs === null || newEndTs === null || oldTotalAmount === null || newTotalAmount === null || topupAmount === null || timestamp === null) {
        return null;
    }

    return {
        stream,
        oldEndTs,
        newEndTs,
        oldTotalAmount,
        newTotalAmount,
        topupAmount,
        timestamp,
    };
}

export function normalizeCliffEdited(event: Record<string, unknown>) {
    const stream = asString(firstDefined(event, ["stream"]));
    const oldCliffTs = asBigInt(firstDefined(event, ["old_cliff_ts", "oldCliffTs"]));
    const newCliffTs = asBigInt(firstDefined(event, ["new_cliff_ts", "newCliffTs"]));
    const timestamp = asBigInt(firstDefined(event, ["timestamp"]));

    if (!stream || oldCliffTs === null || newCliffTs === null || timestamp === null) {
        return null;
    }

    return {
        stream,
        oldCliffTs,
        newCliffTs,
        timestamp,
    };
}
