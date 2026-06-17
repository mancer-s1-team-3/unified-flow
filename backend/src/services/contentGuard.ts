// Server-side content guard for the AI chat.
// Screens user messages for prompt-injection / jailbreak attempts and obvious
// abuse BEFORE they reach ASI:One — heuristic only, no extra LLM call, so it
// adds no latency or cost. The riskiest capability (executing transactions) is
// already gated by deterministic validation + wallet signing; this layer exists
// to stop prompt leakage, role hijacking, and token-burning abuse.
//
// Always on, always blocking — no config knobs by design.

export type GuardCategory = "injection" | "abuse";

export interface GuardVerdict {
  allowed: boolean;
  category?: GuardCategory;
  /** Short internal label for logs/tuning — never shown to the user. */
  reason?: string;
}

// Shown verbatim to the user when a message is blocked. Deliberately vague about
// *why* so it doesn't coach someone toward a phrasing that slips past the rules.
export const REFUSAL_MESSAGE =
  "I can only help with the Unified Flow vesting platform — creating, managing, and understanding token streams. Could you rephrase your question around that?";

// Hard ceiling purely to bound regex work on pathological input. The UI caps
// input at 2000 chars; anything far past that is treated as abuse, not chat.
const MAX_MESSAGE_CHARS = 8000;

// Strip zero-width / bidi control chars and NFKC-normalize so obfuscated
// injections ("ig​nore previous instructions", full-width chars) can't slip
// past the patterns below. Runs of spaces/tabs collapse, but newlines are kept
// so the fake-role-marker rule can still anchor to a line start.
export function normalizeForScreening(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF\u202A-\u202E]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

interface Rule {
  label: string;
  category: GuardCategory;
  pattern: RegExp;
}

// Patterns target injection *phrasing*, not generic words, to keep false
// positives low — benign vesting questions like "how do I ignore the cliff?" or
// "can you act as a guide?" must pass. English + a few Indonesian variants;
// expand the Indonesian set from real flagged-traffic logs.
const RULES: Rule[] = [
  {
    label: "ignore-instructions",
    category: "injection",
    pattern:
      /\b(ignore|disregard|forget)\b.{0,30}\b(previous|prior|above|earlier|all|any|your)\b.{0,20}\b(instructions?|prompts?|rules?|guidelines?)\b/i,
  },
  {
    label: "ignore-instructions-id",
    category: "injection",
    pattern: /\b(abaikan|lupakan)\b.{0,30}\b(instruksi|aturan|perintah|panduan)\b/i,
  },
  {
    // The literal phrase is almost never typed by a real vesting user.
    label: "system-prompt-literal",
    category: "injection",
    pattern: /\bsystem prompt\b|\bprompt sistem\b/i,
  },
  {
    label: "reveal-instructions",
    category: "injection",
    pattern:
      /\b(reveal|show|print|repeat|display|leak|output|expose)\b.{0,30}\b(your|the original|the initial|your system)\b.{0,15}\b(prompt|instructions?|guidelines?|rules?)\b/i,
  },
  {
    label: "role-redefine",
    category: "injection",
    pattern:
      /\byou are now\b|\byou are no longer\b|\bpretend (you are|to be|that you)\b/i,
  },
  {
    label: "jailbreak",
    category: "injection",
    pattern:
      /\bdeveloper mode\b|\bjailbreak\b|\bDAN mode\b|\bdo anything now\b|\bwithout (any )?(restrictions?|filters?|guidelines?|censorship)\b/i,
  },
  {
    // Fake role marker on its own line tries to forge a system/assistant turn.
    label: "role-marker-injection",
    category: "injection",
    pattern: /(^|\n)[ \t]*(system|assistant|developer)\s*:/i,
  },
  {
    // "new instructions:" / "updated system prompt:" — colon makes it high-signal.
    label: "override-instructions",
    category: "injection",
    pattern: /\b(new|updated|real|actual)\s+(instructions?|system prompt|rules?)\s*:/i,
  },
];

/**
 * Screen a raw user message. Synchronous and cheap — safe to call on every
 * request. Returns `{ allowed: true }` for anything that doesn't trip a rule.
 */
export function screenUserMessage(rawText: unknown): GuardVerdict {
  if (typeof rawText !== "string") {
    return { allowed: false, category: "abuse", reason: "non-string" };
  }
  if (rawText.length > MAX_MESSAGE_CHARS) {
    return { allowed: false, category: "abuse", reason: "too-long" };
  }

  const text = normalizeForScreening(rawText);
  if (!text) return { allowed: true }; // empty after normalize; endpoint handles emptiness

  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return { allowed: false, category: rule.category, reason: rule.label };
    }
  }
  return { allowed: true };
}
