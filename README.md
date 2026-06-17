# Unified Flow

Unified Flow is a Solana-based token distribution monorepo for building transparent and auditable SPL token vesting and streaming workflows. It combines an Anchor on-chain program, a TypeScript SDK, a CLI, a backend indexer/API (with an MCP server), and a Next.js web frontend.

## Overview

Unified Flow lets organizations and teams lock SPL tokens on-chain and release them to recipients over time based on predefined schedules. It supports three vesting models:

| Type | Model | Behavior |
| --- | --- | --- |
| `0` | **Linear** | Tokens unlock continuously, second-by-second, from `start_ts` to `end_ts`. |
| `1` | **Cliff** | Tokens stay fully locked until `cliff_ts`, then unlock linearly toward `end_ts`. |
| `2` | **Milestone** | Tokens are split into discrete milestones the creator unlocks sequentially on-chain. |

Withdrawals charge a fixed **$0.99 USD** protocol fee, paid in SOL and priced in real time via the on-chain **Chainlink SOL/USD** feed.

**Deployed program ID:** `8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa`

## Documentation

Full developer documentation ships as a docs site inside the frontend. Run the frontend (see below) and open:

| Page | Route |
| --- | --- |
| Overview / vesting models | [`/docs/overview`](frontend/src/app/docs/overview/) |
| Instruction reference (all instructions, params, errors, examples) | [`/docs/instructions`](frontend/src/app/docs/instructions/) |
| Developer integration guide | [`/docs/guide`](frontend/src/app/docs/guide/) |
| Architecture decision records | [`/docs/adr`](frontend/src/app/docs/adr/) |
| Setup guide | [`/docs/setup`](frontend/src/app/docs/setup/) |
| SDK / API / CLI / MCP | [`/docs/sdk`](frontend/src/app/docs/sdk/), [`/docs/api`](frontend/src/app/docs/api/), [`/docs/cli`](frontend/src/app/docs/cli/), [`/docs/mcp`](frontend/src/app/docs/mcp/) |

## Program Instructions

The on-chain program exposes the following instructions. See [`/docs/instructions`](frontend/src/app/docs/instructions/) for full parameters, validation rules, error codes, and code examples.

| Instruction | Caller | Summary |
| --- | --- | --- |
| `create_stream` | Anyone | Initializes a vesting stream and locks tokens into a program vault (linear, cliff, or milestone). |
| `withdraw` | Recipient | Claims all currently vested tokens. Charges the $0.99 SOL fee per call. |
| `cancel` | Creator | Cancels a stream. Unvested tokens return to the creator; vested-but-unwithdrawn tokens go to the recipient. |
| `unlock_milestone` | Creator | Unlocks the next sequential milestone of a milestone stream. |
| `edit_milestone` | Creator | Resizes an un-unlocked milestone allocation; the vault auto-rebalances. |
| `edit_cliff` | Creator | Updates the cliff timestamp of a cliff stream (before any withdrawal). |
| `edit_linear` | Creator | Extends the end timestamp and/or tops up a linear or cliff stream. |
| `initialize_config` | Admin | One-time initialization of the global protocol config PDA. |
| `withdraw_fees` | Fee authority | Withdraws accumulated SOL fees from the fee vault PDA. |

### PDA derivation

```text
Config PDA:    ["config"]
Fee Vault PDA: ["fee_vault"]
Stream PDA:    ["stream", creator, recipient, nonce.to_le_bytes()]
Vault ATA:     ATA(stream_pda, mint)
Milestone PDA: ["milestone", stream_pda, milestone_index_byte]
```

## Repository Structure

