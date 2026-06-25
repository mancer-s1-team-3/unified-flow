---
name: "unified-flow"
title: "Solana Token Distribution AI Agent Skills & Capabilities"
description: "Comprehensive skill and tool specification for AI agents interacting with Unified Flow on Solana"
category: "AI Agents"
tags:
  - solana
  - unifiedflow
  - vesting
  - streaming
  - milestones
  - mcp
  - cli
  - ai-agents
---

# 🧠 Unified Flow AI Agent Skills & Capabilities

This document defines the capabilities, operational boundaries, and workflow patterns available to AI agents interacting with the Unified Flow Protocol.

Unified Flow enables programmable token vesting, milestone-based distributions, and streaming payments on Solana.

---

# 🛠️ 1. Core Protocol Skills

## 🪙 Skill A: Vesting Stream Management

AI agents can:

* Create Linear Vesting Streams
* Create Cliff Vesting Streams
* Create Milestone Vesting Streams
* Verify stream state directly on-chain
* Track vesting progress
* Calculate vested and claimable balances
* Monitor stream lifecycle status

Supported vesting models:

| Type      | Value | Description                                            |
| --------- | ----- | ------------------------------------------------------ |
| Linear    | 0     | Continuous token release over time                     |
| Cliff     | 1     | Entire allocation unlocks at cliff timestamp           |
| Milestone | 2     | Tokens unlock sequentially through milestone approvals |

---

## 🔐 Skill B: Milestone Orchestration

AI agents can:

* Derive milestone PDAs
* Verify milestone accounts
* Unlock milestones sequentially
* Edit locked milestone allocations
* Track milestone progress
* Validate milestone totals

Milestone PDA derivation:

```text
[b"milestone", streamPda, [index_u8]]
```

Example:

```text
Milestone 0
Milestone 1
Milestone 2
...
```

Unlock order is strictly sequential.

---

## ✏️ Skill C: Stream Modification

AI agents can modify active streams.

### Edit Milestone

Adjust locked milestone allocations.

Supported actions:

* Increase milestone allocation
* Decrease milestone allocation
* Automatically rebalance vault accounting

### Edit Cliff

Modify cliff timestamp before withdrawals occur.

Supported actions:

* Move cliff later
* Move cliff earlier (subject to protocol rules)

### Edit Linear

Modify an active linear stream.

Supported actions:

* Extend end timestamp
* Add additional tokens
* Perform extension and top-up in a single transaction

---

## 💸 Skill D: Claims & Liquidity Management

AI agents can:

* Withdraw vested tokens
* Calculate claimable balances
* Monitor vault balances
* Handle fee calculations
* Recover funds through cancellation

Supported actions:

### Withdraw

Transfer claimable tokens from stream vault to recipient ATA.

### Cancel

Cancel active streams.

Protocol behavior:

* Unvested tokens return to creator
* Claimable tokens remain withdrawable by recipient

---

## 📊 Skill E: Stream Monitoring & Verification

Agents can inspect:

* Creator address
* Recipient address
* Token mint
* Stream vault
* Start timestamp
* Cliff timestamp
* End timestamp
* Total allocation
* Withdrawn amount
* Stream status
* Milestone states

Supported lifecycle states:

| Status    | Description                |
| --------- | -------------------------- |
| Active    | Stream currently vesting   |
| Completed | Fully vested and withdrawn |
| Cancelled | Stream terminated          |
| Unknown   | Reserved state             |

---

# 🔌 2. MCP Tools Reference

| Tool                 | Type        | Description                    |
| -------------------- | ----------- | ------------------------------ |
| get_streams          | Query       | Fetch indexed streams          |
| get_stream_details   | Read        | Read raw on-chain stream state |
| get_protocol_config  | Read        | Read protocol configuration    |
| create_stream        | Transaction | Create vesting stream          |
| withdraw_from_stream | Transaction | Withdraw vested tokens         |
| cancel_stream        | Transaction | Cancel stream                  |
| unlock_milestone     | Transaction | Unlock next milestone          |
| edit_milestone       | Transaction | Modify milestone allocation    |
| edit_cliff           | Transaction | Modify cliff timestamp         |
| initialize_protocol  | Transaction | Initialize protocol config     |

