/**
 * Test harness that manages Docker containers for E2E testing.
 *
 * Uses Testcontainers to start PostgreSQL, NATS, and Flovyn server containers.
 */

import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, unlinkSync } from 'fs';

/**
 * Container instance interface (simplified for our needs).
 */
interface StartedContainer {
  getHost(): string;
  getMappedPort(port: number): number;
  stop(): Promise<void>;
}

/**
 * Extended container with getPort for PostgreSQL.
 */
interface PostgresContainer extends StartedContainer {
  getPort(): number;
}

/**
 * Configuration for the test harness.
 */
export interface TestHarnessConfig {
  /**
   * Docker image for the Flovyn server.
   * Defaults to FLOVYN_SERVER_IMAGE env var or the official image.
   */
  serverImage?: string;

  /**
   * PostgreSQL image.
   */
  postgresImage?: string;

  /**
   * NATS image.
   */
  natsImage?: string;

  /**
   * Health check timeout in milliseconds.
   */
  healthCheckTimeout?: number;
}

/**
 * Test harness that manages Docker containers for E2E testing.
 *
 * This class handles the lifecycle of Docker containers needed for testing:
 * - PostgreSQL for database
 * - NATS for messaging
 * - Flovyn server
 *
 * The harness is typically shared across all tests in a session.
 */
export class TestHarness {
  private _postgresContainer: PostgresContainer | null = null;
  private _natsContainer: StartedContainer | null = null;
  private _serverContainer: StartedContainer | null = null;
  private _configFilePath: string | null = null;
  private _started = false;

  /** gRPC host for connecting to the server. */
  grpcHost = 'localhost';
  /** gRPC port for connecting to the server. */
  grpcPort = 9090;
  /** HTTP host for the server. */
  httpHost = 'localhost';
  /** HTTP port for the server. */
  httpPort = 8000;

  /** Generated organization ID for this test session. */
  readonly orgId: string;
  /** Generated organization slug for this test session. */
  readonly orgSlug: string;
  /** Generated API key for this test session. */
  readonly apiKey: string;
  /** Generated worker token for this test session. */
  readonly workerToken: string;

  private readonly config: Required<TestHarnessConfig>;

  constructor(config: TestHarnessConfig = {}) {
    this.config = {
      serverImage:
        config.serverImage ??
        process.env.FLOVYN_SERVER_IMAGE ??
        'rg.fr-par.scw.cloud/flovyn/flovyn-server:latest',
      postgresImage: config.postgresImage ?? 'postgres:18-alpine',
      natsImage: config.natsImage ?? 'nats:latest',
      healthCheckTimeout: config.healthCheckTimeout ?? 30000,
    };

    // Generate unique credentials for this test session
    this.orgId = randomUUID();
    this.orgSlug = `test-${randomUUID().slice(0, 8)}`;
    this.apiKey = `flovyn_sk_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    this.workerToken = `flovyn_wk_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }

  /**
   * Check if the harness is started.
   */
  get isStarted(): boolean {
    return this._started;
  }

