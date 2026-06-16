"use client";

import React, { useState } from "react";
import { Wrench, ChevronDown, ChevronRight, CheckCircle, AlertTriangle, Hash } from "lucide-react";

type ADR = {
  id: string;
  title: string;
  context: string;
  decision: string;
  options: { option: string; pros: string[]; cons: string[] }[];
  consequences: { type: "positive" | "tradeoff"; text: string }[];
  codeSnippet?: { label: string; code: string };
};

const adrs: ADR[] = [
  {
    id: "ADR-001",
    title: "Nonce-Based Stream PDA Derivation",
    context:
      "The program needs to uniquely identify each stream on-chain. Deriving the PDA from creator + recipient alone limits each pair to one active stream at a time — impractical for protocols distributing multiple token types or vesting schedules to the same employee.",
    decision:
      'Nonce-based derivation was chosen: PDA seeds = ["stream", creator, recipient, nonce.to_le_bytes()]. The caller provides a unique nonce — typically derived from Date.now() or a counter. The backend indexer listens to StreamCreated events which include the nonce for re-derivation.',
    options: [
      {
        option: "PDA = [stream, creator, recipient]",
        pros: ["Simple derivation"],
        cons: ["Only 1 stream per creator-recipient pair ever"],
      },
      {
        option: "PDA = [stream, creator, recipient, mint]",
        pros: ["Supports multiple mints"],
        cons: ["Still 1 stream per mint per pair"],
      },
      {
        option: "PDA = [stream, creator, recipient, nonce] ✓",
        pros: ["Unlimited streams per pair"],
        cons: ["Caller must track/generate nonces"],
      },
      {
        option: "PDA = [stream, creator, recipient, timestamp]",
        pros: ["Auto-unique via time"],
        cons: ["Block time collisions possible; not deterministic"],
      },
    ],
    consequences: [
      { type: "positive", text: "Unlimited concurrent streams between any creator-recipient pair." },
      { type: "positive", text: "Works for multi-token distributions (USDC + project token simultaneously)." },
      { type: "positive", text: "Nonce stored in StreamAccount for re-derivation by clients." },
      {
        type: "tradeoff",
        text: "Clients must store or enumerate the nonce to re-derive the PDA. Mitigated by backend indexer listening to StreamCreated events.",
      },
      {
        type: "tradeoff",
        text: "Accidental nonce reuse fails at create time (PDA already initialized) — safe behavior by design.",
      },
    ],
  },
  {
    id: "ADR-002",
    title: "Chainlink Oracle for Dynamic SOL Fee Pricing",
    context:
      "The protocol charges a $0.99 USD protocol fee on every withdrawal collected in SOL. A hardcoded lamport amount would over- or under-charge users as SOL/USD fluctuates. A real-time, permissionless pricing mechanism was required.",
    decision:
      "Chainlink's on-chain SOL/USD feed (Devnet: 99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR) is used. The program reads the latest round answer and decimals from the feed account inside the withdraw instruction, with a 1-hour staleness guard.",
    options: [
      {
        option: "Fixed lamport amount",
        pros: ["Zero complexity"],
        cons: ["Fee value fluctuates wildly with SOL price"],
      },
      {
        option: "Admin-settable fee lamports via config",
        pros: ["Flexible, manual control"],
        cons: ["Admin burden; stale during volatile markets"],
      },
      {
        option: "Pyth Network oracle",
        pros: ["Mainstream Solana oracle"],
        cons: ["Different feed address on Devnet; setup complexity"],
      },
      {
        option: "Chainlink on-chain feed ✓",
        pros: ["Real-time, permissionless, Devnet support"],
        cons: ["Adds Chainlink account constraints; staleness check needed"],
      },
    ],
    consequences: [
      { type: "positive", text: "Users always pay exactly ~$0.99 USD regardless of SOL price movements." },
      { type: "positive", text: "No admin intervention needed for fee adjustments." },
      { type: "positive", text: "Staleness guard (1h) prevents stale price exploitation." },
      {
        type: "tradeoff",
        text: "If the Chainlink feed is stale, all withdrawals are blocked until it recovers. Acceptable on Devnet; production would need a fallback.",
      },
      {
        type: "tradeoff",
        text: "Feed account must be passed in every withdraw call. Mitigated by SDK auto-resolution.",
      },
      {
        type: "tradeoff",
        text: "fee_lamports amount varies slightly between transactions — requires clear UX communication.",
      },
    ],
    codeSnippet: {
      label: "oracle.rs — withdraw fee computation",
      code: `// In oracle.rs / read_chainlink_round()
pub fn read_chainlink_round(feed: &AccountInfo, now: i64) -> Result<ChainlinkRound> {
    // Deserialize feed account data
    // Validate: now - round.updated_at <= 3600
    // Return: ChainlinkRound { answer: i128, decimals: u8 }
}

// In withdraw instruction:
let fee_lamports = (99 * LAMPORTS_PER_SOL * 10^decimals)
                   / (100 * oracle_answer as u128);`,
    },
  },
  {
    id: "ADR-003",
    title: "Milestone PDAs as Separate Accounts",
    context:
      "Milestone vesting requires per-milestone data: amount, approved status, unlock timestamp, and index. The question was whether to pack all milestone data inside StreamAccount as a Vec<MilestoneData> or store each as its own on-chain PDA.",
    decision:
      "Separate MilestonePDA accounts were chosen. Each milestone is a distinct PDA derived from [\"milestone\", stream_pda, milestone_index_byte]. Accounts are lazily allocated during create_stream using invoke_signed with allocate + assign, avoiding double-initialization issues.",
    options: [
      {
        option: "Pack milestones in StreamAccount Vec<>",
        pros: ["Single account read for full state"],
        cons: [
          "Account size must be pre-allocated at max (255 milestones ≈ 8KB+)",
          "Space wasted for small streams",
          "Resizing is complex",
        ],
      },
      {
        option: "Separate MilestoneAccount PDAs ✓",
        pros: [
          "Account sized exactly to need",
          "Clean separation of concerns",
          "Individual PDAs are derivable and queryable",
        ],
        cons: ["Extra accounts in transaction (up to 255 remainingAccounts)", "More complex derivation"],
      },
      {
        option: "Hybrid: pack index+status, separate for data",
        pros: ["Balance of both"],
        cons: ["Most complex implementation"],
      },
    ],
    consequences: [
      { type: "positive", text: "StreamAccount stays small and fixed-size (no dynamic Vec)." },
      { type: "positive", text: "Each MilestoneAccount can be fetched independently by the backend indexer." },
      { type: "positive", text: "Milestone allocation is exactly right-sized with no worst-case padding." },
      {
        type: "tradeoff",
        text: "create_stream for large milestone sets passes many remainingAccounts (capped at 255 by u8). Within Solana's limit for typical stream sizes (up to ~30 milestones).",
      },
      {
        type: "tradeoff",
        text: "Anti-DoS lamport check (load existing balance before topping up) adds complexity but prevents griefing attacks via pre-seeded dust.",
      },
    ],
    codeSnippet: {
      label: "Milestone PDA derivation & allocation",
      code: `// Milestone PDA seeds
[b"milestone", stream_key.as_ref(), &[milestone_index_as_u8]]

// Anti-DoS: check existing lamports before topping up
if current_lamports < required_lamports {
    let diff = required_lamports - current_lamports;
    // transfer diff from creator
}

// Only allocate + assign if account data is empty
if milestone_info.data_is_empty() {
    invoke_signed(allocate(...))
    invoke_signed(assign(...))
}`,
    },
  },
];