```text
.
|-- Anchor.toml                 # Anchor, cluster, wallet, and test script config
|-- Cargo.toml                  # Rust workspace manifest
|-- rust-toolchain.toml         # Pinned Rust toolchain
|-- programs/
|   `-- unified-flow/           # Anchor on-chain program (src/lib.rs, src/oracle.rs)
|-- sdk/                        # TypeScript SDK (@unifiedflow/unified-flow-sdk)
|-- cli/                        # Command-line tool (@unifiedflow/cli)
|-- backend/                    # Express API, Prisma indexer, MCP server, AI chat
|-- frontend/                   # Next.js web app + documentation site (/docs)
|-- tests/                      # TypeScript integration tests
|-- migrations/                 # Anchor deploy scripts
`-- .github/workflows/          # CI workflows for build and test
```

## Tech Stack

- **Solana + Anchor** for the on-chain program (Rust)
- **TypeScript** for the SDK, CLI, tests, backend, and frontend
- **Express + Prisma (PostgreSQL)** for the backend API and event indexer
- **Model Context Protocol (MCP)** server for LLM agent access
- **Next.js + Tailwind CSS** for the frontend web app and docs site
- **Chainlink** on-chain SOL/USD feed for dynamic fee pricing
- **Mocha + Chai** for Anchor integration tests

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Rust | `1.89.0` | Pinned through `rust-toolchain.toml` |
| Solana CLI | `2.2.1` | Matches `Anchor.toml` |
| Anchor CLI | `0.32.1` | Matches `Anchor.toml` |
| Node.js | `>= 18` | LTS recommended |
| Yarn | latest | Used by the Anchor test script |

Check your local versions:

```bash
rustc --version
solana --version
anchor --version
node --version
yarn --version
```

## Installation

Clone the repository and install root dependencies:

```bash
git clone <repository-url>
cd unified-flow
yarn install
```

If you do not have a local Solana keypair yet, create one:

```bash
solana-keygen new --outfile ~/.config/solana/id.json
```

Point your Solana CLI to localnet for local development:

```bash
solana config set --url localhost
```

## On-chain Program

Build the Anchor program:

```bash
anchor build
```

Main build outputs:

- `target/deploy/unified_flow.so`
- `target/idl/unified_flow.json`
- `target/types/unified_flow.ts`

Run tests with the local validator managed by Anchor:

```bash
anchor test
```

For faster iteration, run the validator separately:

```bash
solana-test-validator -r
anchor test --skip-local-validator
```

## TypeScript SDK

The SDK in [`sdk/`](sdk/) (`@unifiedflow/unified-flow-sdk`) wraps the program with a typed client that auto-resolves PDAs and account lists. See [sdk/README.md](sdk/README.md) and [`/docs/guide`](frontend/src/app/docs/guide/) for full setup.

To consume it locally from the frontend or backend, add to your `package.json`:

```json
"@unifiedflow/unified-flow-sdk": "file:../sdk"
```

Minimal usage (see the Integration Guide for full client initialization):

```typescript
import { BN } from "@coral-xyz/anchor";
import { UnifiedFlowClient } from "@unifiedflow/unified-flow-sdk";

// `client` is a UnifiedFlowClient bound to a wallet + connection
const now = Math.floor(Date.now() / 1000);

const { signature } = await client.createStream(
  recipient,                 // PublicKey
  mint,                      // PublicKey
  new BN(1_000_000_000),     // amount
  new BN(now + 60),          // start_ts
  new BN(now + 60),          // cliff_ts (= start_ts for linear)
  new BN(now + 31_536_000),  // end_ts
  0,                         // vesting_type: Linear
  [],                        // milestones (empty for linear/cliff)
  new BN(Date.now())         // unique nonce
);
```

## CLI

The CLI in [`cli/`](cli/) (`@unifiedflow/cli`) drives the program from the terminal — create, view, withdraw, cancel, unlock, edit, and CSV batch operations. See [cli/README.md](cli/README.md) for the full command reference.

```bash
# Create a 1-year linear stream
unifiedflow create <recipient> <mint> 1000000000 0 31536000

# View a stream
unifiedflow view <streamAddress>

# Withdraw vested tokens
unifiedflow withdraw <streamAddress>
```

