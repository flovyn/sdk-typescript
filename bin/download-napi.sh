#!/bin/bash
# Download NAPI native libraries from sdk-rust releases
#
# Usage:
#   ./bin/download-napi.sh <version> [platform]
#
# Examples:
#   ./bin/download-napi.sh v0.1.7                    # Download for current platform
#   ./bin/download-napi.sh v0.1.7 linux-x64-gnu      # Download specific platform
#
# Platforms: linux-x64-gnu, linux-arm64-gnu, darwin-x64, darwin-arm64, win32-x64-msvc

set -euo pipefail

VERSION="${1:-}"
PLATFORM="${2:-}"

if [[ -z "$VERSION" ]]; then
    echo "Usage: $0 <version> [platform]"
    echo "Example: $0 v0.1.7 linux-x64-gnu"
    echo ""
    echo "Platforms: linux-x64-gnu, linux-arm64-gnu, darwin-x64, darwin-arm64, win32-x64-msvc"
    exit 1
fi

# Auto-detect platform if not specified
if [[ -z "$PLATFORM" ]]; then
    case "$(uname -s)-$(uname -m)" in
        Linux-x86_64)  PLATFORM="linux-x64-gnu" ;;
        Linux-aarch64) PLATFORM="linux-arm64-gnu" ;;
        Darwin-x86_64) PLATFORM="darwin-x64" ;;
        Darwin-arm64)  PLATFORM="darwin-arm64" ;;
        MINGW*|MSYS*|CYGWIN*) PLATFORM="win32-x64-msvc" ;;
        *)
            echo "Error: Could not auto-detect platform for $(uname -s)-$(uname -m)"
            exit 1
            ;;
    esac
fi

BASE_URL="https://github.com/flovyn/sdk-rust/releases/download/${VERSION}"
NATIVES_DIR="packages/native"

echo "Downloading NAPI bindings version ${VERSION} for platform ${PLATFORM}..."

# Create directories
mkdir -p "${NATIVES_DIR}" tmp

# Download the NAPI package for this platform
ARCHIVE_NAME="flovyn-worker-napi-${PLATFORM}.tar.gz"
echo "Downloading ${ARCHIVE_NAME}..."
curl -fsSL "${BASE_URL}/${ARCHIVE_NAME}" -o "tmp/${ARCHIVE_NAME}"

# Extract the native module
echo "Extracting..."
tar -xzf "tmp/${ARCHIVE_NAME}" -C "${NATIVES_DIR}/"

# The archive should contain the .node file
# Expected structure: flovyn-worker-napi.{platform}.node

# Verify extraction
NODE_FILE=$(find "${NATIVES_DIR}" -name "*.node" -type f | head -1)
if [[ -n "$NODE_FILE" ]]; then
    echo "Extracted: $NODE_FILE"
else
    echo "Warning: No .node file found after extraction"
fi

# Download TypeScript definitions if available
echo "Downloading TypeScript definitions..."
TYPES_ARCHIVE="flovyn-worker-napi-types.tar.gz"
if curl -fsSL "${BASE_URL}/${TYPES_ARCHIVE}" -o "tmp/${TYPES_ARCHIVE}" 2>/dev/null; then
    tar -xzf "tmp/${TYPES_ARCHIVE}" -C "${NATIVES_DIR}/"
    echo "Extracted TypeScript definitions"
else
    echo "Note: TypeScript definitions not found in release (using bundled definitions)"
fi

# Cleanup
rm -rf tmp

echo "Done."
echo ""
echo "Native module location: ${NATIVES_DIR}/"
