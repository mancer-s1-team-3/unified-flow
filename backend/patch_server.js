const fs = require('fs');
const file = './src/api/server.ts';
let content = fs.readFileSync(file, 'utf8');

// 1. buildWithdrawTransaction
content = content.replace(
    /async function buildWithdrawTransaction\([\s\S]*?recipientKeypair: Keypair\n\): Promise<\{ transaction: string; accounts: any \}> \{/,
    `async function buildWithdrawTransaction(\n    streamId: string\n): Promise<{ transaction: string; accounts: any }> {`
);
content = content.replace(
    /        \.transaction\(\);\n\n    return \{\n        transaction: Buffer\.from\(tx\.serialize\(\)\)\.toString\("base64"\),/,
    `        .transaction();\n\n    tx.feePayer = recipientPubkey;\n    const { blockhash } = await anchorConnection.getLatestBlockhash();\n    tx.recentBlockhash = blockhash;\n\n    return {\n        transaction: Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64"),`
);

// 2. buildCancelTransaction
content = content.replace(
    /async function buildCancelTransaction\([\s\S]*?creatorKeypair: Keypair\n\): Promise<\{ transaction: string; accounts: any \}> \{/,
    `async function buildCancelTransaction(\n    streamId: string\n): Promise<{ transaction: string; accounts: any }> {`
);
content = content.replace(
    /        \.transaction\(\);\n\n    return \{\n        transaction: Buffer\.from\(tx\.serialize\(\)\)\.toString\("base64"\),/,
    `        .transaction();\n\n    tx.feePayer = creatorPubkey;\n    const { blockhash } = await anchorConnection.getLatestBlockhash();\n    tx.recentBlockhash = blockhash;\n\n    return {\n        transaction: Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64"),`
);

// 3. buildUnlockMilestoneTransaction
content = content.replace(
    /async function buildUnlockMilestoneTransaction\([\s\S]*?creatorKeypair: Keypair\n\): Promise<\{ transaction: string; accounts: any \}> \{/,
    `async function buildUnlockMilestoneTransaction(\n    streamId: string,\n    milestoneIndex: number\n): Promise<{ transaction: string; accounts: any }> {`
);
content = content.replace(
    /        \.transaction\(\);\n\n    return \{\n        transaction: Buffer\.from\(tx\.serialize\(\)\)\.toString\("base64"\),/,
    `        .transaction();\n\n    tx.feePayer = creatorPubkey;\n    const { blockhash } = await anchorConnection.getLatestBlockhash();\n    tx.recentBlockhash = blockhash;\n\n    return {\n        transaction: Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64"),`
);

// 4. API /streams/:id/withdraw
content = content.replace(
    /app\.post\("\/streams\/:id\/withdraw", async \(req, res\) => \{[\s\S]*?const result = await buildWithdrawTransaction\(id, recipientKeypair\);/m,
    `app.post("/streams/:id/withdraw", async (req, res) => {\n    const { id } = req.params;\n\n    try {\n        const result = await buildWithdrawTransaction(id);`
);

// 5. API /streams/:id/cancel
content = content.replace(
    /app\.post\("\/streams\/:id\/cancel", async \(req, res\) => \{[\s\S]*?const result = await buildCancelTransaction\(id, creatorKeypair\);/m,
    `app.post("/streams/:id/cancel", async (req, res) => {\n    const { id } = req.params;\n\n    try {\n        const result = await buildCancelTransaction(id);`
);

// 6. API /streams/:id/unlock-milestone
content = content.replace(
    /app\.post\("\/streams\/:id\/unlock-milestone", async \(req, res\) => \{[\s\S]*?const result = await buildUnlockMilestoneTransaction\(id, milestoneIndex, creatorKeypair\);/m,
    `app.post("/streams/:id/unlock-milestone", async (req, res) => {\n    const { id } = req.params;\n    const { milestoneIndex } = req.body as { milestoneIndex?: number };\n\n    if (milestoneIndex === undefined || milestoneIndex === null) {\n        return res.status(400).send({ error: "milestoneIndex is required." });\n    }\n\n    try {\n        const result = await buildUnlockMilestoneTransaction(id, milestoneIndex);`
);

fs.writeFileSync(file, content);
console.log('patched');
