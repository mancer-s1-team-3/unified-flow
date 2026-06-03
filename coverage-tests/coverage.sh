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
# Usage:  ./coverage.sh           # text summary
#         ./coverage.sh --html    # also emit HTML into covdata/html
set -euo pipefail
cd "$(dirname "$0")"

LLVMBIN="$(rustc --print sysroot)/lib/rustlib/$(rustc -vV | sed -n 's/host: //p')/bin"
export CARGO_TARGET_DIR=target-cov

rm -rf covdata && mkdir -p covdata

RUSTFLAGS="-C instrument-coverage" \
LLVM_PROFILE_FILE="$(pwd)/covdata/cov-%p-%m.profraw" \
  cargo test --test program_test

"$LLVMBIN/llvm-profdata" merge -sparse covdata/*.profraw -o covdata/merged.profdata

BIN="$(find target-cov/debug/deps \
  -maxdepth 1 \
  -name 'program_test-*' \
  -type f \
  -perm -111 \
  | head -1)"
# Report ONLY the program's own source. The global `-C instrument-coverage`
# also instruments the Rust std/core and the test harness that get linked in;
# exclude the toolchain (`.rustup`), the cargo registry, this crate's tests,
# and the vendored solana-invoke shim so only lib.rs / oracle.rs remain.
IGNORE='\.rustup|/registry/|/tests/|vendor|coverage-tests'

"$LLVMBIN/llvm-cov" report "$BIN" \
  -instr-profile=covdata/merged.profdata \
  -ignore-filename-regex="$IGNORE"

if [[ "${1:-}" == "--html" ]]; then
  "$LLVMBIN/llvm-cov" show "$BIN" \
    -instr-profile=covdata/merged.profdata \
    -ignore-filename-regex="$IGNORE" \
    -format=html -output-dir=covdata/html
  echo "HTML report: coverage-tests/covdata/html/index.html"
fi
