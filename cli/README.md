# @unifiedflow/cli

CLI tool for Unified Flow token distribution protocol on Solana.

## Installation

```bash
npm install -g @unifiedflow/cli
```

## Usage

```bash
unifiedflow <command> [args...]
```

### Commands

#### Read Commands
- `view <streamAddress>` - Fetch & print real-time on-chain stream & milestone details
- `config` - Print global protocol config (fees, admin, paused state)

#### Write Transaction Commands
- `init` - Initialize global protocol config PDA state
- `create <recipient> <mint> <amount> <type> [duration|milestones...]` - Create a new vesting stream
  - Vesting types:
    - `0` - Linear (args: `<durationSecs>`)
    - `1` - Cliff (args: `<durationSecs>`)
    - `2` - Milestone (args: comma-separated list of milestone amounts)
- `withdraw <streamAddress>` - Withdraw claimable vested tokens from a stream
- `cancel <streamAddress>` - Cancel an active stream (returns unvested tokens to creator)
- `unlock <streamAddress>` - Unlock the next milestone in a milestone stream
- `edit-milestone <stream> <idx> <amt>` - Modify a locked milestone allocation
- `edit-cliff <stream> <newCliffTs>` - Edit stream's cliff timestamp

### Environment Variables

Create a `.env` file or set environment variables:

- `WALLET_PATH` - Path to your Solana wallet keypair file (default: `~/.config/solana/id.json`)
- `PROGRAM_ID` - Unified Flow program ID (default: `8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa`)
- `RPC_URL` - Solana RPC endpoint URL

### Examples

```bash
# View stream details
unifiedflow view 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

# Create a linear vesting stream (1 year duration)
unifiedflow create <recipient_address> <mint_address> 1000000000 0 31536000

# Create a milestone-based vesting stream
unifiedflow create <recipient_address> <mint_address> 1000000000 2 250000000,250000000,250000000,250000000

# Withdraw available tokens
unifiedflow withdraw 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

# Cancel a stream
unifiedflow cancel 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
```

## Development

```bash
# Build the CLI
npm run build

# Run locally
npm start -- <command> [args...]
```

## Publishing to NPM

```bash
# Build the package
npm run build

# Publish to npm
npm publish
```

## License

ISC
