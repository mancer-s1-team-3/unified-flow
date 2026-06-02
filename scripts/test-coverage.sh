#!/usr/bin/env bash

# Run tests + generate coverage (stable toolchain)
#
# Usage:
#   ./scripts/test-coverage.sh
#   ./scripts/test-coverage.sh -p unified-flow
#   COMMIT_HASH=abc ./scripts/test-coverage.sh

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
    echo "Install:"
    echo "  cargo install grcov"
    exit 1
fi

########################################
# LLVM tools
########################################

llvm_profdata="$(
    find "$(rustc +${RUST_TOOLCHAIN} --print sysroot)" \
        -name llvm-profdata \
        2>/dev/null \
        | head -n 1
)"

if [ -z "$llvm_profdata" ]; then
    echo "Error: llvm-profdata not found"
    echo ""
    echo "Install:"
    echo "  rustup component add llvm-tools-preview --toolchain ${RUST_TOOLCHAIN}"
    exit 1
fi

llvm_path="$(dirname "$llvm_profdata")"

########################################
# Commit hash / output folder
########################################

if [ -z "$COMMIT_HASH" ]; then
    COMMIT_HASH="$(git rev-parse --short=9 HEAD)"
fi

COV_DIR="./target/cov/${COMMIT_HASH}"

########################################
# Cleanup
########################################

rm -rf "$COV_DIR"
mkdir -p "$COV_DIR"

########################################
# Coverage env
########################################

export RUSTFLAGS="-C instrument-coverage ${RUSTFLAGS}"
export LLVM_PROFILE_FILE="${COV_DIR}/default-%p-%m.profraw"

########################################
# Package args
########################################

if [[ $# -eq 0 ]]; then
    PACKAGES=(--lib --all)
else
    PACKAGES=("$@")
fi

########################################
# Run tests
########################################

echo "----------------------------------------"
echo "Running tests with coverage"
echo "Toolchain: ${RUST_TOOLCHAIN}"
echo "Commit:    ${COMMIT_HASH}"
echo "----------------------------------------"

RUST_LOG="solana=trace,${RUST_LOG}" \
cargo +"${RUST_TOOLCHAIN}" test \
    --all-features \
    --target-dir ./target/cov \
    "${PACKAGES[@]}"

########################################
# Generate reports
########################################

echo ""
echo "--- generating coverage"

grcov \
    ./target/cov \
    --source-dir . \
    --binary-path ./target/cov/debug \
    --llvm \
    --llvm-path "$llvm_path" \
    --ignore "*.cargo/*" \
    -t html \
    -o "${COV_DIR}/coverage/html"

echo "html:"
echo "  ${COV_DIR}/coverage/html/index.html"

grcov \
    ./target/cov \
    --source-dir . \
    --binary-path ./target/cov/debug \
    --llvm \
    --llvm-path "$llvm_path" \
    --ignore "*.cargo/*" \
    -t lcov \
    -o "${COV_DIR}/coverage/lcov.info"

echo "lcov:"
echo "  ${COV_DIR}/coverage/lcov.info"

########################################
# latest symlink
########################################

rm -f ./target/cov/LATEST
ln -s "${COMMIT_HASH}" ./target/cov/LATEST

echo ""
echo "Done."