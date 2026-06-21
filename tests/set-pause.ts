import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { ProgramTestContext } from "solana-bankrun";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { UnifiedFlow } from "../target/types/unified_flow";
import IDL from "../target/idl/unified_flow.json";
import { expect } from "chai";

/** Asserts that a promise rejects with an error matching the given fragment. */
async function expectError(promise: Promise<any>, fragment: string) {
  try {
    await promise;
    expect.fail("Expected transaction to fail, but it succeeded");
  } catch (err: any) {
    const code = err?.error?.errorCode?.code ?? "";
    const msg = err?.error?.errorMessage ?? "";
    const logs = (err?.logs ?? []).join("\n");
    const raw = err?.message ?? String(err);
    const combined = `${code} ${msg} ${logs} ${raw}`;
    expect(combined, `Error "${fragment}" not found in: ${combined.slice(0, 400)}`).to.include(fragment);
  }
}

describe("set_pause", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<UnifiedFlow>;

  let admin: Keypair;
  let stranger: Keypair;

  let configPda: PublicKey;

  before(async () => {
    admin = Keypair.generate();
    stranger = Keypair.generate();

    context = await startAnchor(".", [], [
      { address: admin.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
      { address: stranger.publicKey, info: { lamports: 100e9, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
    ]);

    provider = new BankrunProvider(context);
    anchor.setProvider(provider);
    program = new Program<UnifiedFlow>(IDL as UnifiedFlow, provider);

    [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

    // Initialize config
    await program.methods
      .initializeConfig()
      .accounts({ admin: admin.publicKey })
      .signers([admin])
      .rpc();
  });

  it("should fail if caller is not the admin", async () => {
    await expectError(
      program.methods
        .setPause(true)
        .accountsStrict({
          admin: stranger.publicKey,
          config: configPda,
        })
        .signers([stranger])
        .rpc(),
      "Unauthorized"
    );
  });

  it("should successfully pause the protocol if caller is admin", async () => {
    await program.methods
      .setPause(true)
      .accountsStrict({
        admin: admin.publicKey,
        config: configPda,
      })
      .signers([admin])
      .rpc();

    const config = await program.account.configAccount.fetch(configPda);
    expect(config.paused).to.be.true;
  });

  it("should successfully unpause the protocol if caller is admin", async () => {
    await program.methods
      .setPause(false)
      .accountsStrict({
        admin: admin.publicKey,
        config: configPda,
      })
      .signers([admin])
      .rpc();

    const config = await program.account.configAccount.fetch(configPda);
    expect(config.paused).to.be.false;
  });
});
