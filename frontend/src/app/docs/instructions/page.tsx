import React from "react";
import { FileCode, AlertTriangle, Terminal } from "lucide-react";
import { CodeSnippet } from "@/components/docs/CodeSnippet";

/* ── helper components ──────────────────────────────────────────── */
const ParamTable = ({ params }: { params: { name: string; type: string; desc: string }[] }) => (
  <div className="overflow-x-auto mt-4">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-zinc-800">
          <th className="text-left py-2 pr-4 text-zinc-400 font-semibold text-xs">Parameter</th>
          <th className="text-left py-2 pr-4 text-zinc-400 font-semibold text-xs">Type</th>
          <th className="text-left py-2 text-zinc-400 font-semibold text-xs">Description</th>
        </tr>
      </thead>
      <tbody>
        {params.map((p) => (
          <tr key={p.name} className="border-b border-zinc-800/50">
            <td className="py-2.5 pr-4 font-mono text-indigo-400 text-xs">{p.name}</td>
            <td className="py-2.5 pr-4 font-mono text-zinc-300 text-xs">{p.type}</td>
            <td className="py-2.5 text-zinc-400 text-xs">{p.desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const ErrorTable = ({ errors }: { errors: { code: string; desc: string }[] }) => (
  <div className="mt-4">
    <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
      <AlertTriangle className="w-3.5 h-3.5" /> Error Codes
    </h4>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left py-2 pr-4 text-zinc-400 font-semibold text-xs">Error Code</th>
            <th className="text-left py-2 text-zinc-400 font-semibold text-xs">Description</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((e) => (
            <tr key={e.code} className="border-b border-zinc-800/50">
              <td className="py-2 pr-4 font-mono text-rose-400 text-xs">{e.code}</td>
              <td className="py-2 text-zinc-400 text-xs">{e.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const ExampleUsage = ({ code }: { code: string }) => (
  <div className="mt-6">
    <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
      <Terminal className="w-3.5 h-3.5" /> Example Usage
    </h4>
    <CodeSnippet code={code} />
  </div>
);

const InstructionCard = ({ id, title, desc, children }: { id: string; title: string; desc: string; children: React.ReactNode }) => (
  <section id={id} className="scroll-mt-24 p-6 rounded-2xl bg-zinc-900/20 border border-zinc-800">
    <h3 className="text-xl font-bold text-zinc-100 font-mono mb-2">{title}</h3>
    <p className="text-sm text-zinc-400 leading-relaxed mb-4">{desc}</p>
    {children}
  </section>
);

/* ── main page ──────────────────────────────────────────────────── */
export default function InstructionsPage() {
  return (
    <div className="space-y-10 animate-fadeIn">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-100 flex items-center gap-3 mb-4">
          <FileCode className="w-8 h-8 text-indigo-400" />
          Instruction Reference
        </h1>
        <p className="text-lg text-zinc-400 font-light leading-relaxed">
          Every on-chain instruction exposed by the Unified Flow program, with parameters, access controls, error codes, and example usage.
        </p>
        <div className="mt-5 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10 text-sm text-zinc-400 leading-relaxed">
          Example snippets use the TypeScript SDK <code className="text-indigo-300 font-mono text-xs">UnifiedFlowClient</code>{" "}
          (referenced as <code className="text-indigo-300 font-mono text-xs">client</code>) — see the{" "}
          <a href="/docs/guide" className="text-indigo-400 underline hover:text-indigo-300">Integration Guide</a> for how to
          initialize it. Admin-only instructions (<code className="text-indigo-300 font-mono text-xs">initialize_config</code>,{" "}
          <code className="text-indigo-300 font-mono text-xs">withdraw_fees</code>) are not wrapped by the SDK and are called
          directly through the raw Anchor <code className="text-indigo-300 font-mono text-xs">program</code> instance.
        </div>
      </div>

      {/* ── create_stream ── */}
      <InstructionCard
        id="create_stream"
        title="create_stream"
        desc="Initializes a new token vesting stream, derives all required PDAs, and transfers the total token amount into a program-controlled vault ATA. Supports Linear (0), Cliff (1), and Milestone (2) vesting models."
      >
        <ParamTable params={[
          { name: "amount", type: "u64", desc: "Total SPL tokens to lock. Must be > 0." },
          { name: "start_ts", type: "i64", desc: "Vesting start timestamp. Must be >= now for linear/cliff." },
          { name: "cliff_ts", type: "i64", desc: "Cliff unlock timestamp. For linear: set equal to start_ts. For cliff: between start_ts and end_ts." },
          { name: "end_ts", type: "i64", desc: "Vesting end. Must be > start_ts and > now for linear/cliff." },
          { name: "vesting_type", type: "u8", desc: "0 = Linear, 1 = Cliff, 2 = Milestone." },
          { name: "milestones", type: "Vec<MilestoneInput>", desc: "Ordered milestone amounts (type 2 only). Sum must equal amount." },
          { name: "nonce", type: "u64", desc: "Unique nonce for PDA derivation. Allows multiple streams between same creator and recipient." },
        ]} />

        <div className="mt-6">
          <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">PDA Derivation</h4>
          <CodeSnippet code={`Stream PDA:    ["stream", creator, recipient, nonce.to_le_bytes()]
Vault ATA:     ATA(stream_pda, mint)
Milestone PDA: ["milestone", stream_pda, milestone_index_byte]`} />
        </div>

        <div className="mt-6">
          <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">Validation Rules</h4>
          <ul className="text-xs text-zinc-400 space-y-1.5 list-disc list-inside">
            <li>Type 0/1: requires milestones = [], start_ts {">"}= now, end_ts {">"} start_ts, duration {">"}= 60s.</li>
            <li>Type 1 (Cliff): additionally requires cliff_ts between start_ts and end_ts.</li>
            <li>Type 2 (Milestone): at least 1 milestone, all amounts {">"} 0, sum == total, count {"<"}= 255.</li>
            <li>Creator cannot be the same address as recipient.</li>
            <li>Token mint must be in allowed_mints list (if non-empty).</li>
            <li>Creator token account must hold at least <code className="text-indigo-300">amount</code> tokens.</li>
          </ul>
        </div>

        <ErrorTable errors={[
          { code: "InvalidAmount", desc: "amount = 0, or any milestone amount = 0." },
          { code: "InvalidSchedule", desc: "end_ts <= start_ts, or cliff_ts outside [start_ts, end_ts]." },
          { code: "InvalidStartDate", desc: "start_ts < now for linear/cliff." },
          { code: "InvalidEndDate", desc: "end_ts <= now." },
          { code: "DurationTooShort", desc: "end_ts - start_ts < 60 seconds." },
          { code: "InvalidVestingType", desc: "vesting_type > 2." },
          { code: "InvalidMilestoneCount", desc: "Non-zero milestones for linear/cliff, or zero for milestone type." },
          { code: "InvalidMilestoneAmount", desc: "Sum of milestone amounts != total amount." },
          { code: "InvalidRecipient", desc: "creator == recipient." },
          { code: "InvalidMint", desc: "Mint mismatch between accounts." },
          { code: "MintNotAllowed", desc: "Mint not in protocol's allowed_mints list." },
          { code: "InsufficientBalance", desc: "Creator token account balance < amount." },
          { code: "TransferFeeMintUnsupported", desc: "vault.amount != amount after transfer." },
          { code: "ProtocolPaused", desc: "Config paused flag is set." },
        ]} />

        <ExampleUsage code={`import { BN } from "@coral-xyz/anchor";

// Linear stream: 1,000 tokens (6 decimals) vesting over 1 year
const now = Math.floor(Date.now() / 1000);

const { signature } = await client.createStream(
  recipient,                 // PublicKey of the receiver
  mint,                      // SPL token mint PublicKey
  new BN(1_000_000_000),     // amount
  new BN(now + 60),          // start_ts (starts in 60s)
  new BN(now + 60),          // cliff_ts (= start_ts for linear)
  new BN(now + 31_536_000),  // end_ts (1 year)
  0,                         // vesting_type: 0 = Linear
  [],                        // milestones (empty for linear/cliff)
  new BN(Date.now())         // unique nonce
);
console.log("Stream created:", signature);`} />
      </InstructionCard>

      {/* ── withdraw ── */}
      <InstructionCard
        id="withdraw"
        title="withdraw"
        desc="Allows the stream recipient to claim all currently vested tokens. A fixed $0.99 USD protocol fee in SOL is charged per call, priced in real time via the Chainlink SOL/USD on-chain feed."
      >
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 mb-4">
          <p className="text-xs text-zinc-400">No parameters — the instruction reads all required data from the stream account.</p>
        </div>

        <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">Unlock Formula (Linear/Cliff)</h4>
        <CodeSnippet code={`vested    = total_amount * (elapsed / duration)
claimable = vested - already_withdrawn

where elapsed  = now - start_ts
      duration = end_ts - start_ts`} />

        <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mt-6 mb-2">Unlock Formula (Milestone)</h4>
        <CodeSnippet code={`vested    = stream.unlocked_milestone_amount
claimable = vested - stream.withdrawn`} />

        <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mt-6 mb-2">Fee Calculation</h4>
        <CodeSnippet code={`fee_lamports = (99 * LAMPORTS_PER_SOL * 10^oracle_decimals)
               / (100 * oracle_answer)
// $0.99 USD expressed in lamports using live Chainlink SOL/USD price`} />

        <div className="mt-6">
          <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">Side Effects</h4>
          <ul className="text-xs text-zinc-400 space-y-1.5 list-disc list-inside">
            <li><code className="text-zinc-300">stream.withdrawn += claimable</code></li>
            <li>Status set to <code className="text-emerald-400">COMPLETED (2)</code> when withdrawn == total_amount</li>
            <li>fee_lamports transferred from recipient SOL wallet to fee_vault PDA</li>
            <li>Emits <code className="text-indigo-300">TokensClaimed</code> event</li>
          </ul>
        </div>

        <ErrorTable errors={[
          { code: "Unauthorized", desc: "Signer is not the stream recipient." },
          { code: "StreamNotActive", desc: "Stream status is not ACTIVE or COMPLETED." },
          { code: "NothingToWithdraw", desc: "claimable == 0." },
          { code: "ProtocolPaused", desc: "Protocol is currently paused." },
          { code: "InvalidOracleFeed", desc: "Chainlink feed address or owner mismatch." },
          { code: "StaleOraclePrice", desc: "Oracle timestamp > 1 hour old." },
        ]} />

        <ExampleUsage code={`// Called by the recipient. Claims all currently vested tokens
// and pays the ~$0.99 USD (in SOL) protocol fee.
const { signature } = await client.withdraw(
  streamPDA,
  (phase) => console.log("status:", phase) // optional: wallet_approval | sending | confirming
);
console.log("Withdrawn:", signature);`} />
      </InstructionCard>

      {/* ── cancel ── */}
      <InstructionCard
        id="cancel"
        title="cancel"
        desc="Allows the stream creator to cancel an active stream. Unvested tokens are returned to the creator. Any vested-but-unwithdrawn tokens go to the recipient. Already-withdrawn amounts are non-refundable."
      >
        <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">Token Distribution on Cancel</h4>
        <CodeSnippet code={`vested              = vested_amount(stream, now)
for_recipient       = vested - stream.withdrawn
returned_to_creator = stream.total_amount - vested`} />

        <div className="mt-6">
          <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">Side Effects</h4>
          <ul className="text-xs text-zinc-400 space-y-1.5 list-disc list-inside">
            <li><code className="text-zinc-300">stream.cancelled = true</code></li>
            <li>Status set to <code className="text-rose-400">CANCELLED (3)</code></li>
            <li>Emits <code className="text-indigo-300">StreamCancelled</code> event</li>
          </ul>
        </div>

        <ErrorTable errors={[
          { code: "Unauthorized", desc: "Signer is not the stream creator." },
          { code: "AlreadyCancelled", desc: "stream.cancelled is already true." },
          { code: "FullyVested", desc: "All tokens have vested; nothing to return." },
          { code: "ProtocolPaused", desc: "Protocol is currently paused." },
        ]} />

        <ExampleUsage code={`// Called by the stream creator. Unvested tokens are refunded
// to the creator; vested-but-unwithdrawn tokens go to the recipient.
const { signature } = await client.cancel(streamPDA);
console.log("Cancelled:", signature);`} />
      </InstructionCard>

      {/* ── unlock_milestone ── */}
      <InstructionCard
        id="unlock_milestone"
        title="unlock_milestone"
        desc="Unlocks the next sequential milestone in a Milestone vesting stream. Must be called in index order — milestone i must be unlocked before milestone i+1. Only the stream creator can unlock milestones."
      >
        <div className="mt-4">
          <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">Validation</h4>
          <ul className="text-xs text-zinc-400 space-y-1.5 list-disc list-inside">
            <li>stream.vesting_type must be <code className="text-amber-300">MILESTONE (2)</code></li>
            <li>stream.status must be <code className="text-emerald-400">ACTIVE (1)</code></li>
            <li>Milestone index must equal stream.next_milestone_index (sequential enforcement)</li>
            <li>Milestone must not already be approved/unlocked</li>
          </ul>
        </div>

        <div className="mt-6">
          <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">Side Effects</h4>
          <ul className="text-xs text-zinc-400 space-y-1.5 list-disc list-inside">
            <li><code className="text-zinc-300">milestone.approved = true, milestone.unlocked = true</code></li>
            <li><code className="text-zinc-300">milestone.unlock_ts</code> set to current timestamp</li>
            <li><code className="text-zinc-300">stream.unlocked_milestone_amount += milestone.amount</code></li>
            <li><code className="text-zinc-300">stream.next_milestone_index += 1</code></li>
            <li>Status set to <code className="text-emerald-400">COMPLETED</code> when all milestones unlocked</li>
            <li>Emits <code className="text-indigo-300">MilestoneUnlocked</code> event</li>
          </ul>
        </div>

        <ErrorTable errors={[
          { code: "StreamNotActive", desc: "Stream is not in ACTIVE status." },
          { code: "InvalidVestingType", desc: "Stream is not of milestone type." },
          { code: "InvalidMilestoneOrder", desc: "Attempted to unlock out-of-sequence milestone." },
          { code: "MilestoneAlreadyUnlocked", desc: "Milestone is already approved." },
          { code: "Unauthorized", desc: "Signer is not the stream creator." },
        ]} />

        <ExampleUsage code={`// Called by the creator. Milestones must be unlocked in order:
// index 0 first, then 1, then 2 ...
await client.unlockMilestone(streamPDA, 0);
await client.unlockMilestone(streamPDA, 1);`} />
      </InstructionCard>

      {/* ── edit_milestone ── */}
      <InstructionCard
        id="edit_milestone"
        title="edit_milestone"
        desc="Modifies the allocation of an un-unlocked milestone. The program automatically adjusts the vault token balance — depositing more tokens from the creator if the new amount is higher, or refunding excess if lower."
      >
        <ParamTable params={[
          { name: "new_amount", type: "u64", desc: "New allocation for the milestone. Must be > 0." },
        ]} />

        <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mt-6 mb-2">Vault Rebalancing Logic</h4>
        <CodeSnippet code={`if new_amount > old_amount:
    diff = new_amount - old_amount
    transfer diff FROM creator_token_account TO vault
    stream.total_amount += diff

if new_amount < old_amount:
    diff = old_amount - new_amount
    transfer diff FROM vault TO creator_token_account
    stream.total_amount -= diff
    require: stream.total_amount >= stream.withdrawn`} />

        <ErrorTable errors={[
          { code: "StreamNotActive", desc: "Stream is not ACTIVE." },
          { code: "InvalidVestingType", desc: "Stream is not of milestone type." },
          { code: "MilestoneAlreadyUnlocked", desc: "Milestone is already unlocked." },
          { code: "InvalidAmount", desc: "new_amount is 0." },
          { code: "InsufficientBalance", desc: "Creator balance insufficient for top-up." },
        ]} />

        <ExampleUsage code={`import { BN } from "@coral-xyz/anchor";

// Resize milestone index 2 to 300,000 tokens.
// The vault auto-rebalances: tops up from, or refunds to, the creator.
// Note: the mint is resolved internally — no mint argument is required.
await client.editMilestone(
  streamPDA,
  2,                         // milestone index (0-based)
  new BN(300_000_000_000)    // new amount
);`} />
      </InstructionCard>

      {/* ── edit_cliff ── */}
      <InstructionCard
        id="edit_cliff"
        title="edit_cliff"
        desc="Modifies the cliff timestamp of an existing Cliff vesting stream. Only possible before any tokens have been withdrawn and before the stream expires."
      >
        <ParamTable params={[
          { name: "new_cliff_ts", type: "i64", desc: "New cliff timestamp. Must be in range [start_ts, end_ts] and >= now." },
        ]} />

        <div className="mt-6">
          <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">Validation</h4>
          <ul className="text-xs text-zinc-400 space-y-1.5 list-disc list-inside">
            <li>Stream must be of <code className="text-violet-300">CLIFF type (1)</code></li>
            <li>Stream must be ACTIVE</li>
            <li>now {"<"} stream.end_ts (stream not expired)</li>
            <li>stream.withdrawn == 0 (no tokens yet claimed)</li>
            <li>new_cliff_ts must satisfy: start_ts {"<="} new_cliff_ts {"<="} end_ts and new_cliff_ts {">="} now</li>
          </ul>
        </div>

        <ExampleUsage code={`import { BN } from "@coral-xyz/anchor";

// Move the cliff to 90 days from now (cliff streams only,
// before any withdrawal has been made).
const now = Math.floor(Date.now() / 1000);
await client.editCliff(streamPDA, new BN(now + 7_776_000));`} />
      </InstructionCard>

      {/* ── edit_linear ── */}
      <InstructionCard
        id="edit_linear"
        title="edit_linear"
        desc="Extends the end timestamp and/or tops up the total allocation of a Linear or Cliff vesting stream. Both parameters are optional — at least one must be non-zero/different."
      >
        <ParamTable params={[
          { name: "new_end_ts", type: "i64", desc: "New end timestamp. Must be > current end_ts. Pass current end_ts to skip." },
          { name: "topup_amount", type: "u64", desc: "Additional tokens to add to total_amount. Pass 0 to skip." },
        ]} />

        <div className="mt-6">
          <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">Validation</h4>
          <ul className="text-xs text-zinc-400 space-y-1.5 list-disc list-inside">
            <li>Stream must be <code className="text-cyan-300">LINEAR (0)</code> or <code className="text-violet-300">CLIFF (1)</code></li>
            <li>Stream must be ACTIVE</li>
            <li>now {"<"} stream.end_ts (stream not expired)</li>
            <li>At least one of: new_end_ts {">"} current end_ts OR topup_amount {">"} 0</li>
            <li>Creator token account must hold {">="} topup_amount if top-up is requested</li>
          </ul>
        </div>

        <ExampleUsage code={`import { BN } from "@coral-xyz/anchor";

// Extend the end date and top up 500,000 tokens in one call.
// Pass the current end_ts to skip the extension, or new BN(0) as
// topup to only extend. The mint is resolved internally.
const now = Math.floor(Date.now() / 1000);
await client.editLinear(
  streamPDA,
  new BN(now + 63_072_000),  // new end_ts (must be > current end_ts)
  new BN(500_000_000_000)    // topup_amount (new BN(0) to skip)
);`} />
      </InstructionCard>

      {/* ── initialize_config ── */}
      <InstructionCard
        id="initialize_config"
        title="initialize_config"
        desc="One-time initialization of the global protocol configuration PDA. Must be called by the admin once before any streams can be created."
      >
        <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">Default Values Set</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-2 pr-4 text-zinc-400 font-semibold text-xs">Field</th>
                <th className="text-left py-2 pr-4 text-zinc-400 font-semibold text-xs">Default</th>
                <th className="text-left py-2 text-zinc-400 font-semibold text-xs">Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                { field: "admin_authority", val: "admin.key()", desc: "Protocol admin pubkey" },
                { field: "fee_authority", val: "admin.key()", desc: "Withdrawal fee recipient" },
                { field: "paused", val: "false", desc: "Protocol not paused" },
                { field: "withdraw_fee_bps", val: "100 (1%)", desc: "Withdraw fee in basis points" },
                { field: "max_withdraw_fee_bps", val: "500 (5%)", desc: "Maximum allowed fee" },
                { field: "fee_change_timelock_secs", val: "86400 (24h)", desc: "Timelock for fee changes" },
                { field: "allowed_mints", val: "[] (empty)", desc: "Empty = all mints allowed" },
              ].map((r) => (
                <tr key={r.field} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-4 font-mono text-indigo-400 text-xs">{r.field}</td>
                  <td className="py-2 pr-4 font-mono text-zinc-300 text-xs">{r.val}</td>
                  <td className="py-2 text-zinc-400 text-xs">{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ExampleUsage code={`import { PublicKey, SystemProgram } from "@solana/web3.js";

// Admin-only, one-time. Not wrapped by the SDK — call it through
// the raw Anchor program instance.
const [config] = PublicKey.findProgramAddressSync(
  [Buffer.from("config")],
  program.programId
);

await program.methods
  .initializeConfig()
  .accounts({
    admin: wallet.publicKey,
    config,
    systemProgram: SystemProgram.programId,
  })
  .rpc();

// CLI equivalent: unifiedflow init`} />
      </InstructionCard>

      {/* ── withdraw_fees ── */}
      <InstructionCard
        id="withdraw_fees"
        title="withdraw_fees"
        desc="Allows the protocol fee authority to withdraw accumulated SOL from the fee_vault PDA to a destination account."
      >
        <ParamTable params={[
          { name: "amount", type: "u64", desc: "Lamports to withdraw from fee_vault." },
        ]} />
        <div className="mt-4">
          <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">Access Control</h4>
          <ul className="text-xs text-zinc-400 space-y-1.5 list-disc list-inside">
            <li>Signer must be <code className="text-indigo-300">config.fee_authority</code></li>
            <li>fee_vault.lamports() {">="} amount</li>
          </ul>
        </div>

        <ExampleUsage code={`import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

// Admin-only. Withdraw accumulated SOL fees from the fee_vault PDA.
const [config]   = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
const [feeVault] = PublicKey.findProgramAddressSync([Buffer.from("fee_vault")], program.programId);

await program.methods
  .withdrawFees(new BN(1_000_000)) // lamports to withdraw
  .accounts({
    admin: wallet.publicKey,       // must equal config.fee_authority
    config,
    feeVault,
    destination: wallet.publicKey, // SOL destination
    systemProgram: SystemProgram.programId,
  })
  .rpc();`} />
      </InstructionCard>
    </div>
  );
}
