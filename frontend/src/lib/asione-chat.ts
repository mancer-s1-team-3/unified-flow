// ASI:One Chat Service
// Advanced AI-powered chatbot with context awareness and streaming

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

interface ChatContext {
  conversationHistory: ChatMessage[];
  userProfile?: {
    walletAddress?: string;
    cluster?: string;
    role?: 'creator' | 'recipient' | 'admin';
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
}

class ASIOneChatService {
  private apiKey: string;
  private apiUrl: string;
  private model: string;
  private maxHistoryLength: number = 10;
  private systemPrompt: string;

  constructor() {
    this.apiKey = process.env.NEXT_PUBLIC_ASIONE_API_KEY || '';
    this.apiUrl = process.env.NEXT_PUBLIC_ASIONE_API_URL || 'https://api.asi1.ai/v1';
    this.model = process.env.NEXT_PUBLIC_ASIONE_MODEL || 'asi1';

    this.systemPrompt = `You are an AI assistant for the Unified Flow token distribution platform on Solana. Your role is to help users understand and use the vesting stream features.

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
  }

  /**
   * Generate a response from ASI:One API
   */
  async generateResponse(
    userMessage: string,
    context: ChatContext
  ): Promise<StreamingResponse> {
    try {
      const messages = this.buildMessages(userMessage, context);

      const response = await fetch(`${this.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          max_tokens: 500,
          temperature: 0.7,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`ASI:One API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        content: data.choices[0]?.message?.content || 'I apologize, but I encountered an issue generating a response.',
        done: true,
      };
    } catch (error) {
      // Silently fallback without polluting the console with fetch errors
      // console.error('ASI:One API Error:', error);
      return {
        content: this.getFallbackResponse(userMessage),
        done: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate streaming response from ASI:One API
   */
  async *generateStreamingResponse(
    userMessage: string,
    context: ChatContext
  ): AsyncGenerator<StreamingResponse> {
    try {
      const messages = this.buildMessages(userMessage, context);

      const response = await fetch(`${this.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          max_tokens: 500,
          temperature: 0.7,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`ASI:One API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              yield { content: '', done: true };
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content || '';
              if (content) {
                yield { content, done: false };
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      // Silently fallback without polluting the console with fetch errors
      // console.error('ASI:One Streaming Error:', error);
      yield {
        content: this.getFallbackResponse(userMessage),
        done: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Build message array with context
   */
  private buildMessages(userMessage: string, context: ChatContext): ChatMessage[] {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
    ];

    // Add context information
    if (context.userProfile) {
      const contextInfo = this.buildContextInfo(context);
      if (contextInfo) {
        messages.push({
          role: 'system',
          content: `Current user context:\n${contextInfo}`,
        });
      }
    }

    // Add conversation history (limited)
    const recentHistory = context.conversationHistory
      .slice(-this.maxHistoryLength)
      .filter(msg => msg.role !== 'system');

    messages.push(...recentHistory);

    // Add current user message
    messages.push({
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    });

    return messages;
  }

  /**
   * Build context information string
   */
  private buildContextInfo(context: ChatContext): string {
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

    return parts.length > 0 ? parts.join('\n') : '';
  }

  /**
   * Get fallback response when API fails
   */
  private getFallbackResponse(userMessage: string): string {
    const lowerMessage = userMessage.toLowerCase();

    // Simple pattern matching for fallback
    if (lowerMessage.includes('create') || lowerMessage.includes('buat') || lowerMessage.includes('bikin')) {
      return "To create a stream, go to the **Create Stream** tab. You can choose between Linear, Cliff, or Milestone-based vesting. You can also upload a CSV file for bulk creation.";
    }

    if (lowerMessage.includes('cancel') || lowerMessage.includes('stop')) {
      return "To cancel a stream, use the **Cancel Stream** tab. You'll need the stream PDA address and must type 'cancel' to confirm. This action is irreversible.";
    }

    if (lowerMessage.includes('withdraw') || lowerMessage.includes('claim')) {
      return "To claim tokens, go to the **Withdraw Claim** tab and enter your stream PDA address. Only unlocked tokens can be withdrawn.";
    }

    if (lowerMessage.includes('milestone') || lowerMessage.includes('unlock')) {
      return "For milestone-based vesting, use the **Unlock Milestone** tab to approve each tranche. You can also edit milestone amounts from the Edit Milestone Structure tab.";
    }

    if (lowerMessage.includes('csv') || lowerMessage.includes('bulk')) {
      return "Use the **CSV** feature in the Create Stream tab to bulk-create streams. Download the template, fill it in, and upload it. You can preview changes before applying.";
    }

    if (lowerMessage.includes('wallet') || lowerMessage.includes('connect')) {
      return "Connect your Solana wallet using the button in the top-right corner. The dashboard supports Phantom, Backpack, and other Solana-compatible wallets.";
    }

    return "I'm here to help you with Unified Flow's token distribution features. You can ask me about creating streams, managing vesting, using CSV bulk operations, or any other questions about the platform.";
  }

  /**
   * Check if API is properly configured
   */
  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey !== 'your_asione_api_key_here';
  }

  /**
   * Get suggested questions based on context
   */
  getSuggestedQuestions(context: ChatContext): string[] {
    const baseSuggestions = [
      "How do I create a stream?",
      "What's the difference between linear and cliff vesting?",
      "How do I cancel a stream?",
      "Can I bulk-create streams?",
    ];

    if (context.userProfile?.role === 'creator') {
      return [
        ...baseSuggestions,
        "How do I unlock a milestone?",
        "Can I edit an existing stream?",
        "How does CSV bulk edit work?",
      ];
    }

    if (context.userProfile?.role === 'recipient') {
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
