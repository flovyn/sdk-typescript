# Contributing to the Flovyn TypeScript SDK

Thank you for your interest in contributing to the Flovyn TypeScript SDK! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 20 or later
- pnpm 9 or later
- Docker (for E2E tests)
- Rust toolchain (only for building native modules locally)

### Initial Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/flovyn/sdk-typescript.git
   cd sdk-typescript
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Get the native module (choose one option):

   **Option A: Download from release (recommended for most contributors)**
   ```bash
   ./bin/download-napi.sh v0.1.7
   ```

   **Option B: Build from local sdk-rust (for native module development)**
   ```bash
   # Requires sdk-rust repo at ../sdk-rust
   ./bin/dev/update-native.sh
   ```

4. Build packages:
   ```bash
   pnpm build
   # or
   ./bin/dev/build.sh
   ```

### Running Tests

**Unit tests:**
```bash
pnpm test
# or
./bin/dev/test.sh
```

**E2E tests (requires Docker):**
```bash
pnpm test:e2e
# or
./bin/dev/test.sh --e2e
```

**All tests:**
```bash
./bin/dev/test.sh --all
```

**Watch mode (for development):**
```bash
./bin/dev/test.sh --watch
```

### Linting and Formatting

```bash
# Lint
pnpm lint

# Format code
pnpm format

# Type check
pnpm typecheck
```

## Project Structure

```
sdk-typescript/
├── packages/
│   ├── native/           # @flovyn/native - Native bindings wrapper
│   │   ├── src/
│   │   │   ├── index.ts  # Re-exports from generated bindings
│   │   │   └── loader.ts # Platform detection and binary loading
│   │   └── *.node        # Native modules (platform-specific)
│   └── sdk/              # @flovyn/sdk - High-level TypeScript API
│       ├── src/
│       │   ├── index.ts          # Public exports
│       │   ├── client.ts         # FlovynClient
│       │   ├── workflow.ts       # workflow() factory
│       │   ├── task.ts           # task() factory
│       │   ├── context/          # WorkflowContext, TaskContext
│       │   ├── worker/           # Internal worker implementation
│       │   └── testing/          # Test utilities
│       └── tests/                # Unit tests
├── tests/
│   └── e2e/              # E2E tests
│       └── fixtures/     # Test workflows and tasks
├── examples/             # Example applications
│   ├── basic/
│   ├── order-processing/
│   └── data-pipeline/
└── bin/
    ├── download-napi.sh  # Download native module from releases
    └── dev/
        ├── update-native.sh  # Build/download native module
        ├── build.sh          # Build all packages
        └── test.sh           # Run tests
```

## Making Changes

### Code Style

- Follow the existing code style
- Use TypeScript strict mode
- Add JSDoc comments for public APIs
- Keep functions focused and small
- Prefer immutability where practical

### Testing

- Write unit tests for new functionality
- Add E2E tests for integration scenarios
- Ensure all tests pass before submitting

### Commits

- Write clear, concise commit messages
- Use conventional commit format when applicable:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `docs:` for documentation changes
  - `test:` for test changes
  - `refactor:` for code refactoring

### Pull Requests

1. Create a new branch for your changes
2. Make your changes with tests
3. Ensure all tests pass: `./bin/dev/test.sh --all`
4. Ensure linting passes: `pnpm lint`
5. Submit a pull request with a clear description

## Native Module Development

If you need to modify the native module (in `sdk-rust/worker-napi`):

1. Make changes in the sdk-rust repository
2. Build the native module:
   ```bash
   cd ../sdk-rust/worker-napi
   pnpm build
   ```
3. Copy to sdk-typescript:
   ```bash
   cd ../sdk-typescript
   ./bin/dev/update-native.sh
   ```
4. Test your changes:
   ```bash
   ./bin/dev/test.sh --all
   ```

## Questions?

If you have questions or need help:
- Open an issue on GitHub
- Check existing documentation in `CLAUDE.md`
- Review the design document in `../dev/docs/design/`

Thank you for contributing!
