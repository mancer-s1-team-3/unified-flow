// Docs RAG chat client (browser-side).
// Thin client for the backend's /ai/docs-chat SSE proxy. Separate from
// asione-chat.ts (the dashboard assistant) because this one never returns a
// toolCall to execute — it only ever returns text plus doc "sources" to link
// back to the relevant /docs/<slug> page.

import { api } from "@/lib/api";

export interface DocsChatHistoryMessage {
    role: "user" | "assistant";
    content: string;
}

export interface DocsChatContext {
    conversationHistory: DocsChatHistoryMessage[];
}

export interface DocsSource {
    slug: string;
    title: string;
    heading: string;
}

export interface DocsStreamingResponse {
    content: string;
    done: boolean;
    error?: string;
    sources?: DocsSource[];
}

function getBaseUrl(): string {
    return api.defaults.baseURL ?? "";
}

class DocsChatService {
    async checkStatus(): Promise<boolean> {
        try {
            const response = await fetch(`${getBaseUrl()}/ai/docs-status`);
            if (!response.ok) return false;
            const data = await response.json();
            return !!data.configured;
        } catch {
            return false;
        }
    }

    /**
     * Ask a documentation question. Yields chunks matching the backend's SSE
     * contract. Falls back to a short canned message if the request fails.
     */
    async *ask(userMessage: string, context: DocsChatContext): AsyncGenerator<DocsStreamingResponse> {
        try {
            const response = await fetch(`${getBaseUrl()}/ai/docs-chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userMessage, context }),
            });

            if (!response.ok || !response.body) {
                throw new Error(`Docs AI service error: ${response.status}`);
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
                        const chunk = JSON.parse(payload) as DocsStreamingResponse;
                        if (chunk.error) {
                            yield { content: this.getFallbackResponse(), done: true, error: chunk.error, sources: [] };
                            return;
                        }
                        yield chunk;
                    } catch {
                        continue; // skip malformed SSE lines
                    }
                }
            }
        } catch (error) {
            yield {
                content: this.getFallbackResponse(),
                done: true,
                error: error instanceof Error ? error.message : "Unknown error",
                sources: [],
            };
        }
    }

    getFallbackResponse(): string {
        return "I'm having trouble reaching the docs assistant right now. You can browse the sidebar sections, or try your question again in a moment.";
    }
}

let docsChatService: DocsChatService | null = null;

export function getDocsChatService(): DocsChatService {
    if (!docsChatService) {
        docsChatService = new DocsChatService();
    }
    return docsChatService;
}