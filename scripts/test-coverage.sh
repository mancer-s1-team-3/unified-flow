#!/usr/bin/env bash

# Run tests + generate coverage (stable toolchain)
#
# Usage:
#   ./scripts/test-coverage.sh
#   ./scripts/test-coverage.sh -p unified-flow
#   COMMIT_HASH=abc ./scripts/test-coverage.sh
#
# Requirements:
#   cargo install grcov
#   rustup component add llvm-tools-preview --toolchain stable

set -eo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
src_root="$(cd "${here}/.." && pwd)"

cd "${src_root}"

########################################
# Toolchain
########################################

RUST_TOOLCHAIN="${RUST_TOOLCHAIN:-stable}"

########################################
# Check dependencies
########################################

if ! command -v cargo >/dev/null 2>&1; then
    echo "Error: cargo not found"
    exit 1
fi

if ! command -v grcov >/dev/null 2>&1; then
    echo "Error: grcov not found"
    echo ""
    echo "Install with:"
    echo "  cargo install grcov"
    exit 1
fi

########################################
# LLVM tools (required for --llvm flag)
########################################

llvm_profdata="$(
    find "$(rustc +"${RUST_TOOLCHAIN}" --print sysroot)" \
        -name "llvm-profdata" \
        2>/dev/null \
        | head -n 1
)"

if [ -z "$llvm_profdata" ]; then
    echo "Error: llvm-profdata not found in toolchain '${RUST_TOOLCHAIN}'"
    echo ""
    echo "Install with:"
    echo "  rustup component add llvm-tools-preview --toolchain ${RUST_TOOLCHAIN}"
    exit 1
fi

llvm_path="$(dirname "$llvm_profdata")"

########################################
# Commit hash / output folder
########################################

COMMIT_HASH="${COMMIT_HASH:-$(git rev-parse --short=9 HEAD 2>/dev/null || echo "local")}"

COV_DIR="${src_root}/target/cov/${COMMIT_HASH}"
PROFRAW_DIR="${COV_DIR}/profraw"
REPORT_DIR="${COV_DIR}/coverage"

########################################
# Cleanup
########################################

rm -rf "${COV_DIR}"
mkdir -p "${PROFRAW_DIR}"
mkdir -p "${REPORT_DIR}/html"

# Clean stale profraw from previous runs
find "${src_root}" -name "*.profraw" -not -path "*/target/*" -delete 2>/dev/null || true

########################################
# Coverage instrumentation env
########################################

# Preserve any existing RUSTFLAGS but avoid re-appending instrument-coverage
case "${RUSTFLAGS:-}" in
    *instrument-coverage*) ;;
    *) export RUSTFLAGS="-C instrument-coverage${RUSTFLAGS:+ $RUSTFLAGS}" ;;
esac

export LLVM_PROFILE_FILE="${PROFRAW_DIR}/default-%p-%m.profraw"

# RUST_LOG guard (avoid unbound variable with set -u)
RUST_LOG="${RUST_LOG:-}"

########################################
# Package / test args
########################################

if [[ $# -eq 0 ]]; then
    # Default: all library targets across the workspace
    PACKAGES=(--workspace --lib)
else
    PACKAGES=("$@")
fi

########################################
# Build + run tests
########################################

echo "========================================"
echo "  Code Coverage Report"
echo "========================================"
echo "  Toolchain : ${RUST_TOOLCHAIN}"
echo "  Commit    : ${COMMIT_HASH}"
echo "  RUSTFLAGS : ${RUSTFLAGS}"
echo "  Profraw   : ${PROFRAW_DIR}"
echo "========================================"
echo ""

RUST_LOG="solana=warn,${RUST_LOG}" \
cargo +"${RUST_TOOLCHAIN}" test \
    --all-features \
    --target-dir "${src_root}/target/cov/build" \
    "${PACKAGES[@]}"

########################################
# Collect .profraw files
########################################

PROFRAW_COUNT="$(find "${src_root}/target" -name "*.profraw" 2>/dev/null | wc -l | tr -d ' ')"
echo ""
echo "Found ${PROFRAW_COUNT} .profraw file(s)"

if [ "${PROFRAW_COUNT}" = "0" ]; then
    echo ""
    echo "WARNING: No .profraw files found."
    echo "This usually means the test binary was not instrumented."
    echo ""
    echo "Possible causes:"
    echo "  - Tests run inside BPF/SBF VM (LiteSVM / Bankrun) — the host"
    echo "    process must execute Rust natively to emit coverage data."
    echo "  - Wrong RUSTFLAGS were not passed to the compiler."
    echo ""
    exit 1
fi

########################################
# Generate HTML report
########################################

echo ""
echo "--- Generating HTML report..."

grcov \
    "${src_root}/target/cov" \
    --source-dir "${src_root}" \
    --binary-path "${src_root}/target/cov/build/debug" \
    --llvm \
    --llvm-path "${llvm_path}" \
    --branch \
    --ignore-not-existing \
    --ignore "**/.cargo/**" \
    --ignore "**/target/**" \
    --ignore "**/tests/**" \
    --ignore "**/build.rs" \
    -t html \
    -o "${REPORT_DIR}/html"

echo "  -> ${REPORT_DIR}/html/index.html"

########################################
# Generate lcov report
########################################

echo ""
echo "--- Generating lcov report..."

grcov \
    "${src_root}/target/cov" \
    --source-dir "${src_root}" \
    --binary-path "${src_root}/target/cov/build/debug" \
    --llvm \
    --llvm-path "${llvm_path}" \
    --branch \
    --ignore-not-existing \
    --ignore "**/.cargo/**" \
    --ignore "**/target/**" \
    --ignore "**/tests/**" \
    --ignore "**/build.rs" \
    -t lcov \
    -o "${REPORT_DIR}/lcov.info"

echo "  -> ${REPORT_DIR}/lcov.info"

########################################
# Print summary from lcov
########################################

if command -v lcov >/dev/null 2>&1; then
    echo ""
    echo "--- Coverage Summary ---"
    lcov --summary "${REPORT_DIR}/lcov.info" 2>&1 | grep -E "(lines|functions|branches)" || true
fi

########################################
# Latest symlink
########################################

rm -f "${src_root}/target/cov/LATEST"
ln -sf "${COMMIT_HASH}" "${src_root}/target/cov/LATEST"

echo ""
echo "========================================"
echo "  Done!"
echo "========================================"
echo "  HTML : ${REPORT_DIR}/html/index.html"
echo "  lcov : ${REPORT_DIR}/lcov.info"
echo "  Link : ${src_root}/target/cov/LATEST"
echo "========================================"