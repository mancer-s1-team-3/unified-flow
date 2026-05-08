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

- `create_stream`
- `withdraw`
- `cancel`

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
