# Token Distribution App

A Solana-based token vesting platform that lets organizations lock SPL tokens on-chain and release them to recipients over time. The on-chain program supports three vesting models - **Linear**, **Cliff**, and **Milestone-based** - exposed through three core instructions: `create_stream`, `withdraw`, and `cancel`.

This repository is a monorepo and will host the on-chain program, the web frontend, and the supporting backend service as the project grows.

## Status

| Component | Status | Path |
|-----------|--------|------|
| Anchor on-chain program | In development | [programs/solana-program/](programs/solana-program/) |
| Frontend (web app) | Initialized | [`frontend/`](frontend/) |
| Backend (API + indexer) | Initialized | [`backend/`](backend/) |

> Detailed architecture (account structure, data flow, fee model, off-chain schema) will be documented separately in `ARCHITECTURE.md`. For now, see the Week 2 architecture document.

## Repository Structure

```
.
├── Anchor.toml                  # Anchor + cluster + script config
├── Cargo.toml                   # Rust workspace manifest
├── rust-toolchain.toml          # Pinned Rust toolchain (1.89.0)
├── package.json                 # JS/TS tooling for tests
├── programs/
│   └── solana-program/          # On-chain Anchor program (Rust)
├── tests/                       # TypeScript integration tests (mocha)
├── migrations/                  # Anchor deploy scripts
├── frontend/                    # Web app (Next.js + Tailwind)
├── backend/                     # Backend service (Node.js + Express)
└── .github/workflows/           # CI: build + test on every push
```

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Rust | `1.89.0` (pinned via `rust-toolchain.toml`) | https://www.rust-lang.org/tools/install |
| Solana CLI | `2.2.1` | `sh -c "$(curl -sSfL https://release.anza.xyz/v2.2.1/install)"` |
| Anchor CLI | `0.32.1` | `cargo install --git https://github.com/coral-xyz/anchor avm --force && avm install 0.32.1 && avm use 0.32.1` |
| Node.js | `>= 18` | https://nodejs.org |
| Yarn | latest | `npm install -g yarn` |

Verify the toolchain:

```bash
rustc --version       # rustc 1.89.0
solana --version      # solana-cli 2.2.1
anchor --version      # anchor-cli 0.32.1
node --version        # v18+
yarn --version
```

## Setup

Clone the repo and install JavaScript dependencies:

```bash
git clone https://github.com/mancer-s1-team-3/token-distribution.git
cd token-distribution
yarn install
```

Generate a local Solana keypair if you do not already have one (Anchor reads it from `~/.config/solana/id.json`):

```bash
solana-keygen new --outfile ~/.config/solana/id.json
```

## Build

Compile the Anchor program:

```bash
anchor build
```

The build produces:

- BPF binary: `target/deploy/solana_program.so`
- IDL: `target/idl/solana_program.json`
- TypeScript types: `target/types/solana_program.ts`

## Run Tests

Tests run against a local validator that Anchor spins up automatically.

```bash
anchor test
```

To run tests against an already-running local validator (faster iteration):

```bash
solana-test-validator -r        # in a separate terminal
anchor test --skip-local-validator
```

## Backend Setup

The backend service is built with Node.js, Express, and TypeScript. It is currently initialized with a basic configuration.

```bash
cd backend
npm install
npm run dev
```

## Frontend Setup

The frontend is built with Next.js, Tailwind CSS, and TypeScript.

```bash
cd frontend
npm install
npm run dev
```

## Deploy to Devnet

1. Switch the Solana CLI to devnet:

   ```bash
   solana config set --url https://api.devnet.solana.com
   ```

2. Fund your wallet with devnet SOL:

   ```bash
   solana airdrop 2
   solana balance
   ```

3. Update the `[provider]` cluster in `Anchor.toml` (or pass `--provider.cluster devnet`):

   ```toml
   [provider]
   cluster = "devnet"
   wallet = "~/.config/solana/id.json"
   ```

4. Build and deploy:

   ```bash
   anchor build
   anchor deploy --provider.cluster devnet
   ```

5. (Optional) Verify the deployed program:

   ```bash
   solana program show 8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa --url devnet
   ```

> If you regenerate the program keypair, run `anchor keys sync` and rebuild so the on-chain ID matches `declare_id!` and `Anchor.toml`.

## CI

GitHub Actions runs on every push:

- `solana-program-test.yaml` - builds the program and runs the test suite.
- `solana-program-devnet-build.yaml` - verifies the devnet build.

## Troubleshooting

- **`anchor build` fails on edition 2024**: ensure the pinned Rust toolchain (`1.89.0`) is active. Run `rustup show` from the repo root.
- **`Program ID mismatch`**: run `anchor keys sync` then `anchor build` again.
- **Devnet airdrop rate-limited**: use https://faucet.solana.com or wait a few minutes and retry.

---

Built by **Mancer S1 - Team 3**.