---

# 💻 3. SDK Capabilities

The Unified Flow SDK exposes strongly typed methods for AI-assisted development.

Available methods:

```typescript
createStream(...)
withdraw(...)
cancel(...)
unlockMilestone(...)
editMilestone(...)
editCliff(...)
editLinear(...)
```

Builder pattern support:

```typescript
const builder = await client.withdraw(...);

await builder.rpc();
await builder.transaction();
await builder.simulate();
```

AI agents can generate:

* Frontend integrations
* Backend automation
* Wallet workflows
* Custom transaction pipelines
* Testing scripts

---

# 📟 4. CLI Command Reference

## Read Commands

```bash
unifiedflow config
```

```bash
unifiedflow view <streamAddress>
```

---

## Create Commands

Linear stream:

```bash
unifiedflow create <recipient> <mint> 10000 0 2592000
```

Cliff stream:

```bash
unifiedflow create <recipient> <mint> 10000 1 2592000
```

Milestone stream:

```bash
unifiedflow create <recipient> <mint> 1000 2 300,300,400
```

---

## Management Commands

Withdraw:

```bash
unifiedflow withdraw <streamAddress>
```

Cancel:

```bash
unifiedflow cancel <streamAddress>
```

Unlock milestone:

```bash
unifiedflow unlock <streamAddress>
```

Edit milestone:

```bash
unifiedflow edit-milestone <streamAddress> <index> <amount>
```

Edit cliff:

```bash
unifiedflow edit-cliff <streamAddress> <timestamp>
```

---

## Utility Commands

Display version information:

```bash
unifiedflow version
```

```bash
unifiedflow -v
```

```bash
unifiedflow --version
```

Output:

```text
Unified Flow CLI

Version: 1.x.x
Program ID: ...
RPC: ...
```

---

# 🌐 5. Network Support

| Network  | Supported |
| -------- | --------- |
| Devnet   | Yes       |
| Mainnet  | Yes       |
| Localnet | Yes       |

Supported environments:

* solana-test-validator
* Bankrun
* Devnet
* Mainnet

---

# 🛡️ 6. Safety Rules

AI agents MUST enforce the following constraints.

## Rule 1 — Milestone Sum Validation

For milestone streams:

```text
sum(milestones) == totalAmount
```

must always hold.

---

## Rule 2 — Sequential Unlocking

Milestones must be unlocked in order.

Valid:

```text
0 → 1 → 2 → 3
```

Invalid:

```text
0 → 2
```

---

## Rule 3 — Chainlink Dependency

Withdrawals depend on:

```text
99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR
```

If feed data becomes stale, withdrawals may be rejected.

---

## Rule 4 — Cliff Editing Restrictions

Cliff updates are only allowed before withdrawal activity and subject to protocol constraints.

---

## Rule 5 — Cluster Consistency

All PDAs, token accounts, and RPC endpoints must belong to the same Solana cluster.

---

## Rule 6 — Completed Streams

Completed streams cannot be:

* Edited
* Cancelled
* Unlocked

---

## Rule 7 — Cancelled Streams

Cancelled streams are immutable and cannot be resumed.

---

# 🤖 7. Recommended Agent Workflows

## Employee Vesting

1. Create linear stream
2. Monitor vesting progress
3. Process withdrawals

## Grant Distribution

1. Create cliff vesting
2. Verify unlock date
3. Withdraw after cliff

## Milestone Funding

1. Create milestone stream
2. Approve milestone
3. Unlock milestone
4. Withdraw allocation

## Treasury Recovery

1. Inspect stream state
2. Calculate remaining allocation
3. Cancel stream
4. Return unvested funds

These workflows represent the primary operational patterns expected from AI agents interacting with Unified Flow.
