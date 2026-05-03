import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { SolanaProgram } from "../target/types/solana_program";

describe("solana-program", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.solanaProgram as Program<SolanaProgram>;

  it("Program deploys successfully and can be initialized", async () => {
    // Call the initialize method
    const tx = await program.methods.initialize().rpc();
    
    // Assert that a valid transaction signature was returned
    expect(tx).to.be.a("string");
    expect(tx.length).to.be.greaterThan(0);
    
    console.log("Initialization successful! Transaction signature:", tx);
  });
});
