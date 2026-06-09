// ASI:One chat service (server-side).
// Owns the API key, system prompt, and tool definitions so they never reach the
// browser. Exposes a streaming generator that proxies ASI:One's SSE response as
// normalized chunks: { content, done, toolCall }.

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

export interface ChatContext {
  conversationHistory?: ChatMessage[];
  userProfile?: {
    walletAddress?: string;
    cluster?: string;
    role?: "creator" | "recipient" | "admin";
  };
  currentAction?: string;
  relevantData?: {
    streams?: unknown[];
    recentTransactions?: unknown[];
  };
}

export interface ChatChunk {
  content: string;
  done: boolean;
  toolCall?: {
    name: string;
    arguments: string;
  };
}

const MAX_HISTORY_LENGTH = 10;

const SYSTEM_PROMPT = `You are an AI assistant for the Unified Flow token distribution platform on Solana. Your role is to help users understand and use the vesting stream features.

Key features you should know about:
1. **Linear Vesting** - Tokens unlock gradually over time
2. **Cliff Vesting** - Tokens locked until cliff date, then released
3. **Milestone-Based Vesting** - Creator manually approves each tranche
4. **CSV Bulk Operations** - Create/edit multiple streams at once
5. **Squads Multisig** - Bundle actions as multisig proposals
6. **Stream Management** - Create, cancel, edit, withdraw, unlock milestones

Important guidelines:
- Be concise and helpful
- Use markdown formatting for better readability
- Provide step-by-step instructions when needed
- Warn users about irreversible actions (like canceling streams)
- If you don't know something, admit it and suggest alternatives
- Keep responses under 200 words when possible
- Use emojis sparingly but effectively

Technical details:
- Streams use PDAs (Program Derived Addresses) as identifiers
- Transaction fees are standard Solana network fees
- Supports Devnet and Mainnet clusters
- Works with any Solana-compatible wallet`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "create_stream",
      description: "Create a new vesting stream (linear, cliff, or milestone)",
      parameters: {
        type: "object",
        properties: {
          recipient: { type: "string", description: "The public key of the recipient" },
          amount: { type: "number", description: "Total token amount" },
          vesting_type: { type: "number", description: "0 for linear, 1 for cliff, 2 for milestone" },
        },
        required: ["recipient", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "withdraw_stream",
      description: "Withdraw/claim tokens from a stream",
      parameters: {
        type: "object",
        properties: {
          stream_pda: { type: "string", description: "The stream PDA public key" },
        },
        required: ["stream_pda"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_stream",
      description: "Cancel an active vesting stream",
      parameters: {
        type: "object",
        properties: {
          stream_pda: { type: "string", description: "The stream PDA public key" },
        },
        required: ["stream_pda"],
      },
    },
  },
];

function getConfig() {
  return {
    apiKey: process.env.ASIONE_API_KEY || "",
    apiUrl: process.env.ASIONE_API_URL || "https://api.asi1.ai/v1",
    model: process.env.ASIONE_MODEL || "asi1",
  };
}

export function isConfigured(): boolean {
  const { apiKey } = getConfig();
  return !!apiKey && apiKey !== "your_asione_api_key_here";
}

function buildContextInfo(context: ChatContext): string {
  const parts: string[] = [];
  if (context.userProfile?.walletAddress) {
    parts.push(`- Connected wallet: ${context.userProfile.walletAddress.slice(0, 8)}...`);
  }
  if (context.userProfile?.cluster) {
    parts.push(`- Network cluster: ${context.userProfile.cluster}`);
  }
  if (context.userProfile?.role) {
    parts.push(`- User role: ${context.userProfile.role}`);
  }
  if (context.currentAction) {
    parts.push(`- Current action: ${context.currentAction}`);
  }
  if (context.relevantData?.streams) {
    parts.push(`- Active streams: ${context.relevantData.streams.length}`);
  }
  return parts.length > 0 ? parts.join("\n") : "";
}

function buildMessages(userMessage: string, context: ChatContext): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  if (context.userProfile) {
    const contextInfo = buildContextInfo(context);
    if (contextInfo) {
      messages.push({ role: "system", content: `Current user context:\n${contextInfo}` });
    }
  }

  const recentHistory = (context.conversationHistory ?? [])
    .slice(-MAX_HISTORY_LENGTH)
    .filter((msg) => msg.role !== "system");
  messages.push(...recentHistory);

  messages.push({ role: "user", content: userMessage, timestamp: Date.now() });
  return messages;
}

/**
 * Stream a chat completion from ASI:One, yielding normalized chunks.
 * Throws if the upstream request fails — the caller decides how to surface it.
 */
export async function* streamChat(
  userMessage: string,
  context: ChatContext,
): AsyncGenerator<ChatChunk> {
  const { apiKey, apiUrl, model } = getConfig();
  const messages = buildMessages(userMessage, context);

  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 500,
      temperature: 0.7,
      stream: true,
      tools: TOOLS,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`ASI:One API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulatedContent = "";
  let accumulatedToolCall: { name: string; arguments: string } | null = null;
  let toolArgsBuffer: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;

      try {
        const data = JSON.parse(trimmed.slice(6));
        const delta = data.choices?.[0]?.delta;

        if (delta?.content) {
          accumulatedContent += delta.content;
          yield { content: accumulatedContent, done: false };
        }

        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            if (toolCall.function?.name) {
              accumulatedToolCall = { name: toolCall.function.name, arguments: "" };
              toolArgsBuffer = [];
            }
            if (toolCall.function?.arguments) {
              toolArgsBuffer.push(toolCall.function.arguments);
              if (accumulatedToolCall) {
                accumulatedToolCall.arguments = toolArgsBuffer.join("");
              }
            }
          }
        }

        if (data.choices?.[0]?.finish_reason === "tool_calls" && accumulatedToolCall) {
          yield { content: accumulatedContent, done: true, toolCall: accumulatedToolCall };
          return;
        }

        if (accumulatedToolCall && !data.choices?.[0]?.finish_reason) {
          yield { content: accumulatedContent, done: false, toolCall: accumulatedToolCall };
        }
      } catch {
        // Skip invalid JSON lines.
        continue;
      }
    }
  }

  yield { content: accumulatedContent, done: true };
}
