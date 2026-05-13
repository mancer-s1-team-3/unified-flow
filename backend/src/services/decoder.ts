import * as anchor from "@coral-xyz/anchor";
import idl from "../../../target/idl/solana_program.json";

export const coder = new anchor.BorshCoder(idl as anchor.Idl);