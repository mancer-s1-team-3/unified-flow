import * as anchor from "@coral-xyz/anchor";

import { PublicKey } from "@solana/web3.js";

import idl from "../../../target/idl/solana_program.json";
import { coder } from "./decoder";

const PROGRAM_ID = new PublicKey(
    process.env.PROGRAM_ID!
);



export const eventParser =
    new anchor.EventParser(
        PROGRAM_ID,
        coder
    );