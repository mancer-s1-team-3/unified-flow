// Minimal in-memory TF-IDF search over the docs corpus — no embedding API,
// no vector DB. Good enough for a few dozen short chunks; if the corpus grows
// into the hundreds of chunks, revisit with real embeddings.
//
// Pipeline: tokenize -> build per-chunk term frequency -> build global
// inverse-document-frequency -> score a query as the dot product of its own
// TF-IDF vector against each chunk's, normalized by chunk length so long
// chunks don't win purely by containing more words.

import { DOCS_CORPUS, type DocChunk } from "./docsCorpus";

export interface SearchableChunk extends DocChunk {
    source: "docs" | "skill";
}

export interface DocSearchResult {
    chunk: SearchableChunk;
    score: number;
}

// Tiny stopword list — just enough to stop near-universal words (the, and,
// is, to...) from dominating term weight. Not exhaustive on purpose: missing
// a stopword only dilutes scores a little, it never breaks correctness.
const STOPWORDS = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "to", "of", "in", "on", "for", "and", "or", "but", "if", "with", "as",
    "by", "at", "from", "this", "that", "these", "those", "it", "its",
    "into", "than", "then", "so", "can", "will", "not", "no", "do", "does",
    "did", "has", "have", "had", "i", "you", "your", "we", "they", "their",
]);

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        // Underscores and slashes act as word separators (e.g. "edit_linear" or
        // "/streams/:id" should tokenize the same as "edit linear" / "streams
        // id"), while keeping dots and hyphens inside otherwise-alphanumeric runs
        // so things like "anchor-bankrun" or "0.32.1" don't get mangled.
        .replace(/[_/]+/g, " ")
        .replace(/[^a-z0-9.-]+/g, " ")
        .split(/\s+/)
        .filter((tok) => tok.length > 1 && !STOPWORDS.has(tok));
}

interface IndexedChunk {
    chunk: SearchableChunk;
    termFreq: Map<string, number>;
    length: number; // total token count, for cosine-style normalization
}

interface DocsIndex {
    chunks: IndexedChunk[];
    docFreq: Map<string, number>; // how many chunks each term appears in
    totalChunks: number;
    builtAt: number;
}

let cachedIndex: DocsIndex | null = null;
let cachedSkillText: string | null = null;

function buildTermFreq(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const tok of tokens) {
        tf.set(tok, (tf.get(tok) ?? 0) + 1);
    }
    return tf;
}

function chunkFromSkillMarkdown(skillMarkdown: string): SearchableChunk[] {
    // Split skill.md on markdown headings (## or #) so each section becomes its
    // own retrievable chunk, the same granularity as the hand-written docs
    // corpus. Falls back to one big chunk if there are no headings at all.
    const sections = skillMarkdown.split(/\n(?=#{1,3}\s)/g).filter((s) => s.trim());
    if (sections.length === 0) {
        return [
            {
                id: "skill-full",
                slug: "skills",
                title: "Agent Skill Document",
                heading: "skill.md",
                text: skillMarkdown.slice(0, 2000),
                source: "skill",
            },
        ];
    }
    return sections.map((section, idx) => {
        const headingMatch = section.match(/^#{1,3}\s*(.+)/);
        const heading = headingMatch ? headingMatch[1].trim() : `Section ${idx + 1}`;
        return {
            id: `skill-${idx}`,
            slug: "skills",
            title: "Agent Skill Document",
            heading,
            text: section.replace(/^#{1,3}\s*.+\n?/, "").trim().slice(0, 1500),
            source: "skill" as const,
        };
    });
}

function buildIndex(skillMarkdown: string | null): DocsIndex {
    const staticChunks: SearchableChunk[] = DOCS_CORPUS.map((c) => ({ ...c, source: "docs" as const }));
    const skillChunks = skillMarkdown ? chunkFromSkillMarkdown(skillMarkdown) : [];
    const allChunks = [...staticChunks, ...skillChunks];

    const indexedChunks: IndexedChunk[] = allChunks.map((chunk) => {
        const tokens = tokenize(`${chunk.title} ${chunk.heading} ${chunk.text}`);
        return { chunk, termFreq: buildTermFreq(tokens), length: tokens.length || 1 };
    });

    const docFreq = new Map<string, number>();
    for (const { termFreq } of indexedChunks) {
        for (const term of termFreq.keys()) {
            docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
        }
    }

    return { chunks: indexedChunks, docFreq, totalChunks: indexedChunks.length, builtAt: Date.now() };
}

function idf(docFreq: Map<string, number>, totalChunks: number, term: string): number {
    const df = docFreq.get(term) ?? 0;
    if (df === 0) return 0;
    // Standard smoothed IDF; +1 keeps it from going negative/zero for terms
    // that appear in every chunk.
    return Math.log(totalChunks / df) + 1;
}

/**
 * Get (and lazily build/refresh) the search index. Rebuilds automatically if
 * skill.md content has changed since the last build, so editing skill.md
 * doesn't require a server restart to show up in search.
 */
function getIndex(skillMarkdown: string | null): DocsIndex {
    if (cachedIndex && cachedSkillText === skillMarkdown) {
        return cachedIndex;
    }
    cachedIndex = buildIndex(skillMarkdown);
    cachedSkillText = skillMarkdown;
    return cachedIndex;
}

/**
 * Search the docs corpus (+ skill.md, when provided) for the chunks most
 * relevant to `query`. Returns the top `limit` results sorted by score
 * descending; chunks scoring 0 (no overlapping terms) are excluded.
 */
export function searchDocs(
    query: string,
    options: { limit?: number; skillMarkdown?: string | null } = {},
): DocSearchResult[] {
    const { limit = 4, skillMarkdown = null } = options;
    const index = getIndex(skillMarkdown);

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];
    const queryTf = buildTermFreq(queryTokens);

    const results: DocSearchResult[] = [];
    for (const { chunk, termFreq, length } of index.chunks) {
        let score = 0;
        for (const [term, qCount] of queryTf) {
            const chunkCount = termFreq.get(term);
            if (!chunkCount) continue;
            const weight = idf(index.docFreq, index.totalChunks, term);
            score += (qCount * weight) * (chunkCount * weight);
        }
        if (score > 0) {
            // Normalize by chunk length so short, precise chunks aren't drowned out
            // by long ones that merely contain more incidental term matches.
            results.push({ chunk, score: score / Math.sqrt(length) });
        }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
}

/** Force the next searchDocs call to rebuild the index from scratch. */
export function invalidateDocsIndex(): void {
    cachedIndex = null;
    cachedSkillText = null;
}