Configure via environment variables (`WALLET_PATH`, `PROGRAM_ID`, `RPC_URL`).

## Backend

The backend in [`backend/`](backend/) is an Express + TypeScript service that indexes program events into PostgreSQL (Prisma) and exposes a REST API consumed by the frontend, plus an MCP server for AI agents.

```bash
cd backend
npm install
npm run dev          # start the API (default PORT=3000)
npm run init-config  # initialize the on-chain protocol config (admin, one-time)
npm run mcp          # start the Model Context Protocol server
```

Selected endpoints:

```text
GET  /health                       # service + DB health
GET  /streams                      # list indexed streams
GET  /streams/:id                  # stream detail
POST /streams                      # create a stream
POST /streams/:id/withdraw         # withdraw
POST /streams/:id/cancel           # cancel
POST /ai/chat                      # AI assistant chat
```

A Prisma schema and migrations live in [backend/prisma/](backend/prisma/). Set `DATABASE_URL` (and RPC/program env vars) before running.

## Frontend

The frontend in [`frontend/`](frontend/) is a Next.js app that connects to a Solana wallet, manages streams, and hosts the documentation site at `/docs`.

```bash
cd frontend
npm install
npm run dev
```

The app runs at `http://localhost:3000` by default. If the backend also uses port `3000`, run one service on a different port.

## MCP Server

The backend ships a Model Context Protocol server (`npm run mcp` from `backend/`) that exposes program read/write operations as LLM tools for Claude Desktop, Cursor, and other MCP clients. See [`/docs/mcp`](frontend/src/app/docs/mcp/) for the client configuration JSON and the list of exposed tools.

## Deploy to Devnet

Switch the Solana CLI to devnet:

```bash
solana config set --url https://api.devnet.solana.com
```

Fund your wallet with devnet SOL:

```bash
solana airdrop 2
solana balance
```

Build and deploy the program:

```bash
anchor build
anchor deploy --provider.cluster devnet
```

Current program ID:

```text
8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa
```

Verify the deployed program:

```bash
solana program show 8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa --url devnet
```

If the program keypair changes, run:

```bash
anchor keys sync
anchor build
```

> After deploying, call `initialize_config` once (`unifiedflow init` or `npm run init-config` from `backend/`) before any streams can be created.

## Chainlink Integration

Withdrawal fees are priced in USD and converted to SOL on-chain using the Chainlink SOL/USD feed. The SDK includes these accounts automatically on `withdraw`.

```text
Chainlink program: HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny
SOL/USD feed:      99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR
```

## Useful Scripts

Root workspace:

```bash
yarn lint
yarn lint:fix
anchor build
anchor test
```

Backend:

```bash
npm run dev
npm run build
npm start
npm run mcp
npm run init-config
```

Frontend:

```bash
npm run dev
npm run build
npm start
npm run lint
```

## CI

GitHub Actions are available for:

- Building and testing the Solana program
- Verifying the devnet program build

Workflow files are located in [.github/workflows/](.github/workflows/).

## Troubleshooting

**`anchor build` fails because the Rust version does not match**

Make sure the active toolchain follows `rust-toolchain.toml`.

```bash
rustup show
```

**Program ID mismatch**

Sync Anchor keys and rebuild.

```bash
anchor keys sync
anchor build
```

**Devnet airdrop is rate-limited**

Wait a few minutes and retry, or use a Solana faucet.

**Backend and frontend ports conflict**

The backend uses `PORT=3000` by default and Next.js also defaults to `3000`. Set one service to a different port explicitly.

**Withdrawals fail with `StaleOraclePrice`**

The Chainlink SOL/USD feed has not updated within the last hour. Ensure your RPC is connected to a cluster where the feed is live (e.g. Devnet) and retry shortly.

---

Built by **Mancer S1 - Team 3**.
