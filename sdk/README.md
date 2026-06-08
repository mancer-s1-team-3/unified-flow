# @unifiedflow/unified-flow-sdk

TypeScript SDK for interacting with the **Unified Flow** on-chain token vesting and streaming program on Solana.

---

## Installation

```bash
npm install @unifiedflow/unified-flow-sdk
# or
yarn add @unifiedflow/unified-flow-sdk
```

### Peer Dependencies

```bash
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token
```

> **Version note:** Make sure your project uses the same `@coral-xyz/anchor` version as the SDK to avoid type conflicts. Add to `package.json` if needed:
> ```json
> { "overrides": { "@coral-xyz/anchor": "<sdk-anchor-version>" } }
> ```

---

## Quick Start

### 1. Initialize the Client

```typescript
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { IDL, UnifiedFlow, UnifiedFlowClient } from "@unifiedflow/unified-flow-sdk";
import { useMemo } from "react";

export function useUnifiedFlowClient() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet) return null;

    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });

    const program = new Program(IDL, provider) as any;
    return new UnifiedFlowClient(program);
  }, [wallet, connection]);
}
```

### 2. Use in a Component

```typescript
const client = useUnifiedFlowClient();

if (!client) return <p>Connect your wallet</p>;
```

---

## Vesting Types

| Value | Type        | Description                                      |
|-------|-------------|--------------------------------------------------|
| `0`   | `LINEAR`    | Tokens vest continuously over time               |
| `1`   | `CLIFF`     | All tokens unlock at a single cliff timestamp    |
| `2`   | `MILESTONE` | Tokens unlock per milestone, approved by creator |

---

## API Reference

### `createStream`

Create a new vesting stream.

```typescript
const builder = await client.createStream(
  creator,          // PublicKey — stream creator / funder
  recipient,        // PublicKey — token recipient
  mint,             // PublicKey — SPL token mint
  new BN(1_000_000),// amount — total tokens (in smallest unit)
  new BN(startTs),  // start timestamp (Unix seconds)
  new BN(cliffTs),  // cliff timestamp (set equal to startTs if no cliff)
  new BN(endTs),    // end timestamp
  0,                // vestingType: 0 = linear, 1 = cliff, 2 = milestone
  [],               // milestones: MilestoneInput[] (empty for non-milestone)
  new BN(nonce)     // unique nonce per creator+recipient pair
);

const txSig = await builder.rpc();
```

**Milestone stream example:**

```typescript
const milestones: MilestoneInput[] = [
  { amount: new BN(250_000) },
  { amount: new BN(250_000) },
  { amount: new BN(500_000) },
];

const builder = await client.createStream(
  creator, recipient, mint,
  new BN(1_000_000),
  new BN(startTs), new BN(startTs), new BN(endTs),
  2,           // MILESTONE
  milestones,
  new BN(nonce)
);
```

---

### `withdraw`

Withdraw vested/unlocked tokens from a stream. Callable by the recipient.

```typescript
const builder = await client.withdraw(
  streamPDA,  // PublicKey — stream account address
  recipient,  // PublicKey
  mint        // PublicKey
);

const txSig = await builder.rpc();
```

---

### `cancel`

Cancel an active stream. Returns unvested tokens to the creator. Callable by the creator.

```typescript
const builder = await client.cancel(
  streamPDA,  // PublicKey — stream account address
  creator,    // PublicKey
  recipient,  // PublicKey
  mint        // PublicKey
);

const txSig = await builder.rpc();
```

---

### `unlockMilestone`

Unlock the next milestone in a milestone vesting stream. Callable by the creator.

```typescript
const builder = await client.unlockMilestone(
  streamPDA,       // PublicKey
  creator,         // PublicKey
  milestoneIndex   // number — 0-indexed
);

const txSig = await builder.rpc();
```

---

### `editMilestone`

Change the token amount for a specific milestone (before it is unlocked).

```typescript
const builder = await client.editMilestone(
  streamPDA,
  creator,
  mint,
  milestoneIndex,    // number
  new BN(newAmount)  // BN
);

const txSig = await builder.rpc();
```

---

### `editCliff`

Update the cliff timestamp on a cliff vesting stream.

```typescript
const builder = await client.editCliff(
  streamPDA,
  creator,
  new BN(newCliffTs)
);

const txSig = await builder.rpc();
```

---

### `editLinear`

Extend the end timestamp and/or top up tokens on a linear vesting stream. Both operations happen in a single transaction.

```typescript
const builder = await client.editLinear(
  streamPDA,
  creator,
  mint,
  new BN(newEndTs),    // new end timestamp
  new BN(topupAmount)  // additional tokens to deposit (0 if no top-up)
);

const txSig = await builder.rpc();
```

---

## PDA Helpers

The SDK exports PDA derivation utilities if you need raw account addresses:

```typescript
import {
  getConfigPDA,
  getStreamPDA,
  getMilestonePDA,
  getFeeVaultPDA,
  getVaultATA,
} from "@unifiedflow/unified-flow-sdk";

const [streamPDA] = getStreamPDA(creator, recipient, nonce, programId);
const [milestonePDA] = getMilestonePDA(streamPDA, milestoneIndex, programId);
```

---

## Chainlink Oracle

Withdrawal fees are denominated in USD and calculated on-chain via the Chainlink SOL/USD price feed. The SDK wires this up automatically — no extra configuration needed.

| Constant              | Value                                        |
|-----------------------|----------------------------------------------|
| `CHAINLINK_PROGRAM_ID`| `HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny` |
| `SOL_USD_FEED`        | `99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR` |

---

## Builder Pattern

All client methods return an **Anchor instruction builder**. You have three options:

```typescript
const builder = await client.withdraw(streamPDA, recipient, mint);

// Execute and return transaction signature
const txSig = await builder.rpc();

// Build a Transaction object (e.g. for simulation or custom signing)
const tx = await builder.transaction();

// Simulate without sending
const result = await builder.simulate();
```

---

## Error Reference

| Error                         | Likely Cause                                              |
|-------------------------------|-----------------------------------------------------------|
| `AccountDiscriminatorMismatch`| Wrong cluster (e.g. calling devnet PDA on mainnet RPC)    |
| `AccountNotInitialized`       | Stream or milestone PDA does not exist yet                |
| `InvalidMilestoneIndex`       | `milestoneIndex` out of range                             |
| `StreamNotActive`             | Stream already cancelled or fully vested                  |

---

## Network Support

| Network | Status |
|---------|--------|
| Devnet  | ✅ Supported |
| Mainnet | ✅ Supported |
| Localnet| ✅ Supported (bankrun / solana-test-validator) |

---

## License

MIT