function ADRCard({ adr }: { adr: ADR }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/20 overflow-hidden transition-all hover:border-zinc-700">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-4 p-6 text-left group"
      >
        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
          <Hash className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold font-mono text-indigo-400 uppercase tracking-widest">
              {adr.id}
            </span>
          </div>
          <h3 className="text-base font-semibold text-zinc-100 group-hover:text-white transition-colors">
            {adr.title}
          </h3>
          <p className="text-sm text-zinc-500 mt-1.5 line-clamp-2 leading-relaxed">{adr.context}</p>
        </div>
        <div className="shrink-0 text-zinc-600 group-hover:text-zinc-400 transition-colors mt-1">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-zinc-800 px-6 pb-6 pt-5 space-y-6">
          {/* Options table */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-3">
              Options Considered
            </div>
            <div className="space-y-2">
              {adr.options.map((opt) => {
                const isChosen = opt.option.includes("✓");
                return (
                  <div
                    key={opt.option}
                    className={`rounded-xl p-3.5 border text-sm ${
                      isChosen
                        ? "bg-indigo-500/5 border-indigo-500/20"
                        : "bg-zinc-900/40 border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {isChosen && (
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-300 px-1.5 py-0.5 rounded">
                          Chosen
                        </span>
                      )}
                      <code
                        className={`font-mono text-xs ${
                          isChosen ? "text-indigo-200" : "text-zinc-400"
                        }`}
                      >
                        {opt.option.replace(" ✓", "")}
                      </code>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <div className="text-[9px] uppercase tracking-wider font-bold text-emerald-500 mb-1">Pros</div>
                        {opt.pros.map((p) => (
                          <p key={p} className="text-xs text-zinc-400 leading-relaxed">+ {p}</p>
                        ))}
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-wider font-bold text-rose-500 mb-1">Cons</div>
                        {opt.cons.map((c) => (
                          <p key={c} className="text-xs text-zinc-400 leading-relaxed">− {c}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Decision */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-2">Decision</div>
            <p className="text-sm text-zinc-300 leading-relaxed">{adr.decision}</p>
          </div>

          {/* Code snippet */}
          {adr.codeSnippet && (
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-2">
                {adr.codeSnippet.label}
              </div>
              <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs font-mono text-zinc-300 overflow-x-auto leading-relaxed">
                <code>{adr.codeSnippet.code}</code>
              </pre>
            </div>
          )}

          {/* Consequences */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-3">
              Consequences
            </div>
            <div className="space-y-2">
              {adr.consequences.map((c, i) => (
                <div key={i} className="flex gap-2.5 text-sm">
                  {c.type === "positive" ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <span className={c.type === "positive" ? "text-zinc-300" : "text-zinc-400"}>
                    {c.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ADRPage() {
  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-indigo-400" />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Architecture</span>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-100 mb-4">
          Decision Records
        </h1>
        <p className="text-lg text-zinc-400 font-light leading-relaxed">
          Key architectural decisions made during the design of Unified Flow — documenting context, options
          considered, decisions taken, and their trade-offs.
        </p>
      </div>

      <div className="space-y-4">
        {adrs.map((adr) => (
          <ADRCard key={adr.id} adr={adr} />
        ))}
      </div>
    </div>
  );
}