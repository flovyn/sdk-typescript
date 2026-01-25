#!/bin/bash
#
# Updates the native NAPI library from sdk-rust.
#
# Usage:
#   ./bin/dev/update-native.sh                    # Build from local sdk-rust for current platform
#   ./bin/dev/update-native.sh --download [VER]   # Download from GitHub release (default: latest)
#
# Prerequisites:
#   For local build:
#     - Rust toolchain installed
#     - Node.js and pnpm installed
#     - sdk-rust repository available at ../sdk-rust (or set SDK_RUST_PATH)
#
#   For download:
#     - GitHub CLI (gh) installed and authenticated
#
# Examples:
#   ./bin/dev/update-native.sh                    # Build from local sdk-rust
#   ./bin/dev/update-native.sh --download         # Download latest release
#   ./bin/dev/update-native.sh --download v0.1.0  # Download specific version

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_TS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SDK_RUST_PATH="${SDK_RUST_PATH:-$SDK_TS_ROOT/../sdk-rust}"
SDK_RUST_REPO="${SDK_RUST_REPO:-flovyn/sdk-rust}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect current platform in NAPI-RS format
detect_platform() {
    local os=$(uname -s | tr '[:upper:]' '[:lower:]')
    local arch=$(uname -m)

    case "$os" in
        darwin)
            case "$arch" in
                arm64|aarch64) echo "darwin-arm64" ;;
                x86_64) echo "darwin-x64" ;;
                *) log_error "Unsupported macOS architecture: $arch"; exit 1 ;;
            esac
            ;;
        linux)
            case "$arch" in
                aarch64) echo "linux-arm64-gnu" ;;
                x86_64) echo "linux-x64-gnu" ;;
                *) log_error "Unsupported Linux architecture: $arch"; exit 1 ;;
            esac
            ;;
        mingw*|msys*|cygwin*)
            echo "win32-x64-msvc"
            ;;
        *)
            log_error "Unsupported OS: $os"
            exit 1
            ;;
    esac
}

# Get library filename for platform
get_lib_name() {
    case "$1" in
        darwin-*) echo "flovyn-worker-napi.darwin-${1#darwin-}.node" ;;
        linux-*) echo "flovyn-worker-napi.${1}.node" ;;
        win32-*) echo "flovyn-worker-napi.win32-x64-msvc.node" ;;
        *) log_error "Unknown platform: $1"; exit 1 ;;
    esac
}

# Check if sdk-rust exists (for local builds)
check_sdk_rust() {
    if [[ ! -d "$SDK_RUST_PATH" ]]; then
        log_error "sdk-rust not found at: $SDK_RUST_PATH"
        log_error "Set SDK_RUST_PATH environment variable or use --download to fetch from GitHub releases"
        exit 1
    fi
    SDK_RUST_PATH="$(cd "$SDK_RUST_PATH" && pwd)"
    log_info "Using sdk-rust at: $SDK_RUST_PATH"
}

# Build for current platform using NAPI-RS
build_current_platform() {
    check_sdk_rust

    local platform=$(detect_platform)
    log_info "Building worker-napi for current platform ($platform)..."

    local worker_napi_dir="$SDK_RUST_PATH/worker-napi"
    if [[ ! -d "$worker_napi_dir" ]]; then
        log_error "worker-napi directory not found at: $worker_napi_dir"
        exit 1
    fi

    # Build using napi-rs
    log_info "Running napi build..."
    (cd "$worker_napi_dir" && pnpm install && pnpm build)

    # Copy the built .node file to packages/native
    local dest_dir="$SDK_TS_ROOT/packages/native"
    mkdir -p "$dest_dir"

    # Find the built .node file
    local node_file=$(find "$worker_napi_dir" -name "*.node" -type f | head -1)
    if [[ -n "$node_file" ]]; then
        cp "$node_file" "$dest_dir/"
        log_info "Copied $(basename "$node_file") to $dest_dir"
    else
        log_error "No .node file found after build"
        exit 1
    fi

    # Copy TypeScript definitions
    local index_d_ts="$worker_napi_dir/index.d.ts"
    if [[ -f "$index_d_ts" ]]; then
        cp "$index_d_ts" "$dest_dir/generated.d.ts"
        log_info "Copied TypeScript definitions to $dest_dir/generated.d.ts"
    fi
}

# Download from GitHub releases
download_from_release() {
    local version="${1:-latest}"

    # Check if gh is installed
    if ! command -v gh &> /dev/null; then
        log_error "GitHub CLI (gh) is not installed"
        log_error "Install it from: https://cli.github.com/"
        exit 1
    fi

    # Check if gh is authenticated
    if ! gh auth status &> /dev/null; then
        log_error "GitHub CLI is not authenticated"
        log_error "Run: gh auth login"
        exit 1
    fi

    # Detect current platform
    local current_platform=$(detect_platform)
    log_info "Detected platform: $current_platform"

    log_info "Downloading NAPI artifacts from $SDK_RUST_REPO release: $version"

    local tmp_dir=$(mktemp -d)
    trap "rm -rf $tmp_dir" EXIT

    # Download the current platform's archive
    local archive_pattern="flovyn-worker-napi-${current_platform}.tar.gz"

    if [[ "$version" == "latest" ]]; then
        log_info "Fetching latest release..."
        gh release download \
            --repo "$SDK_RUST_REPO" \
            --pattern "$archive_pattern" \
            --dir "$tmp_dir" \
            2>&1 || {
                log_error "Failed to download release. Make sure releases exist in $SDK_RUST_REPO"
                log_warn "Falling back to local build..."
                build_current_platform
                return
            }
    else
        log_info "Fetching release $version..."
        gh release download "$version" \
            --repo "$SDK_RUST_REPO" \
            --pattern "$archive_pattern" \
            --dir "$tmp_dir" \
            2>&1 || {
                log_error "Failed to download release $version from $SDK_RUST_REPO"
                log_warn "Falling back to local build..."
                build_current_platform
                return
            }
    fi

    # Prepare destination directory
    local dest_dir="$SDK_TS_ROOT/packages/native"
    mkdir -p "$dest_dir"

    # Extract native library
    log_info "Extracting native library for $current_platform..."
    local archive="$tmp_dir/$archive_pattern"
    if [[ -f "$archive" ]]; then
        tar -xzf "$archive" -C "$dest_dir/"
        log_info "Extracted to $dest_dir"
    else
        log_error "Archive not found: $archive_pattern"
        log_warn "Falling back to local build..."
        build_current_platform
        return
    fi

    log_info "Download complete!"
}

# Show help
show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Update native NAPI library from sdk-rust.

Options:
  (none)              Build from local sdk-rust for current platform
  --download [VER]    Download from GitHub release (default: latest)
  --help              Show this help message

Environment Variables:
  SDK_RUST_PATH   Path to local sdk-rust repository (default: ../sdk-rust)
  SDK_RUST_REPO   GitHub repository for releases (default: flovyn/sdk-rust)

Examples:
  $0                          # Build from local sdk-rust
  $0 --download               # Download latest release
  $0 --download v0.1.0        # Download specific version
EOF
}

# Main
main() {
    local mode="${1:-local}"

    case "$mode" in
        --download|-d)
            local version="${2:-latest}"
            download_from_release "$version"
            ;;
        --help|-h)
            show_help
            ;;
        local|*)
            build_current_platform
            ;;
    esac

    log_info "Done!"
}

main "$@"