  /**
   * Start all containers.
   */
  async start(): Promise<void> {
    if (this._started) {
      return;
    }

    console.log('[TestHarness] Starting test harness containers...');

    // Dynamic import for testcontainers (optional dependency)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tc: any;
    try {
      tc = await import('testcontainers');
    } catch {
      throw new Error(
        'testcontainers is required for E2E tests. Install with: pnpm add -D testcontainers'
      );
    }

    const { GenericContainer, Wait } = tc;

    // Start PostgreSQL using GenericContainer
    console.log('[TestHarness] Starting PostgreSQL...');
    const postgresBuilder = new GenericContainer(this.config.postgresImage)
      .withEnvironment({
        POSTGRES_USER: 'flovyn',
        POSTGRES_PASSWORD: 'flovyn',
        POSTGRES_DB: 'flovyn',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
      .withStartupTimeout(60000);

    const postgres = await postgresBuilder.start();
    this._postgresContainer = postgres as PostgresContainer;
    const postgresPort = this._postgresContainer.getMappedPort(5432);
    console.log(`[TestHarness] PostgreSQL started at localhost:${postgresPort}`);

    // Start NATS
    console.log('[TestHarness] Starting NATS...');
    const natsBuilder = new GenericContainer(this.config.natsImage)
      .withExposedPorts(4222)
      .withWaitStrategy(Wait.forLogMessage('Server is ready'))
      .withStartupTimeout(60000);
    this._natsContainer = (await natsBuilder.start()) as StartedContainer;
    const natsPort = this._natsContainer.getMappedPort(4222);
    console.log(`[TestHarness] NATS started at localhost:${natsPort}`);

    // Create temp config file for Flovyn server
    const configContent = this._generateServerConfig();
    this._configFilePath = join(tmpdir(), `flovyn-test-config-${Date.now()}.toml`);
    writeFileSync(this._configFilePath, configContent, 'utf-8');
    console.log(`[TestHarness] Created config file at ${this._configFilePath}`);

    // Start Flovyn server
    console.log(`[TestHarness] Starting Flovyn server (${this.config.serverImage})...`);
    const isLinux = process.platform === 'linux';

    let serverBuilder = new GenericContainer(this.config.serverImage)
      .withExposedPorts(8000, 9090)
      .withEnvironment({
        DATABASE_URL: `postgres://flovyn:flovyn@host.docker.internal:${postgresPort}/flovyn`,
        NATS__ENABLED: 'true',
        NATS__URL: `nats://host.docker.internal:${natsPort}`,
        SERVER_PORT: '8000',
        GRPC_SERVER_PORT: '9090',
        CONFIG_FILE: '/app/config.toml',
      })
      .withBindMounts([{ source: this._configFilePath, target: '/app/config.toml', mode: 'ro' }]);

    if (isLinux) {
      serverBuilder = serverBuilder.withExtraHosts([
        { host: 'host.docker.internal', ipAddress: 'host-gateway' },
      ]);
    }

    serverBuilder = serverBuilder.withStartupTimeout(120000);
    this._serverContainer = (await serverBuilder.start()) as StartedContainer;

    this.grpcHost = this._serverContainer.getHost();
    this.grpcPort = this._serverContainer.getMappedPort(9090);
    this.httpHost = this._serverContainer.getHost();
    this.httpPort = this._serverContainer.getMappedPort(8000);

    console.log(
      `[TestHarness] Flovyn server started at gRPC=${this.grpcHost}:${this.grpcPort}, HTTP=${this.httpHost}:${this.httpPort}`
    );

    // Wait for server to be healthy
    await this._waitForHealth();

    this._started = true;
    console.log('[TestHarness] Test harness ready');
  }

  /**
   * Wait for the server to be healthy.
   */
  private async _waitForHealth(): Promise<void> {
    const url = `http://${this.httpHost}:${this.httpPort}/_/health`;
    const startTime = Date.now();

    while (Date.now() - startTime < this.config.healthCheckTimeout) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (response.ok) {
          console.log('[TestHarness] Server health check passed');
          return;
        }
      } catch {
        // Continue waiting
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(
      `Server did not become healthy within ${this.config.healthCheckTimeout}ms`
    );
  }

  /**
   * Generate TOML config for the Flovyn server.
   */
  private _generateServerConfig(): string {
    return `
# Pre-configured organizations
[[orgs]]
id = "${this.orgId}"
name = "Test Organization"
slug = "${this.orgSlug}"
tier = "FREE"

# Authentication configuration
[auth]
enabled = true

# Static API keys
[auth.static_api_key]
keys = [
    { key = "${this.apiKey}", org_id = "${this.orgId}", principal_type = "User", principal_id = "api:test", role = "ADMIN" },
    { key = "${this.workerToken}", org_id = "${this.orgId}", principal_type = "Worker", principal_id = "worker:test" }
]

# Endpoint authentication
[auth.endpoints.http]
authenticators = ["static_api_key"]
authorizer = "cedar"

[auth.endpoints.grpc]
authenticators = ["static_api_key"]
authorizer = "cedar"
`;
  }

  /**
   * Stop all containers.
   */
  async stop(): Promise<void> {
    const keepContainers =
      process.env.FLOVYN_TEST_KEEP_CONTAINERS?.toLowerCase() === 'true' ||
      process.env.FLOVYN_TEST_KEEP_CONTAINERS === '1';

    if (keepContainers) {
      console.log('[TestHarness] Keeping containers running (FLOVYN_TEST_KEEP_CONTAINERS=1)');
      return;
    }

    console.log('[TestHarness] Stopping test harness containers...');

    if (this._serverContainer) {
      try {
        await this._serverContainer.stop();
      } catch (e) {
        console.warn(`[TestHarness] Error stopping server container: ${e}`);
      }
    }

    if (this._natsContainer) {
      try {
        await this._natsContainer.stop();
      } catch (e) {
        console.warn(`[TestHarness] Error stopping NATS container: ${e}`);
      }
    }

    if (this._postgresContainer) {
      try {
        await this._postgresContainer.stop();
      } catch (e) {
        console.warn(`[TestHarness] Error stopping PostgreSQL container: ${e}`);
      }
    }

    // Clean up config file
    if (this._configFilePath) {
      try {
        unlinkSync(this._configFilePath);
      } catch (e) {
        console.warn(`[TestHarness] Error removing config file: ${e}`);
      }
    }

    this._started = false;
    console.log('[TestHarness] Test harness stopped');
  }
}

// Global harness instance
let _globalHarness: TestHarness | null = null;
let _harnessPromise: Promise<TestHarness> | null = null;

/**
 * Get or create the global test harness.
 *
 * The harness is shared across all tests to avoid starting/stopping
 * containers for each test.
 */
export async function getTestHarness(): Promise<TestHarness> {
  if (_globalHarness?.isStarted) {
    return _globalHarness;
  }

  if (_harnessPromise) {
    return _harnessPromise;
  }

  _harnessPromise = (async () => {
    _globalHarness = new TestHarness();
    await _globalHarness.start();
    return _globalHarness;
  })();

  return _harnessPromise;
}

/**
 * Clean up the global test harness.
 *
 * Call this at the end of the test session.
 */
export async function cleanupTestHarness(): Promise<void> {
  if (_globalHarness) {
    await _globalHarness.stop();
    _globalHarness = null;
    _harnessPromise = null;
  }
}
