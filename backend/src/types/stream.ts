export interface StreamAccount {
    creator: string;
    recipient: string;

    mint: string;
    vault: string;

    totalAmount: bigint;
    withdrawn: bigint;

    startTs: bigint;
    cliffTs: bigint;
    endTs: bigint;
    completedAt?: bigint | null;

    vestingType: number;
    status: number;

    cancelable: boolean;
    milestoneCount: number;

    nonce: bigint;
    bump: number;
}
