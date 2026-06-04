#!/usr/bin/env bash
# Native coverage of the unified-flow program, measured by running the
# solana-program-test handler suite in-process.
#
# cargo-llvm-cov only instruments workspace members, and this crate is
# deliberately isolated from the program workspace (so `cargo build-sbf` keeps
# working). We therefore instrument manually: a global RUSTFLAGS instruments
# every crate — including the unified-flow path dependency — and we report only
# on the program's own source.
#
# Branch coverage (the "Branches" column) requires the nightly-only flag
# `-Z coverage-options=branch`, so this script runs on the nightly toolchain.
# Install once with:
#   rustup toolchain install nightly --component llvm-tools-preview
#
# Usage:  ./coverage.sh           # text summary (line + region + branch)
#         ./coverage.sh --html    # also emit HTML into covdata/html
set -euo pipefail
cd "$(dirname "$0")"

TOOLCHAIN=nightly

if ! rustup run "$TOOLCHAIN" rustc --version >/dev/null 2>&1; then
  echo "error: '$TOOLCHAIN' toolchain not found." >&2
  echo "install it with: rustup toolchain install nightly --component llvm-tools-preview" >&2
  exit 1
fi

LLVMBIN="$(rustc +$TOOLCHAIN --print sysroot)/lib/rustlib/$(rustc +$TOOLCHAIN -vV | sed -n 's/host: //p')/bin"
export CARGO_TARGET_DIR=target-cov

rm -rf covdata && mkdir -p covdata

# `-Z coverage-options=branch` adds branch-level instrumentation on top of the
# default line/region coverage.
RUSTFLAGS="-C instrument-coverage -Z coverage-options=branch" \
LLVM_PROFILE_FILE="$(pwd)/covdata/cov-%p-%m.profraw" \
  cargo +$TOOLCHAIN test --test program_test

"$LLVMBIN/llvm-profdata" merge -sparse covdata/*.profraw -o covdata/merged.profdata

# Pick the most recently built test binary (avoids stale binaries from a prior
# toolchain whose profile data would not match → spurious 0%).
BIN="$(ls -t target-cov/debug/deps/program_test-* 2>/dev/null | grep -v '\.d$' | head -1)"
# Report ONLY the program's own source. The global `-C instrument-coverage`
# also instruments the Rust std/core and the test harness that get linked in;
# exclude the toolchain (`.rustup`), the cargo registry, this crate's tests,
# and the vendored solana-invoke shim so only lib.rs / oracle.rs remain.
IGNORE='\.rustup|/rustc/|/registry/|/tests/|vendor|coverage-tests'

"$LLVMBIN/llvm-cov" report "$BIN" \
  -instr-profile=covdata/merged.profdata \
  -ignore-filename-regex="$IGNORE" \
  --show-branch-summary

if [[ "${1:-}" == "--html" ]]; then
  "$LLVMBIN/llvm-cov" show "$BIN" \
    -instr-profile=covdata/merged.profdata \
    -ignore-filename-regex="$IGNORE" \
    --show-branches=count \
    -format=html -output-dir=covdata/html
  echo "HTML report: coverage-tests/covdata/html/index.html"
fi
