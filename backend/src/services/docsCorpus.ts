// Static documentation corpus for the docs RAG assistant.
//
// The Express backend is a separate package from the Next.js frontend and
// cannot import `@/lib/docs-data` or the page components directly, so this
// corpus is maintained by hand here. Each entry should mirror what's actually
// rendered on the corresponding /docs/<slug> page — when a docs page changes,
// update the matching chunk(s) below so retrieval doesn't go stale.
//
// Keep chunks small and single-topic: retrieval quality (and citation
// usefulness) comes from being able to point at one paragraph-sized chunk,
// not a whole page.

export interface DocChunk {
    id: string;
    slug: string; // matches /docs/<slug>, used to build a "view full page" link
    title: string; // page-level title, shown as the section name
    heading: string; // the specific heading/topic this chunk covers
    text: string; // the actual content to search over and feed to the model
}

export const DOCS_CORPUS: DocChunk[] = [
    // ─── Overview ────────────────────────────────────────────────────────────
    {
        id: "overview-intro",
        slug: "overview",
        title: "Overview",
        heading: "What is Unified Flow",
        text: "Unified Flow is a token distribution and vesting protocol built on Solana using the Anchor framework. It lets a creator lock SPL tokens into a stream that releases to a recipient over time, instead of transferring everything at once. The protocol supports linear vesting, cliff vesting, and milestone-based vesting, plus CSV bulk operations for creating or editing many streams at once, and Squads multisig support for teams that want multi-approval control over stream actions.",
    },
    {
        id: "overview-vesting-types",
        slug: "overview",
        title: "Overview",
        heading: "Vesting types",
        text: "There are three vesting types, identified on-chain by a numeric vesting_type field: Type 0 is Linear, where tokens unlock gradually and continuously between a start and end timestamp. Type 1 is Cliff, where no tokens are claimable until a cliff timestamp is reached, after which the vested amount becomes available (and may continue vesting after the cliff depending on configuration). Type 2 is Milestone, where the creator manually unlocks each milestone tranche; nothing unlocks automatically by time alone.",
    },
    {
        id: "overview-actors",
        slug: "overview",
        title: "Overview",
        heading: "Roles: creator vs recipient",
        text: "A stream has two roles. The creator funds the stream, can cancel it (returning unvested tokens), can edit cliff/linear/milestone parameters, and can unlock milestones. The recipient is the only party that can withdraw vested tokens from the vault. Both roles are checked on-chain via Anchor's has_one constraints, so a wallet that isn't the creator cannot cancel or edit, and a wallet that isn't the recipient cannot withdraw.",
    },

    // ─── Instruction Reference ───────────────────────────────────────────────
    {
        id: "instr-create-stream",
        slug: "instructions",
        title: "Program Instructions",
        heading: "create_stream",
        text: "create_stream initializes a new Stream account and its associated token vault. Required accounts include the creator, recipient, mint, the global config PDA, the new stream PDA, and the vault PDA. Arguments include the total amount (in the mint's base units), start_ts, cliff_ts (0 if unused), end_ts, vesting_type, an optional milestones array for milestone-type streams, and a nonce used to derive the stream PDA so a creator/recipient pair can have multiple independent streams.",
    },
    {
        id: "instr-withdraw",
        slug: "instructions",
        title: "Program Instructions",
        heading: "withdraw",
        text: "withdraw lets the recipient claim whatever portion of the stream has vested so far that hasn't already been withdrawn. It transfers tokens from the vault PDA to the recipient's associated token account. Only the recipient named on the stream can call this; calling before any amount has vested, or after everything has already been withdrawn, will fail.",
    },
    {
        id: "instr-cancel",
        slug: "instructions",
        title: "Program Instructions",
        heading: "cancel",
        text: "cancel terminates an active stream. It can only be called by the creator, and only if the stream was created with cancelable set to true. Any tokens that had already vested but not been withdrawn go to the recipient, and the remaining unvested balance returns to the creator. This action is irreversible — once cancelled, the stream cannot be restarted.",
    },
    {
        id: "instr-unlock-milestone",
        slug: "instructions",
        title: "Program Instructions",
        heading: "unlock_milestone",
        text: "unlock_milestone releases a specific milestone tranche on a milestone-type stream. It takes a 0-based milestone_index and can only be called by the creator. Unlocking a milestone makes that tranche's tokens withdrawable by the recipient; it does not by itself transfer tokens — the recipient still calls withdraw afterward.",
    },
    {
        id: "instr-edit-milestone",
        slug: "instructions",
        title: "Program Instructions",
        heading: "edit_milestone",
        text: "edit_milestone changes the token amount assigned to a specific milestone (by index) on a milestone-type stream, adjusting the vault's required balance accordingly. This is typically used to top up or reduce a not-yet-unlocked milestone's allocation.",
    },
    {
        id: "instr-edit-cliff",
        slug: "instructions",
        title: "Program Instructions",
        heading: "edit_cliff",
        text: "edit_cliff updates the cliff timestamp on a cliff-type stream. It takes a new absolute cliff_ts. This is used to push a cliff date later (or pull it earlier) without recreating the whole stream.",
    },
    {
        id: "instr-edit-linear",
        slug: "instructions",
        title: "Program Instructions",
        heading: "edit_linear",
        text: "edit_linear can extend a linear stream's end date and/or top up the vault with additional tokens, in a single transaction. The new end timestamp must be strictly later than the stream's current end_ts, or the extension has no effect. Clients should compute the new end as current_end_ts + extend_seconds rather than guessing an absolute timestamp, since only the chain knows the stream's exact current end.",
    },
    {
        id: "instr-withdraw-fees",
        slug: "instructions",
        title: "Program Instructions",
        heading: "withdraw_fees",
        text: "withdraw_fees is an admin-only instruction that sweeps accumulated protocol fees out of the program's fee vault. It requires the config account's admin authority as a signer and is not callable by regular creators or recipients.",
    },
    {
        id: "instr-account-validation",
        slug: "instructions",
        title: "Program Instructions",
        heading: "Account validation order",
        text: "Anchor validates accounts on every instruction in a fixed order: first the account discriminator (does this account belong to the expected type), then PDA seed derivation (does the supplied address match what the seeds produce), then has_one relationship constraints (does this account's stored creator/recipient/mint match the accounts passed in), and finally any custom #[error_code] checks written in the instruction handler. A transaction that fails early — e.g. a seeds mismatch — never reaches the custom business-logic checks.",
    },

    // ─── Developer Integration Guide ────────────────────────────────────────
    {
        id: "guide-quickstart",
        slug: "guide",
        title: "Developer Guide",
        heading: "Quickstart",
        text: "To integrate Unified Flow, install the SDK (@unifiedflow/unified-flow-sdk), construct an UnifiedFlowClient with your Anchor program, wallet, and connection, then call the client method matching the action you need (createStream, withdraw, cancel, unlockMilestone, editMilestone, editCliff, editLinear). The SDK derives PDAs for you and returns a transaction signature once confirmed.",
    },
    {
        id: "guide-pdas",
        slug: "guide",
        title: "Developer Guide",
        heading: "PDA derivation",
        text: "Stream accounts are derived from the seeds [\"stream\", creator pubkey, recipient pubkey, nonce (u64 little-endian)], which is why the same creator/recipient pair can open multiple streams by varying the nonce. The vault token account is derived from [stream PDA, token program id, mint], following the standard associated-token-style PDA pattern. Milestone accounts are derived from [\"milestone\", stream PDA, milestone index as a single byte].",
    },
    {
        id: "guide-amounts",
        slug: "guide",
        title: "Developer Guide",
        heading: "Token amounts and decimals",
        text: "All amounts sent on-chain are in the mint's base units, not human-readable units. Before building a transaction, read the mint's decimals (via getParsedAccountInfo or the indexer's mintDecimals field) and convert a human amount like 1000.5 tokens into base units by multiplying by 10^decimals. Getting this wrong is the most common integration bug — sending 1000 instead of 1000 * 10^decimals will create a stream worth a tiny fraction of what was intended.",
    },
    {
        id: "guide-errors",
        slug: "guide",
        title: "Developer Guide",
        heading: "Common integration errors",
        text: "A few errors come up repeatedly when integrating: passing a stale or wrong stream PDA (the client recomputes it from creator+recipient+nonce, so a typo in any of those three produces a different address), calling withdraw or cancel from a wallet that isn't the recipient or creator respectively (Anchor's has_one check rejects this), and passing an absolute timestamp to edit_linear's extension argument instead of a relative number of seconds to add.",
    },

    // ─── TypeScript SDK ──────────────────────────────────────────────────────
    {
        id: "sdk-install",
        slug: "sdk",
        title: "TypeScript SDK",
        heading: "Installation and client setup",
        text: "Install the SDK with npm install @unifiedflow/unified-flow-sdk. Initialize a client with new UnifiedFlowClient(program, wallet, connection, \"confirmed\"). The client wraps the Anchor program with higher-level methods for every instruction and handles PDA derivation internally.",
    },
    {
        id: "sdk-methods",
        slug: "sdk",
        title: "TypeScript SDK",
        heading: "Available methods",
        text: "The SDK exposes one method per instruction: createStream, withdraw, cancel, unlockMilestone, editMilestone, editCliff, and editLinear. Each method builds, signs (via the provided wallet), sends, and confirms the transaction, returning a result object containing the transaction signature.",
    },
    {
        id: "sdk-progress",
        slug: "sdk",
        title: "TypeScript SDK",
        heading: "Transaction progress callback",
        text: "Methods like withdraw accept an optional progress callback as a second argument, invoked with status strings as the transaction moves through its lifecycle: wallet_approval (waiting for the user to approve in their wallet), sending (broadcast to the network), and confirming (waiting for the commitment level to be reached). This is useful for showing a live status indicator in a UI instead of a single opaque loading spinner.",
    },

    // ─── REST API ────────────────────────────────────────────────────────────
    {
        id: "api-streams-list",
        slug: "api",
        title: "REST API Integration",
        heading: "GET /streams and GET /streams/:id",
        text: "The backend indexer continuously watches on-chain program events and mirrors every stream into Postgres, exposed read-only via REST. GET /streams returns all indexed streams ordered by creation time, each enriched with the mint's decimals. GET /streams/:id returns a single stream plus its full transaction history.",
    },
    {
        id: "api-actions",
        slug: "api",
        title: "REST API Integration",
        heading: "Action endpoints (withdraw, cancel, unlock-milestone)",
        text: "POST /streams/:id/withdraw, POST /streams/:id/cancel, and POST /streams/:id/unlock-milestone build and return a base64-encoded, partially-signed transaction for the requested action — the backend never holds user keys, so the caller's wallet must sign and submit the returned transaction itself.",
    },
    {
        id: "api-csv",
        slug: "api",
        title: "REST API Integration",
        heading: "CSV bulk endpoints",
        text: "POST /csv/upload validates and stores a new CSV version scoped to the uploading wallet. POST /csv/diff compares a CSV against either the live database or a specific historical version and returns what would be created, updated, or left unchanged. POST /streams/bulk creates many streams from validated CSV rows, and POST /streams/edit-csv applies bulk edits — but strictly only to streams that were originally created via CSV, never to manually-created streams.",
    },
    {
        id: "api-health",
        slug: "api",
        title: "REST API Integration",
        heading: "Health and readiness",
        text: "GET /health reports overall service health including database connectivity, RPC connectivity, the active cluster, and indexer liveness (whether it's subscribed, the last indexed slot, staleness in seconds, and reconnect count). GET /ready is a narrower readiness check used by orchestrators to gate traffic, based only on database reachability.",
    },

    // ─── Model Context Protocol ──────────────────────────────────────────────
    {
        id: "mcp-intro",
        slug: "mcp",
        title: "Model Context Protocol (MCP)",
        heading: "What the MCP server provides",
        text: "Unified Flow ships an MCP server so AI agents (Claude Desktop, Cursor, or any MCP-compatible client) can read and act on the protocol through tool calls instead of raw RPC calls. The MCP server reads indexed data from the backend REST API rather than touching the database directly, so it only needs the API base URL plus an RPC endpoint and program ID to construct transactions.",
    },
    {
        id: "mcp-setup",
        slug: "mcp",
        title: "Model Context Protocol (MCP)",
        heading: "Configuring an MCP client",
        text: "To connect an MCP client, add a server entry pointing at the backend's mcp script (npm run mcp) with environment variables for the RPC HTTP and WebSocket endpoints, the program id, the API base URL, and a local wallet keypair path for signing. Once configured, the agent gains tool access to every contract operation exposed by the server.",
    },
    {
        id: "mcp-tool-capabilities",
        slug: "mcp",
        title: "Model Context Protocol (MCP)",
        heading: "Exposed tool capabilities",
        text: "The MCP server exposes one tool per contract operation, mirroring the instruction set: creating streams, withdrawing, cancelling, unlocking milestones, and editing cliff/linear/milestone parameters. Each tool's parameters mirror the corresponding instruction's required accounts and arguments.",
    },

    // ─── CLI & Agent Skills ──────────────────────────────────────────────────
    {
        id: "cli-install",
        slug: "cli",
        title: "CLI & Agent Skills",
        heading: "Installing the CLI",
        text: "The CLI ships as the npm package @unifiedflow/cli. It provides one subcommand per vesting action plus bulk variants: create, create-batch, withdraw, cancel, unlock-milestone, edit-milestone, edit-cliff, edit-linear, edit-batch, and version.",
    },
    {
        id: "cli-batch",
        slug: "cli",
        title: "CLI & Agent Skills",
        heading: "Batch commands",
        text: "create-batch and edit-batch accept a CSV file path and apply the same validation rules as the web app's CSV flow — edit-batch will refuse to touch any stream that wasn't originally created via CSV, to prevent accidental bulk edits to manually-created streams.",
    },
    {
        id: "cli-skills",
        slug: "cli",
        title: "CLI & Agent Skills",
        heading: "Agent skill document",
        text: "The backend exposes a GET /skills endpoint that serves a markdown document describing the protocol's capabilities in a format intended for AI agents and coding assistants to consume directly, separate from the human-facing docs site.",
    },

    // ─── Architecture Decision Records ───────────────────────────────────────
    {
        id: "adr-pda-nonce",
        slug: "adr",
        title: "Architecture Decision Records",
        heading: "Why streams use a nonce in their PDA seeds",
        text: "Early designs derived the stream PDA from just creator and recipient, which meant a creator could only ever have one active stream with a given recipient. Adding a u64 nonce to the seed set allows arbitrary numbers of independent streams between the same two parties, at the cost of callers needing to track and supply a unique nonce per stream they create.",
    },
    {
        id: "adr-milestone-manual",
        slug: "adr",
        title: "Architecture Decision Records",
        heading: "Why milestones unlock manually instead of by time",
        text: "Milestone vesting was deliberately designed so unlocks require an explicit creator transaction rather than firing automatically at a timestamp, because many real-world milestone agreements (delivery of work, hitting a KPI) can't be reduced to a calendar date known in advance. The trade-off is that milestone streams depend on the creator remaining responsive; a creator who disappears can leave a recipient unable to claim an earned milestone.",
    },
    {
        id: "adr-csv-origin-tracking",
        slug: "adr",
        title: "Architecture Decision Records",
        heading: "Why CSV-created and manually-created streams are tracked separately",
        text: "The indexer tags every stream with an isCsvCreated flag. Bulk CSV edit operations are restricted to only ever touch CSV-originated streams, even if a manually-created stream happens to match a row in an edit CSV. This was added after an early version allowed bulk edits to silently modify hand-crafted streams that a user didn't intend to include in a batch operation.",
    },

    // ─── Setup Guide ─────────────────────────────────────────────────────────
    {
        id: "setup-prereqs",
        slug: "setup",
        title: "Setup Guide",
        heading: "Prerequisites",
        text: "Running the full stack locally requires Rust and the Solana CLI tools, Anchor 0.32.1, Node.js, and PostgreSQL for the indexer database. The program is currently deployed to Devnet under program id 8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa.",
    },
    {
        id: "setup-env",
        slug: "setup",
        title: "Setup Guide",
        heading: "Environment configuration",
        text: "The backend needs an RPC endpoint (HTTP and WebSocket), a Postgres connection string for Prisma, and CORS_ORIGINS to allow the frontend's origin. The frontend needs the backend's API base URL and the active cluster's RPC endpoint. AI chat features additionally require an ASIONE_API_KEY; without it the assistant falls back to canned offline responses.",
    },
    {
        id: "setup-monorepo",
        slug: "setup",
        title: "Setup Guide",
        heading: "Monorepo layout",
        text: "The project is a monorepo containing the Anchor smart contract (Rust), a Node.js/Express backend with a Prisma/PostgreSQL indexer, a Next.js 14 frontend, an npm CLI package (@unifiedflow/cli), and an SDK package (@unifiedflow/unified-flow-sdk). The backend and frontend are separate packages and do not import each other's source files directly.",
    },
];