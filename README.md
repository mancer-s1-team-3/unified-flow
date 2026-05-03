# Token Distribution

A Solana Anchor program for token distribution streams. Provides instruction handlers for `create_stream`, `withdraw`, and `cancel`.

- Program ID (localnet): `8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa`
- Anchor version: `0.32.1`
- Solana version: `2.2.1`
- Rust toolchain: `1.89.0`

## Prerequisites

Make sure the following tools are installed before working with this repo:

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

## Project Structure

```
.
├── Anchor.toml              # Anchor + cluster + script config
├── Cargo.toml               # Rust workspace
├── programs/solana-program  # On-chain program source
├── tests/                   # TypeScript integration tests (mocha)
├── migrations/              # Anchor deploy scripts
└── .github/workflows/       # CI: build + test on every push
```

## CI

GitHub Actions runs on every push:

- `solana-program-test.yaml` — builds the program and runs the test suite.
- `solana-program-devnet-build.yaml` — verifies the devnet build.