#!/bin/bash
#
# Build all packages in the TypeScript SDK.
#
# Usage:
#   ./bin/dev/build.sh           # Build all packages
#   ./bin/dev/build.sh --clean   # Clean and build
#
# This script:
#   1. Optionally cleans previous build artifacts
#   2. Builds @flovyn/native package
#   3. Builds @flovyn/sdk package

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_TS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$SDK_TS_ROOT"

# Parse arguments
CLEAN=false
for arg in "$@"; do
    case $arg in
        --clean)
            CLEAN=true
            shift
            ;;
    esac
done

echo "Building TypeScript SDK..."

# Clean if requested
if [ "$CLEAN" = true ]; then
    echo "Cleaning previous builds..."
    rm -rf packages/native/dist
    rm -rf packages/sdk/dist
    rm -rf examples/*/dist
fi

# Check if native module exists
if ! ls packages/native/*.node 1>/dev/null 2>&1; then
    echo ""
    echo "Warning: No native module (.node file) found in packages/native/"
    echo "Run './bin/dev/update-native.sh' to build or download the native module."
    echo ""
fi

# Build packages
echo "Building @flovyn/native..."
pnpm --filter @flovyn/native build

echo "Building @flovyn/sdk..."
pnpm --filter @flovyn/sdk build

echo ""
echo "Build complete!"
echo ""
echo "Packages built:"
echo "  - packages/native/dist/"
echo "  - packages/sdk/dist/"
