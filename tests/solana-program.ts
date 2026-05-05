import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { SolanaProgram } from "../target/types/solana_program";

describe("solana-program", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.solanaProgram as Program<SolanaProgram>;

  it("Program is deployed on-chain", async () => {
    const accountInfo = await provider.connection.getAccountInfo(
      program.programId
    );

    expect(accountInfo).to.not.be.null;
    expect(accountInfo?.executable).to.be.true;
  });
});