// ASI:One chat client (browser-side).
// The API key, system prompt, and tool definitions now live on the backend.
// This module is a thin client that POSTs to the backend `/ai/chat` SSE proxy
// and exposes the same { content, done, toolCall } streaming contract the UI
// already consumes, plus a local fallback for when the service is unavailable.

import { api } from "@/lib/api";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

interface ChatContext {
  conversationHistory: ChatMessage[];
  userProfile?: {
    walletAddress?: string;
    cluster?: string;
    role?: "creator" | "recipient" | "admin";
  };
  currentAction?: string;
  relevantData?: {
    streams?: any[];
    recentTransactions?: any[];
  };
}

interface StreamingResponse {
  content: string;
  done: boolean;
  error?: string;
  toolCall?: {
    name: string;
    arguments: string;
  };
}

function getBaseUrl(): string {
  return api.defaults.baseURL ?? "";
}

class ASIOneChatService {
  /**
   * Ask the backend whether the AI service is configured (has a key). Returns
   * false on any error so the UI degrades to the offline assistant.
   */
  async checkStatus(): Promise<boolean> {
    try {
      const response = await fetch(`${getBaseUrl()}/ai/status`);
      if (!response.ok) return false;
      const data = await response.json();
      return !!data.configured;
    } catch {
      return false;
    }
  }

  /**
   * Stream a response from the backend AI proxy. Yields the same normalized
   * chunks the UI already handles. Falls back to a local canned answer if the
   * request fails or the backend reports an error.
   */
  async *generateStreamingResponse(
    userMessage: string,
    context: ChatContext,
  ): AsyncGenerator<StreamingResponse> {
    try {
      const response = await fetch(`${getBaseUrl()}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage, context }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`AI service error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const payload = trimmed.slice(6);
          if (payload === "[DONE]") return;

          try {
            const chunk = JSON.parse(payload) as StreamingResponse;

            if (chunk.error) {
              yield {
                content: this.getFallbackResponse(userMessage),
                done: true,
                error: chunk.error,
              };
              return;
            }

            yield {
              content: chunk.content,
              done: chunk.done,
              toolCall: chunk.toolCall,
            };
          } catch {
            // Skip malformed SSE lines.
            continue;
          }
        }
      }
    } catch (error) {
      yield {
        content: this.getFallbackResponse(userMessage),
        done: true,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get fallback response when the AI service is unavailable.
   */
  getFallbackResponse(userMessage: string): string {
    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes("create") || lowerMessage.includes("buat") || lowerMessage.includes("bikin")) {
      return "To create a stream, go to the **Create Stream** tab. You can choose between Linear, Cliff, or Milestone-based vesting. You can also upload a CSV file for bulk creation.";
    }

    if (lowerMessage.includes("cancel") || lowerMessage.includes("stop")) {
      return "To cancel a stream, use the **Cancel Stream** tab. You'll need the stream PDA address and must type 'cancel' to confirm. This action is irreversible.";
    }

    if (lowerMessage.includes("withdraw") || lowerMessage.includes("claim")) {
      return "To claim tokens, go to the **Withdraw Claim** tab and enter your stream PDA address. Only unlocked tokens can be withdrawn.";
    }

    if (lowerMessage.includes("milestone") || lowerMessage.includes("unlock")) {
      return "For milestone-based vesting, use the **Unlock Milestone** tab to approve each tranche. You can also edit milestone amounts from the Edit Milestone Structure tab.";
    }

    if (lowerMessage.includes("csv") || lowerMessage.includes("bulk")) {
      return "Use the **CSV** feature in the Create Stream tab to bulk-create streams. Download the template, fill it in, and upload it. You can preview changes before applying.";
    }

    if (lowerMessage.includes("wallet") || lowerMessage.includes("connect")) {
      return "Connect your Solana wallet using the button in the top-right corner. The dashboard supports Phantom, Backpack, and other Solana-compatible wallets.";
    }

    return "I'm here to help you with Unified Flow's token distribution features. You can ask me about creating streams, managing vesting, using CSV bulk operations, or any other questions about the platform.";
  }

  /**
   * Get suggested questions based on context.
   */
  getSuggestedQuestions(context: ChatContext): string[] {
    const baseSuggestions = [
      "How do I create a stream?",
      "What's the difference between linear and cliff vesting?",
      "How do I cancel a stream?",
      "Can I bulk-create streams?",
    ];

    if (context.userProfile?.role === "creator") {
      return [
        ...baseSuggestions,
        "How do I unlock a milestone?",
        "Can I edit an existing stream?",
        "How does CSV bulk edit work?",
      ];
    }

    if (context.userProfile?.role === "recipient") {
      return [
        "How do I claim my tokens?",
        "When will my tokens be unlocked?",
        "What's a stream PDA?",
      ];
    }

    return baseSuggestions;
  }
}

// Singleton instance
let asioneChatService: ASIOneChatService | null = null;

export function getASIOneChatService(): ASIOneChatService {
  if (!asioneChatService) {
    asioneChatService = new ASIOneChatService();
  }
  return asioneChatService;
}

export type { ChatMessage, ChatContext, StreamingResponse };
