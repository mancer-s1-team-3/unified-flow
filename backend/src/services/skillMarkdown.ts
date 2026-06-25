// Small shared helper for reading backend/skill.md, used by both the
// /skills route and the docs RAG chat service. Extracted so docsChat.ts
// doesn't need to duplicate path-resolution logic from server.ts.

import fs from "node:fs/promises";
import path from "node:path";

let cachedContent: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000; // re-read at most once a minute; skill.md changes rarely

export async function readSkillMarkdown(): Promise<{ content: string; source: string }> {
    const skillPath = path.resolve(__dirname, "../../skills/unified-flow/SKILL.md");
    const content = await fs.readFile(skillPath, "utf8");
    return { content, source: "backend/skills/unified-flow/SKILL.md" };
}

/**
 * Same as readSkillMarkdown but never throws — returns null on any error
 * (missing file, permissions, etc.) and caches the result briefly so the
 * docs chat tool loop isn't doing a filesystem read on every single search.
 */
export async function readSkillMarkdownSafe(): Promise<string | null> {
    const now = Date.now();
    if (cachedContent !== null && now - cachedAt < CACHE_TTL_MS) {
        return cachedContent;
    }
    try {
        const { content } = await readSkillMarkdown();
        cachedContent = content;
        cachedAt = now;
        return content;
    } catch {
        // Fail open: docs chat should still work from the static corpus alone.
        return cachedContent; // last known good value, or null if we never had one
    }
}