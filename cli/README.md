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
- `view <streamAddress>` — Fetch & print real-time on-chain stream & milestone details
- `config` — Print global protocol config (fees, admin, paused state)

#### Write Transaction Commands
- `init` — Initialize global protocol config PDA state
- `create <recipient> <mint> <amount> <type> [duration|milestones]` — Create a new vesting stream
  - Vesting types:
    - `0` — Linear (args: `<durationSecs>`)
    - `1` — Cliff (args: `<durationSecs>`)
    - `2` — Milestone (args: comma-separated milestone amounts e.g. `250000000,250000000`)
- `create-batch <csvPath>` — Create multiple streams from a CSV file
- `withdraw <streamAddress>` — Withdraw claimable vested tokens from a stream
- `cancel <streamAddress>` — Cancel an active stream (returns unvested tokens to creator)
- `unlock <streamAddress>` — Unlock the next milestone in a milestone stream
- `edit-milestone <stream> <idx> <amt>` — Modify a locked milestone allocation
- `edit-linear <stream> <newDuration> [topup]` — Extend duration and/or top up a linear stream
- `edit-cliff <stream> <newCliffTs>` — Edit stream's cliff timestamp
- `edit-batch <csvPath>` — Bulk edit streams from a CSV file

#### Utility Commands
- `version`, `-v`, `--version` — Print CLI version and connection info

### CSV Formats

#### `create-batch` CSV
```csv
recipient,mint,amount,type,duration,cliffDuration,milestones
<address>,<mint>,1000000000,0,31536000,,
<address>,<mint>,500000000,1,31536000,15768000,
<address>,<mint>,600000000,2,,,200000000;200000000;200000000
```
- `duration` — required for type `0` and `1` (seconds)
- `cliffDuration` — required for type `1` (seconds from start)
- `milestones` — required for type `2`; semicolon-separated amounts that must sum to `amount`

#### `edit-batch` CSV
```csv
id,amount,duration,cliffDuration,milestones
<streamAddress>,,,15768000,
<streamAddress>,2000000000,63072000,,
<streamAddress>,,,,300000000;300000000;300000000
```
- `id` — stream address (required)
- `duration` — new total duration in seconds from stream start (linear only)
- `amount` — new target total; difference is topped up from creator ATA (linear only)
- `cliffDuration` — new cliff duration in seconds from stream start (cliff only)
- `milestones` — semicolon-separated new amounts per milestone index (milestone only)

### Environment Variables
Create a `.env` file or set environment variables:
- `WALLET_PATH` — Path to your Solana wallet keypair file (default: `~/.config/solana/id.json`)
- `PROGRAM_ID` — Unified Flow program ID (default: `8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa`)
- `RPC_URL` — Solana RPC endpoint URL

### Examples
```bash
# View stream details
unifiedflow view 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

# Create a linear vesting stream (1 year)
unifiedflow create <recipient> <mint> 1000000000 0 31536000

# Create a cliff vesting stream (1 year, cliff at 6 months)
unifiedflow create <recipient> <mint> 1000000000 1 31536000

# Create a milestone stream (4 equal tranches)
unifiedflow create <recipient> <mint> 1000000000 2 250000000,250000000,250000000,250000000

# Create multiple streams from CSV
unifiedflow create-batch ./streams.csv

# Withdraw available tokens
unifiedflow withdraw 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

# Cancel a stream
unifiedflow cancel 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

# Unlock next milestone
unifiedflow unlock 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

# Extend a linear stream by 6 months and top up 500 tokens
unifiedflow edit-linear 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 47304000 500000000

# Bulk edit streams from CSV
unifiedflow edit-batch ./edits.csv

# Check version
unifiedflow version
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
npm run build
npm publish
```

## License
ISC