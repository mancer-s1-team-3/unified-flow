# Unified Flow

Unified Flow is a Solana-based token distribution monorepo for building transparent and auditable SPL token vesting and streaming workflows. The project combines an Anchor on-chain program, a supporting backend service, and a web frontend.

The project is currently in early development. The base structure for the smart contract, backend, frontend, integration tests, and CI is already in place as the foundation for future iterations.

## Overview

Unified Flow is designed to help organizations and teams lock SPL tokens on-chain and release them to recipients over time based on predefined schedules.

Target vesting models:

- Linear vesting
- Cliff vesting
- Milestone-based vesting

Core program instructions currently scaffolded:

## `create_stream` Instruction

The `create_stream` instruction initializes a new token vesting stream and locks SPL tokens into a program-controlled vault account.

Current implementation supports linear, cliff, and milestone vesting streams.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `amount` | `u64` | Total token amount locked into the stream |
| `start_ts` | `i64` | Vesting start timestamp (Unix timestamp) |
| `cliff_ts` | `i64` | Cliff unlock timestamp. For linear streams this should match `start_ts`. For cliff streams it must be between `start_ts` and `end_ts`. For milestone streams it is stored but not used by the unlock logic. |
| `end_ts` | `i64` | Vesting end timestamp (Unix timestamp) |
| `vesting_type` | `u8` | Vesting model: `0` = linear, `1` = cliff, `2` = milestone |
| `milestones` | `Vec<MilestoneInput>` | Ordered milestone allocations. Required for milestone streams, must be empty for linear and cliff streams |
| `nonce` | `u64` | Unique nonce used for PDA derivation |

### PDA Structure

The stream account PDA is derived using:

```text
[
  "stream",
  creator,
  recipient,
  nonce
]
```

### Vesting Rules

- Linear streams require `milestones = []` and validate `start_ts >= now`, `end_ts > now`, `end_ts > start_ts`, and `cliff_ts >= start_ts`.
- Cliff streams require `milestones = []` and the same base timing checks as linear streams, plus `cliff_ts <= end_ts`.
- Milestone streams require at least one milestone, a matching `remainingAccounts` entry for each milestone PDA, and the milestone amounts must sum exactly to `amount`.
- Milestone amounts must all be greater than zero.
- Milestone count is capped at `255` entries because the on-chain account stores the count as `u8`.

### Milestone PDA Structure

For milestone streams, each milestone account PDA is derived using:

```text
[
  "milestone",
  stream,
  milestone_index
]
```

Milestones must be passed in order starting from index `0`.
## `withdraw` Instruction

The `withdraw` instruction allows the stream recipient to claim tokens that have already vested. Tokens unlock linearly over time — the recipient can call `withdraw` at any point after vesting begins and receive whatever portion has unlocked since the last claim.

### How the unlock amount is calculated

```
vested   = total_amount × (elapsed / duration)
claimable = vested − already_withdrawn
```

Where `elapsed = now − start_ts` and `duration = end_ts − start_ts`. Before `start_ts` the claimable amount is zero. At or after `end_ts` the full amount is claimable.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `_amount_to_withdraw` | `u64` | Unused by the program; included only to ensure unique transaction signatures across calls |

### Behavior

- Computes the claimable amount at the current slot time.
- Transfers exactly the claimable tokens from the vault PDA to the recipient's associated token account.
- Charges a fixed **$0.99 USD** protocol fee in SOL **on every call**, regardless of how many tokens are claimed. The fee is priced in real time via the on-chain Chainlink SOL/USD feed and deducted from the recipient's SOL balance.
- Updates `stream.withdrawn` to accumulate total claimed tokens.
- Sets `stream.status = COMPLETED (2)` when the final tokens are claimed.
- Partial withdrawals are fully supported — the recipient can call `withdraw` multiple times and accumulate claims over the lifetime of the stream.

### Access control

| Check | Error |
| --- | --- |
| Caller must be the stream recipient | `Unauthorized` |
| Stream must be in `ACTIVE (1)` status | `StreamNotActive` |
| Claimable amount must be greater than zero | `NothingToWithdraw` |
| Protocol must not be paused | `ProtocolPaused` |
| Oracle feed must match the expected address | `InvalidOracleFeed` |
| Oracle price must not be stale (> 1 hour old) | `StaleOraclePrice` |
| Fee receiver must match `config.fee_authority` | `InvalidFeeReceiver` |

### Example flow

1. Creator locks 1,000 tokens over 100 days via `create_stream`.
2. After 25 days, recipient calls `withdraw` → receives 250 tokens and pays **$0.99** in SOL.
3. After 50 days, recipient calls `withdraw` again → receives 250 more tokens (not 500, because 250 were already claimed) and pays **$0.99** again.
4. After 100 days, recipient calls `withdraw` a final time → receives remaining 500 tokens, pays **$0.99** again, and stream moves to `COMPLETED`.

## `cancel` Instruction


## Component Status

| Component | Status | Path |
| --- | --- | --- |
| Anchor program | In development | [programs/solana-program/](programs/solana-program/) |
| Backend API | Initialized | [backend/](backend/) |
| Frontend web app | Initialized | [frontend/](frontend/) |
| Integration tests | Initialized | [tests/](tests/) |
| CI workflow | Available | [.github/workflows/](.github/workflows/) |

## Tech Stack

- **Solana + Anchor** for the on-chain program
- **Rust** for smart contract development
- **TypeScript** for tests, backend, and frontend
- **Express** for the backend service
- **Next.js** for the frontend web app
- **Mocha + Chai** for Anchor integration tests

## Repository Structure

```text
.
|-- Anchor.toml                 # Anchor, cluster, wallet, and test script config
|-- Cargo.toml                  # Rust workspace manifest
|-- rust-toolchain.toml         # Pinned Rust toolchain
|-- package.json                # JS/TS tooling for the Anchor workspace
|-- programs/
|   `-- solana-program/         # Anchor on-chain program
|-- tests/                      # TypeScript integration tests
|-- migrations/                 # Anchor deploy scripts
|-- backend/                    # Express + TypeScript backend API
|-- frontend/                   # Next.js + Tailwind CSS frontend
`-- .github/workflows/          # CI workflows for build and test
```

## Prerequisites

Make sure the following tools are installed:

| Tool | Version Used | Notes |
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

- `target/deploy/solana_program.so`
- `target/idl/solana_program.json`
- `target/types/solana_program.ts`

Run tests with the local validator managed by Anchor:

```bash
anchor test
```

For faster iteration, run the validator separately:

```bash
solana-test-validator -r
anchor test --skip-local-validator
```

## Backend

The backend lives in [backend/](backend/) and currently exposes a health check endpoint.

```bash
cd backend
npm install
npm run dev
```

Default endpoint:

```text
GET http://localhost:3000/health
```

Response:

```json
{
  "status": "ok",
  "message": "Backend is running"
}
```

## Frontend

The frontend lives in [frontend/](frontend/) and uses Next.js.

```bash
cd frontend
npm install
npm run dev
```

By default, the app runs at:

```text
http://localhost:3000
```

If the backend is also running on port `3000`, run one of the services on a different port.

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

The backend uses `PORT=3000` by default if no environment variable is set, and Next.js also defaults to `3000`. Set one service to a different port explicitly.

## Initial Roadmap

- Complete account validation logic for `create_stream`, `withdraw`, and `cancel`
- Add stream and milestone state transitions
- Connect the frontend to a Solana wallet
- Add backend indexing for stream activity
- Document the architecture and data model
- Expand integration tests for the main vesting scenarios

---

Built by **Mancer S1 - Team 3**.
