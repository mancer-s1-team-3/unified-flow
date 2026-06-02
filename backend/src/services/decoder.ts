import * as anchor from "@coral-xyz/anchor";
import idl from "../idl/unified_flow.json";

export const coder = new anchor.BorshCoder(idl as anchor.Idl);