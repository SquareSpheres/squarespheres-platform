# CI Pipeline Structure

This project uses GitHub Actions for continuous integration with a modular approach that separates concerns for better efficiency and maintainability.

## Pipeline Overview

The CI pipeline consists of three main jobs that run in parallel where possible:

### 1. `test-wasm` Job
- **Purpose**: Tests and builds the WebAssembly module from Rust source code
- **Dependencies**: None (runs independently)
- **Steps**:
  - Sets up Rust toolchain with WASM target
  - Caches Rust dependencies for faster builds
  - Installs wasm-pack
  - Runs Rust unit tests with `cargo test`
  - Builds WASM module using `wasm-pack build`
  - Uploads WASM artifacts for use by other jobs

### 2. `test-frontend` Job
- **Purpose**: Runs frontend tests, linting, and code quality checks
- **Dependencies**: None (runs independently)
- **Steps**:
  - Sets up Node.js environment
  - Installs npm dependencies
  - Runs ESLint for code quality
  - Runs Jest tests for component and utility testing
- **Benefits**: Fast feedback on code quality without waiting for WASM build

### 3. `build-frontend` Job
- **Purpose**: Builds the complete frontend application
- **Dependencies**: `test-wasm` and `test-frontend` (both must pass)
- **Steps**:
  - Downloads WASM artifacts from `test-wasm` job
  - Sets up Node.js environment
  - Installs npm dependencies
  - Builds frontend with WASM integration using `SKIP_WASM=1` flag

### 4. `test-signaling-server` Job
- **Purpose**: Tests the .NET signaling server
- **Dependencies**: None (runs independently)
- **Steps**:
  - Sets up .NET 9.0 environment
  - Restores dependencies and tools
  - Runs code formatting checks with CSharpier
  - Builds the solution
  - Runs unit tests

### 5. `deploy-signaling-server` Job
- **Purpose**: Deploys signaling server to Fly.io (only on main branch)
- **Dependencies**: `test-signaling-server`
- **Steps**:
  - Checks for signaling server changes
  - Sets up Fly.io CLI
  - Deploys to production

## Benefits of This Structure

### Efficiency
- **Parallel Execution**: WASM build, frontend testing, and signaling server testing run in parallel
- **Fast Feedback**: Frontend tests run without waiting for WASM compilation
- **Caching**: Rust dependencies are cached for faster WASM builds

### Modularity
- **Separation of Concerns**: Each job has a single responsibility
- **Independent Testing**: Frontend tests don't require WASM to be built
- **Artifact Sharing**: WASM artifacts are shared between jobs efficiently

### Reliability
- **Dependency Management**: Frontend build only runs if both WASM build and tests pass
- **Isolated Failures**: Issues in one component don't block testing of others
- **Clear Dependencies**: Job dependencies are explicit and easy to understand

## Environment Variables

- `SKIP_WASM=1`: Skips WASM build step in frontend build process
- `VERCEL=1`: Used by Vercel deployment to skip WASM build (handled by Vercel)

## Local Development

For local development, you can run individual components:

```bash
# Run only frontend tests (no WASM needed)
cd frontend && npm test

# Run WASM tests
cd wasm-app && cargo test

# Build WASM separately
cd wasm-app && wasm-pack build --target web --out-dir ../frontend/src/wasm

# Build frontend with existing WASM
cd frontend && SKIP_WASM=1 npm run build
```

## Testing

### Frontend Testing
- **Framework**: Jest + React Testing Library
- **Location**: `frontend/__tests__/`
- **Command**: `npm test`
- **Coverage**: Basic coverage thresholds set

### WASM Testing
- **Framework**: Rust built-in testing
- **Location**: `wasm-app/src/lib.rs` (test module)
- **Command**: `cargo test`
- **Tests**: 4 basic tests covering core functions
  - `test_compress_chunk_basic`
  - `test_decompress_chunk_basic` 
  - `test_hash_chunk_basic`
  - `test_compress_decompress_roundtrip`

This structure ensures that the CI pipeline is both efficient and maintainable, providing fast feedback while ensuring all components work together correctly.
