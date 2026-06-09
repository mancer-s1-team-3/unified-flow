# @unifiedflow/unified-flow-sdk

TypeScript SDK for interacting with the **Unified Flow** on-chain token vesting and streaming protocol on Solana.

---

# Installation

```bash
npm install @unifiedflow/unified-flow-sdk
```

or

```bash
yarn add @unifiedflow/unified-flow-sdk
```

## Peer Dependencies

```bash
npm install \
  @coral-xyz/anchor \
  @solana/web3.js \
  @solana/spl-token
```

---

# Quick Start

## Initialize Client

```ts
import { useMemo } from "react";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { useConnection } from "@solana/wallet-adapter-react";

import {
  IDL,
  UnifiedFlowClient,
  type UnifiedFlow,
} from "@unifiedflow/unified-flow-sdk";

import { useWalletSession } from "@wallet-standard/react";

export function useUnifiedFlowClient() {
  const { connection } = useConnection();
  const wallet = useWalletSession();

  return useMemo(() => {
    if (!wallet) return null;

    const provider = new AnchorProvider(
      connection,
      {} as any,
      { commitment: "confirmed" }
    );

    const program = new Program(
      IDL,
      provider
    ) as Program<UnifiedFlow>;

    return new UnifiedFlowClient(
      program,
      wallet,
      connection,
      "confirmed"
    );
  }, [wallet, connection]);
}
```

---

# Transaction Status Tracking

All transaction methods support an optional status callback.

```ts
await client.withdraw(streamPDA, (status) => {
  switch (status) {
    case "wallet_approval":
      console.log("Waiting for wallet approval");
      break;

    case "sending":
      console.log("Sending transaction");
      break;

    case "confirming":
      console.log("Confirming transaction");
      break;
  }
});
```

Available phases:

```ts
type TxProgressPhase =
  | "wallet_approval"
  | "sending"
  | "confirming";
```

---

# Vesting Types

| Value | Type      | Description                        |
| ----- | --------- | ---------------------------------- |
| 0     | LINEAR    | Continuous linear vesting          |
| 1     | CLIFF     | Entire allocation unlocks at cliff |
| 2     | MILESTONE | Unlocks milestone-by-milestone     |

---

# API Reference

## createStream

Creates a new stream.

```ts
const result = await client.createStream(
  recipient,
  mint,
  new BN(1_000_000),
  new BN(startTs),
  new BN(cliffTs),
  new BN(endTs),
  0,
  [],
  new BN(nonce)
);

console.log(result.signature);
```

### Milestone Example

```ts
const milestones = [
  { amount: new BN(250_000) },
  { amount: new BN(250_000) },
  { amount: new BN(500_000) },
];

await client.createStream(
  recipient,
  mint,
  new BN(1_000_000),
  new BN(startTs),
  new BN(startTs),
  new BN(endTs),
  2,
  milestones,
  new BN(nonce)
);
```

Returns:

```ts
{
  signature: string;
}
```

---

## withdraw

Withdraw vested tokens.

```ts
const result = await client.withdraw(
  streamPDA
);

console.log(result.signature);
```

The recipient must be the connected wallet.

---

## cancel

Cancel a stream.

```ts
const result = await client.cancel(
  streamPDA
);

console.log(result.signature);
```

The creator must be the connected wallet.

---

## unlockMilestone

Unlock a milestone.

```ts
const result = await client.unlockMilestone(
  streamPDA,
  0
);

console.log(result.signature);
```

---

## editMilestone

Update a milestone allocation.

```ts
const result = await client.editMilestone(
  streamPDA,
  mint,
  milestoneIndex,
  new BN(newAmount)
);

console.log(result.signature);
```

---

## editCliff

Update the cliff timestamp.

```ts
const result = await client.editCliff(
  streamPDA,
  new BN(newCliffTs)
);

console.log(result.signature);
```

---

## editLinear

Extend a linear stream and/or deposit additional tokens.

```ts
const result = await client.editLinear(
  streamPDA,
  mint,
  new BN(newEndTs),
  new BN(topupAmount)
);

console.log(result.signature);
```

---

# PDA Helpers

```ts
import {
  getConfigPDA,
  getStreamPDA,
  getMilestonePDA,
  getFeeVaultPDA,
  getVaultATA,
} from "@unifiedflow/unified-flow-sdk";
```

### Stream PDA

```ts
const [streamPDA] = getStreamPDA(
  creator,
  recipient,
  nonce,
  programId
);
```

### Milestone PDA

```ts
const [milestonePDA] = getMilestonePDA(
  streamPDA,
  milestoneIndex,
  programId
);
```

---

# Chainlink Integration

Withdrawal fees are priced in USD and converted on-chain using Chainlink SOL/USD.

```ts
CHAINLINK_PROGRAM_ID
= HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny

SOL_USD_FEED
= 99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR
```

The SDK automatically includes these accounts during withdrawals.

---

# Error Reference

| Error                        | Description                           |
| ---------------------------- | ------------------------------------- |
| AccountDiscriminatorMismatch | Wrong cluster or incorrect account    |
| AccountNotInitialized        | PDA account does not exist            |
| InvalidMilestoneIndex        | Milestone index out of range          |
| StreamNotActive              | Stream already completed or cancelled |

---

# Network Support

| Network  | Status |
| -------- | ------ |
| Devnet   | ✅      |
| Mainnet  | ✅      |
| Localnet | ✅      |

---

# License

MIT
