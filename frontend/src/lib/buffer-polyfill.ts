// Browser Buffer polyfill shim.
//
// The bundled SDK derives the stream PDA with `Buffer.alloc(8).writeBigUInt64LE(nonce)`.
// `writeBigUInt64LE`/`readBigUInt64LE` are Node Buffer methods that some browser
// Buffer polyfills don't ship, so the call throws
// "nonceBuffer.writeBigUInt64LE is not a function" at runtime. We add minimal,
// spec-correct implementations when (and only when) they're missing — a no-op on
// Node and on polyfills that already provide them.

import { Buffer as BufferPolyfill } from "buffer";

function patchBuffer(B: unknown): void {
  const proto = (B as { prototype?: Record<string, unknown> } | undefined)?.prototype;
  if (!proto) return;

  const MASK = BigInt(0xff);
  const EIGHT = BigInt(8);

  if (typeof proto.writeBigUInt64LE !== "function") {
    proto.writeBigUInt64LE = function (this: Uint8Array, value: bigint, offset = 0): number {
      let v = BigInt(value);
      for (let i = 0; i < 8; i++) {
        this[offset + i] = Number(v & MASK);
        v >>= EIGHT;
      }
      return offset + 8;
    };
  }

  if (typeof proto.readBigUInt64LE !== "function") {
    proto.readBigUInt64LE = function (this: Uint8Array, offset = 0): bigint {
      let v = BigInt(0);
      for (let i = 7; i >= 0; i--) {
        v = (v << EIGHT) | BigInt(this[offset + i] ?? 0);
      }
      return v;
    };
  }
}

// Patch the imported polyfill and the global the bundler injects for the SDK.
patchBuffer(BufferPolyfill);
if (typeof globalThis !== "undefined") {
  patchBuffer((globalThis as { Buffer?: unknown }).Buffer);
}
