import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { UnifiedFlow } from "../target/types/unified_flow";

import { expect } from "chai";

describe("deploy-program", () => {
  const provider = anchor.AnchorProvider.env();

  anchor.setProvider(provider);

  const program =
    anchor.workspace.UnifiedFlow as Program<UnifiedFlow>;

  it("Program is deployed on-chain", async () => {
    const accountInfo =
      await provider.connection.getAccountInfo(
        program.programId
      );

    expect(accountInfo).to.not.be.null;

    expect(accountInfo?.executable).to.be.true;
  });
});