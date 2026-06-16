import React from "react";
import { Rocket, AlertTriangle } from "lucide-react";
import { CodeSnippet } from "@/components/docs/CodeSnippet";

export default function GuidePage() {
  return (
    <div className="space-y-10 animate-fadeIn">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-100 flex items-center gap-3 mb-4">
          <Rocket className="w-8 h-8 text-indigo-400" />
          Developer Integration Guide
        </h1>
        <p className="text-lg text-zinc-400 font-light leading-relaxed">
          Step-by-step guide to integrating with the Unified Flow program using the TypeScript SDK. Covers environment setup, creating streams, withdrawing tokens, and handling all three vesting types.
        </p>
      </div>

      {/* 2.1 Prerequisites */}
      <section id="prerequisites" className="scroll-mt-24 p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
        <h3 className="text-xl font-bold text-zinc-100 mb-4">2.1 — Prerequisites & Installation</h3>
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-2 pr-4 text-zinc-400 font-semibold text-xs">Tool</th>
                <th className="text-left py-2 pr-4 text-zinc-400 font-semibold text-xs">Version</th>
                <th className="text-left py-2 text-zinc-400 font-semibold text-xs">Install</th>
              </tr>
            </thead>
            <tbody>
              {[
                { tool: "Rust", ver: "1.89.0", install: "rustup (toolchain from rust-toolchain.toml)" },
                { tool: "Solana CLI", ver: "2.2.1", install: "sh -c \"$(curl -sSfL https://release.solana.com/v2.2.1/install)\"" },
                { tool: "Anchor CLI", ver: "0.32.1", install: "cargo install --git https://github.com/coral-xyz/anchor anchor-cli --tag v0.32.1" },
                { tool: "Node.js", ver: ">= 18", install: "https://nodejs.org/" },
              ].map((r) => (
                <tr key={r.tool} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-4 font-semibold text-zinc-200 text-xs">{r.tool}</td>
                  <td className="py-2 pr-4 font-mono text-indigo-400 text-xs">{r.ver}</td>
                  <td className="py-2 text-zinc-400 text-xs font-mono break-all">{r.install}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="text-sm font-bold text-zinc-200 mb-2">Install SDK</h4>
        <CodeSnippet code={`npm install @unifiedflow/unified-flow-sdk

# Or via yarn
yarn add @unifiedflow/unified-flow-sdk`} />

        <h4 className="text-sm font-bold text-zinc-200 mt-6 mb-2">Environment Configuration</h4>
        <CodeSnippet code={`# .env (for CLI or backend usage)
WALLET_PATH=~/.config/solana/id.json
PROGRAM_ID=8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa
RPC_URL=https://api.devnet.solana.com`} />
      </section>

      {/* 2.2 Initialize Client */}
      <section id="init-client" className="scroll-mt-24 p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
        <h3 className="text-xl font-bold text-zinc-100 mb-4">2.2 — Initialize the Client</h3>
        <CodeSnippet code={`import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { UnifiedFlowClient } from '@unifiedflow/unified-flow-sdk';
import idl from './unified_flow.json';

const connection = new Connection(
  'https://api.devnet.solana.com',
  'confirmed'
);

const keypair = Keypair.fromSecretKey(/* your secret key bytes */);
const wallet  = new Wallet(keypair);
const provider = new AnchorProvider(connection, wallet, {
  commitment: 'confirmed',
});

const program = new Program(idl, provider);

// Initialize the SDK client
const client = new UnifiedFlowClient(
  program,
  wallet,
  connection,
  'confirmed'
);`} />
      </section>

      {/* 2.3 Create Linear */}
      <section id="create-linear" className="scroll-mt-24 p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
        <h3 className="text-xl font-bold text-zinc-100 mb-2">2.3 — Create a Linear Vesting Stream</h3>
        <p className="text-sm text-zinc-400 mb-4">Tokens unlock continuously second-by-second from startTs to endTs.</p>
        <CodeSnippet code={`import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';

const recipient = new PublicKey('RECIPIENT_WALLET_ADDRESS');
const mint      = new PublicKey('TOKEN_MINT_ADDRESS');

const now       = Math.floor(Date.now() / 1000);
const startTs   = new BN(now + 60);         // starts in 60 seconds
const endTs     = new BN(now + 31_536_000);  // 1 year from now
const cliffTs   = startTs;                   // no cliff for linear
const amount    = new BN(1_000_000_000);     // 1,000 tokens (6 decimals)
const nonce     = new BN(Date.now());        // unique nonce

const tx = await client.createStream(
  recipient,
  mint,
  amount,
  startTs,
  cliffTs,
  endTs,
  0,          // vesting_type: Linear
  [],         // no milestones
  nonce
);

console.log('Stream created. Tx:', tx);`} />
      </section>

      {/* 2.4 Create Cliff */}
      <section id="create-cliff" className="scroll-mt-24 p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
        <h3 className="text-xl font-bold text-zinc-100 mb-2">2.4 — Create a Cliff Vesting Stream</h3>
        <p className="text-sm text-zinc-400 mb-4">Tokens are fully locked until the cliff date, then 100% unlocks at once.</p>
        <CodeSnippet code={`const now     = Math.floor(Date.now() / 1000);
const startTs = new BN(now + 60);
const cliffTs = new BN(now + 15_552_000);    // 6-month cliff
const endTs   = new BN(now + 15_552_060);    // must be > cliffTs
const amount  = new BN(500_000_000_000);     // 500,000 tokens

await client.createStream(
  recipient, mint, amount, startTs, cliffTs, endTs,
  1,   // vesting_type: Cliff
  [],
  new BN(Date.now())
);`} />
      </section>

      {/* 2.5 Create Milestone */}
      <section id="create-milestone" className="scroll-mt-24 p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
        <h3 className="text-xl font-bold text-zinc-100 mb-2">2.5 — Create a Milestone Vesting Stream</h3>
        <p className="text-sm text-zinc-400 mb-4">Tokens split across discrete milestones. Creator must unlock each milestone sequentially.</p>
        <CodeSnippet code={`// 4 equal milestones of 250,000 tokens each = 1,000,000 total
const milestones = [
  { amount: new BN(250_000_000_000) },
  { amount: new BN(250_000_000_000) },
  { amount: new BN(250_000_000_000) },
  { amount: new BN(250_000_000_000) },
];
const totalAmount = new BN(1_000_000_000_000);

// IMPORTANT: sum of milestone amounts must == totalAmount
const now     = Math.floor(Date.now() / 1000);
const startTs = new BN(now + 60);
const cliffTs = new BN(now + 60);
const endTs   = new BN(now + 3600);

await client.createStream(
  recipient, mint, totalAmount,
  startTs, cliffTs, endTs,
  2,           // vesting_type: Milestone
  milestones,
  new BN(Date.now())
);`} />

        <div className="mt-4 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-400">For Milestone streams, the SDK automatically derives all MilestonePDA accounts and passes them as <code className="text-indigo-300">remainingAccounts</code>. You do not need to manually construct the PDAs.</p>
        </div>
      </section>

      {/* 2.6 Unlock Milestone */}
      <section id="unlock-milestone" className="scroll-mt-24 p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
        <h3 className="text-xl font-bold text-zinc-100 mb-4">2.6 — Unlock a Milestone</h3>
        <CodeSnippet code={`const streamPDA = new PublicKey('STREAM_PDA_ADDRESS');

// Unlock the first milestone (index 0)
await client.unlockMilestone(streamPDA, 0);

// Unlock the second milestone (index 1) — only valid after index 0
await client.unlockMilestone(streamPDA, 1);`} />
      </section>

      {/* 2.7 Withdraw */}
      <section id="withdraw" className="scroll-mt-24 p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
        <h3 className="text-xl font-bold text-zinc-100 mb-2">2.7 — Withdraw Vested Tokens</h3>
        <p className="text-sm text-zinc-400 mb-4">As the recipient, claim all currently unlocked tokens. A $0.99 SOL fee is charged per call.</p>
        <CodeSnippet code={`const streamPDA = new PublicKey('STREAM_PDA_ADDRESS');

// Withdraw with optional status callback
await client.withdraw(
  streamPDA,
  (status) => {
    // status: 'wallet_approval' | 'sending' | 'confirming'
    console.log('Transaction status:', status);
  }
);`} />

        <div className="mt-4 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-400">The withdraw instruction requires the Chainlink SOL/USD feed account. The SDK resolves this automatically. Ensure your RPC endpoint is connected to <strong className="text-zinc-200">Devnet</strong> where the feed is deployed.</p>
        </div>
      </section>

      {/* 2.8 Cancel */}
      <section id="cancel-stream" className="scroll-mt-24 p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
        <h3 className="text-xl font-bold text-zinc-100 mb-4">2.8 — Cancel a Stream</h3>
        <CodeSnippet code={`const streamPDA = new PublicKey('STREAM_PDA_ADDRESS');

// Only callable by the stream creator
await client.cancel(streamPDA);
// Unvested tokens returned to creator
// Already-vested-unwithdrawable tokens sent to recipient`} />
      </section>

      {/* 2.9 Edit Milestone */}
      <section id="edit-milestone" className="scroll-mt-24 p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
        <h3 className="text-xl font-bold text-zinc-100 mb-4">2.9 — Edit a Milestone Allocation</h3>
        <CodeSnippet code={`const streamPDA     = new PublicKey('STREAM_PDA_ADDRESS');
const mint          = new PublicKey('TOKEN_MINT_ADDRESS');
const milestoneIdx  = 2;                           // 0-based index
const newAmount     = new BN(300_000_000_000);     // new allocation

// If new > old: tokens pulled from creator wallet into vault
// If new < old: excess tokens returned from vault to creator
await client.editMilestone(streamPDA, mint, milestoneIdx, newAmount);`} />
      </section>

      {/* 2.10 Edit Linear */}
      <section id="edit-linear" className="scroll-mt-24 p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
        <h3 className="text-xl font-bold text-zinc-100 mb-4">2.10 — Extend a Linear Stream</h3>
        <CodeSnippet code={`const streamPDA   = new PublicKey('STREAM_PDA_ADDRESS');
const mint        = new PublicKey('TOKEN_MINT_ADDRESS');
const now         = Math.floor(Date.now() / 1000);
const newEndTs    = new BN(now + 63_072_000); // extend by 2 years total
const topupAmount = new BN(500_000_000_000);  // add 500,000 tokens

// Pass stream.end_ts to skip extension, or 0 to only extend without topup
await client.editLinear(streamPDA, mint, newEndTs, topupAmount);`} />
      </section>

      {/* 2.11 Edit Cliff */}
      <section id="edit-cliff" className="scroll-mt-24 p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
        <h3 className="text-xl font-bold text-zinc-100 mb-4">2.11 — Update a Cliff Timestamp</h3>
        <CodeSnippet code={`const streamPDA  = new PublicKey('STREAM_PDA_ADDRESS');
const now        = Math.floor(Date.now() / 1000);
const newCliffTs = new BN(now + 7_776_000); // new 90-day cliff

// Only callable by creator, before any withdrawals
await client.editCliff(streamPDA, newCliffTs);`} />
      </section>

      {/* 2.12 Error Handling */}
      <section id="error-handling" className="scroll-mt-24 p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
        <h3 className="text-xl font-bold text-zinc-100 mb-4">2.12 — Error Handling Pattern</h3>
        <CodeSnippet code={`import { AnchorError } from '@coral-xyz/anchor';

try {
  await client.withdraw(streamPDA);
} catch (err) {
  if (err instanceof AnchorError) {
    switch (err.error.errorCode.code) {
      case 'NothingToWithdraw':
        console.log('No tokens available yet');
        break;
      case 'StaleOraclePrice':
        console.log('Oracle data is stale (>1h). Retry shortly.');
        break;
      case 'InsufficientBalance':
        console.log('Insufficient SOL for fee payment');
        break;
      default:
        console.error('Program error:', err.error.errorMessage);
    }
  }
}`} />
      </section>
    </div>
  );
}
