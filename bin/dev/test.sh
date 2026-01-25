#!/bin/bash
#
# Run tests for the TypeScript SDK.
#
# Usage:
#   ./bin/dev/test.sh          # Run unit tests
#   ./bin/dev/test.sh --e2e    # Run E2E tests (requires server)
#   ./bin/dev/test.sh --all    # Run all tests
#   ./bin/dev/test.sh --watch  # Run unit tests in watch mode
#
# E2E tests require:
#   - Docker with Flovyn server image
#   - Native module built/downloaded

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_TS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$SDK_TS_ROOT"

# Parse arguments
RUN_E2E=false
RUN_UNIT=true
WATCH=false

for arg in "$@"; do
    case $arg in
        --e2e)
            RUN_E2E=true
            RUN_UNIT=false
            ;;
        --all)
            RUN_E2E=true
            RUN_UNIT=true
            ;;
        --watch)
            WATCH=true
            ;;
    esac
done

# Run unit tests
if [ "$RUN_UNIT" = true ]; then
    echo "Running unit tests..."
    if [ "$WATCH" = true ]; then
        pnpm test -- --watch
    else
        pnpm test
    fi
fi

# Run E2E tests
if [ "$RUN_E2E" = true ]; then
    echo ""
    echo "Running E2E tests..."
    echo "Note: This requires Docker and the Flovyn server image."
    echo ""

    # Check for native module
    if ! ls packages/native/*.node 1>/dev/null 2>&1; then
        echo "Error: No native module found. Run './bin/dev/update-native.sh' first."
        exit 1
    fi

    # Check for Docker
    if ! command -v docker &> /dev/null; then
        echo "Error: Docker is not installed or not in PATH."
        exit 1
    fi

    pnpm test:e2e
fi

echo ""
echo "Tests complete!"
