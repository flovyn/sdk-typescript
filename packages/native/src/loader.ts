/**
 * Native module loader with platform detection.
 *
 * This module handles loading the correct native binary for the current platform.
 * It supports both installed packages (via optionalDependencies) and development
 * builds (from sdk-rust/worker-napi/target).
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// Store loaded module
let loadedModule: unknown = null;

/**
 * Platform-specific package name mapping.
 */
function getPackageName(): string {
  const platform = process.platform;
  const arch = process.arch;

  switch (platform) {
    case 'darwin':
      return arch === 'arm64' ? '@flovyn/native-darwin-arm64' : '@flovyn/native-darwin-x64';
    case 'linux':
      if (arch === 'arm64') {
        return isMusl() ? '@flovyn/native-linux-arm64-musl' : '@flovyn/native-linux-arm64-gnu';
      }
      return isMusl() ? '@flovyn/native-linux-x64-musl' : '@flovyn/native-linux-x64-gnu';
    case 'win32':
      return '@flovyn/native-win32-x64-msvc';
    default:
      throw new Error(`Unsupported platform: ${platform} ${arch}`);
  }
}

/**
 * Check if running on musl libc (Alpine, etc).
 */
function isMusl(): boolean {
  try {
    const ldd = execSync('ldd --version 2>&1', { encoding: 'utf8' });
    return ldd.includes('musl');
  } catch {
    return false;
  }
}

/**
 * Get the native binary file name for the current platform.
 * NAPI-RS generates files with different names depending on build type:
 * - Release build with --platform: flovyn-native.{target}.node
 * - Debug build without --platform: flovyn-native.node
 */
function getNativeBinaryName(): string {
  const platform = process.platform;
  const arch = process.arch;

  switch (platform) {
    case 'darwin':
      return arch === 'arm64'
        ? 'flovyn-native.darwin-arm64.node'
        : 'flovyn-native.darwin-x64.node';
    case 'linux':
      if (arch === 'arm64') {
        return isMusl()
          ? 'flovyn-native.linux-arm64-musl.node'
          : 'flovyn-native.linux-arm64-gnu.node';
      }
      return isMusl()
        ? 'flovyn-native.linux-x64-musl.node'
        : 'flovyn-native.linux-x64-gnu.node';
    case 'win32':
      return 'flovyn-native.win32-x64-msvc.node';
    default:
      throw new Error(`Unsupported platform: ${platform} ${arch}`);
  }
}

/**
 * Get the simple binary name for development builds (no platform suffix).
 */
function getSimpleBinaryName(): string {
  return 'flovyn-native.node';
}

/**
 * Load the native module.
 *
 * Tries the following locations in order:
 * 1. Installed platform-specific package (optionalDependency)
 * 2. Development build in sdk-rust/worker-napi/
 * 3. Local .node file in package directory
 */
export function loadNativeModule(): unknown {
  if (loadedModule) {
    return loadedModule;
  }

  const binaryName = getNativeBinaryName();
  const packageName = getPackageName();

  // Try platform-specific package first
  try {
    // Use dynamic import for ESM compatibility
    loadedModule = require(packageName);
    return loadedModule;
  } catch {
    // Package not installed, try development paths
  }

  // Get the directory where this file is located at runtime
  // __dirname works in CommonJS, for ESM we need a different approach
  const baseDir =
    typeof __dirname !== 'undefined' ? __dirname : process.cwd();

  const simpleBinaryName = getSimpleBinaryName();

  // Try development build path (relative to sdk-typescript)
  // Try both the platform-specific name and the simple name
  const devPaths = [
    // From packages/native/dist (simple name for dev builds)
    join(baseDir, '..', '..', '..', '..', 'sdk-rust', 'worker-napi', simpleBinaryName),
    // From packages/native/src
    join(baseDir, '..', '..', '..', 'sdk-rust', 'worker-napi', simpleBinaryName),
    // From sdk-typescript root
    join(baseDir, '..', 'sdk-rust', 'worker-napi', simpleBinaryName),
    // Platform-specific paths
    join(baseDir, '..', '..', '..', '..', 'sdk-rust', 'worker-napi', binaryName),
    join(baseDir, '..', '..', '..', 'sdk-rust', 'worker-napi', binaryName),
    join(baseDir, '..', 'sdk-rust', 'worker-napi', binaryName),
  ];

  for (const devPath of devPaths) {
    if (existsSync(devPath)) {
      loadedModule = require(devPath);
      return loadedModule;
    }
  }

  // Try local directory
  const localPaths = [
    join(baseDir, '..', binaryName),
    join(baseDir, binaryName),
  ];

  for (const localPath of localPaths) {
    if (existsSync(localPath)) {
      loadedModule = require(localPath);
      return loadedModule;
    }
  }

  throw new Error(
    `Failed to load native module. Tried:\n` +
      `  - Package: ${packageName}\n` +
      `  - Dev paths: ${devPaths.join(', ')}\n` +
      `  - Local paths: ${localPaths.join(', ')}\n` +
      `\nPlatform: ${process.platform} ${process.arch}\n` +
      `\nPlease ensure the native module is built: cd sdk-rust/worker-napi && napi build`
  );
}
