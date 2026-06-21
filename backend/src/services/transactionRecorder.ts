import prisma from "../db/prisma";

export function txRowId(signature: string, streamId: string | null | undefined): string {
    return streamId ? `${signature}:${streamId}` : signature;
}

export async function recordTransaction(args: {
    signature: string;
    slot: bigint | number | string;
    streamId: string | null;
    type: string;
    raw: unknown;
}): Promise<void> {
    const id = txRowId(args.signature, args.streamId);
    await prisma.transaction.upsert({
        where: { id },
        update: {},
        create: {
            id,
            signature: args.signature,
            slot: BigInt(args.slot),
            streamId: args.streamId,
            type: args.type,
            raw: JSON.parse(JSON.stringify(args.raw)),
        },
    });
}
