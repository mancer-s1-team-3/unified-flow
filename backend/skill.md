---
title: Solana Token Distribution AI Agent Skills & Capabilities
description: A comprehensive skill and tool specification manual for AI Agents managing Solana-based vesting, streaming, and milestone workflows.
category: AI Agents
tags:
  - solana
  - mcp
  - vesting
  - cli
  - ai-agents
---

# 🧠 Solana Token Distribution AI Agent Skills & Capabilities

This document is a comprehensive skill manual for AI Agents (such as Cursor, Claude Desktop, or Gemini) interacting with the **Solana Token Vesting & Streaming Protocol** through our backend services, MCP tools, and CLI commands.

---

## 🛠️ 1. Core Protocol Agent Skills

An AI Agent equipped with this codebase possesses the following specialized skills:

### 🪙 Skill A: Vesting Stream Management
*   **Linear Vesting Stream Creation**: Establish constant, second-by-second token releases.
*   **Cliff Vesting Stream Creation**: Lock tokens until an exact timestamp (cliff) is reached, unlocking the full amount at once.
*   **Milestone Vesting Stream Creation**: Lock tokens in custom sequential milestone buckets.
*   **On-Chain Stream Verification**: Inspect the exact remaining, withdrawn, start, end, and cliff states on the Solana blockchain.

### 🔐 Skill B: Milestone Orchestration
*   **PDA Derivation**: Calculate exact, unique seeds for sequential milestone PDAs:
    `[b"milestone", streamPda, [index_u8]]`
*   **Sequential Unlocking**: Trigger milestone releases in exact sequence (e.g. Milestone 0, then 1, then 2).
*   **Dynamic Rebalancing**: Edit un-unlocked milestone allocations, automatically transferring tokens to/from the stream's vault to reflect the new allocation.

### 💸 Skill C: Liquidity & Claims
*   **Claim/Withdrawal Execution**: Claim unlocked tokens from active streams into the recipient's ATA.
*   **Oracle-Driven Fee Handling**: Read the devnet Chainlink price feed (`99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR`) to calculate the dynamic SOL transaction fee automatically.
*   **Cancellation Recovery**: Cancel active streams, returning unvested tokens to the creator and claimable tokens to the recipient.

---

## 🔌 2. MCP Tools Reference Sheet

When speaking to an AI client, these tools are exposed natively. The agent can invoke:

| Tool Name | Operation Type | Key Inputs | Description |
| :--- | :--- | :--- | :--- |
| `get_streams` | DB Query | `creator`, `recipient`, `status`, `limit` | Fetch indexed streams from Prisma PostgreSQL database. |
| `get_stream_details` | On-Chain Read | `streamAddress` | Read live, raw on-chain state & all derived milestone PDAs. |
| `get_protocol_config` | On-Chain Read | None | Get global protocol setup, admin permissions, and withdraw fees. |
| `create_stream` | Transaction | `recipient`, `mint`, `amount`, `vestingType`, `milestones`, `nonce` | Construct, sign, and broadcast a new vesting stream transaction. |
| `withdraw_from_stream`| Transaction | `streamAddress` | Claim available vested tokens using dynamic Chainlink feed rates. |
| `cancel_stream` | Transaction | `streamAddress` | Creator cancels stream, returning unvested tokens. |
| `unlock_milestone` | Transaction | `streamAddress` | Approve and unlock the next sequential milestone in a stream. |
| `edit_milestone` | Transaction | `streamAddress`, `milestoneIndex`, `newAmount` | Re-allocate tokens for a locked milestone. |
| `edit_cliff` | Transaction | `streamAddress`, `newCliffTs` | Shift the cliff date of an active, unwithdrawn stream. |
| `initialize_protocol` | Transaction | None | Initialize global protocol configuration. |

---

## 📟 3. CLI Command Cheat Sheet

AI agents or terminal users can perform operations directly using:

*   **View global config**:
    ```bash
    npm run cli config
    ```
*   **View stream state & milestones**:
    ```bash
    npm run cli view <streamAddress>
    ```
*   **Initialize protocol config**:
    ```bash
    npm run cli init
    ```
*   **Create a Linear Stream (10,000 tokens for 30 days)**:
    ```bash
    npm run cli create <recipient> <mint> 10000 0 2592000
    ```
*   **Create a Milestone Stream (1,000 tokens split into 300, 300, 400)**:
    ```bash
    npm run cli create <recipient> <mint> 1000 2 300,300,400
    ```
*   **Withdraw claimable tokens**:
    ```bash
    npm run cli withdraw <streamAddress>
    ```
*   **Unlock next milestone**:
    ```bash
    npm run cli unlock <streamAddress>
    ```
*   **Edit milestone #1 amount to 500**:
    ```bash
    npm run cli edit-milestone <streamAddress> 1 500
    ```
*   **Edit cliff timestamp**:
    ```bash
    npm run cli edit-cliff <streamAddress> <newTimestamp>
    ```
*   **Cancel stream**:
    ```bash
    npm run cli cancel <streamAddress>
    ```

---

## 🛡️ 4. Protocol Boundaries & Safety Rules

For AI agents performing operations, the following rules **must** be enforced:
1.  **Milestone Allocation Sum**: When creating a milestone stream, the sum of all elements in the `milestones` array **must exactly equal** the total `amount` parameter, otherwise the transaction will fail.
2.  **Milestone Unlock Order**: Milestones must be unlocked sequentially. Trying to unlock milestone index `2` before milestone index `1` is approved will trigger an on-chain program error.
3.  **Oracle Feed Dependency**: To execute withdrawals, the Chainlink feed `99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR` must be accessible. If the feed is stale (older than 1 hour), withdrawals are automatically blocked on-chain to prevent fee exploitation.
4.  **Edit Cliffs**: Cliffs can only be edited if the stream hasn't started and no tokens have been withdrawn yet.
