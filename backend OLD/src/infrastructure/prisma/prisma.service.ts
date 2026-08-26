import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { databaseConfig, type DatabaseConfig } from '../../config';
import { auditExtension } from './extensions/audit.extension';
import { optimisticLockExtension } from './extensions/optimistic-lock.extension';
import { softDeleteExtension } from './extensions/soft-delete.extension';
import { PrismaClient } from './generated';

/** The client repositories actually use — base client plus the three conventions. */
function applyExtensions(client: PrismaClient) {
  // Order matters: soft delete rewrites the `where` before optimistic locking
  // reads it, and audit stamps `data` before either touches it.
  return client.$extends(auditExtension).$extends(optimisticLockExtension).$extends(softDeleteExtension);
}

export type ExtendedPrismaClient = ReturnType<typeof applyExtensions>;

/**
 * A client without the connection-level methods — what a repository is handed,
 * and what `$transaction` provides. Making it a distinct type is what stops a
 * repository from opening its own transaction: the boundary is the application
 * handler's decision (D1 §Transactions), not the repository's.
 */
export type DbClient = Omit<
  ExtendedPrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends' | '$use'
>;

/**
 * The client options, as a type, so `$on('query', …)` is typed rather than
 * `any`. Prisma derives the event map from the `log` configuration.
 */
type PrismaOptions = {
  log: [
    { emit: 'event'; level: 'query' },
    { emit: 'event'; level: 'warn' },
    { emit: 'event'; level: 'error' },
  ];
  errorFormat: 'minimal';
  datasourceUrl: string;
};

@Injectable()
export class PrismaService
  extends PrismaClient<PrismaOptions>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  /** Repositories inject this, never the raw client. */
  readonly db: ExtendedPrismaClient;

  constructor(@Inject(databaseConfig.KEY) private readonly config: DatabaseConfig) {
    super({
      // Taken from validated config rather than read from the environment by
      // Prisma itself, so there is exactly one place the URL comes from.
      datasourceUrl: config.url,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
      errorFormat: 'minimal',
    });

    this.db = applyExtensions(this);
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async onModuleInit(): Promise<void> {
    this.wireQueryLogging();
    await this.connectWithRetry();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.connected = false;
  }

  /** Used by the readiness probe. Cheap, and it exercises the pool, not a cache. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
    this.connected = true;
  }

  /**
   * A database that is briefly unreachable at boot must not crash-loop the pod.
   *
   * The process starts either way and `/health/ready` reports the truth, so the
   * orchestrator withholds traffic instead of restarting — which is the same
   * reasoning that keeps `/health/live` dependency-free (D10 §Health checks).
   * A pod that dies on a two-second failover takes the whole rollout with it.
   */
  private async connectWithRetry(): Promise<void> {
    const { connectRetries, connectRetryDelayMs } = this.config;

    for (let attempt = 1; attempt <= connectRetries + 1; attempt++) {
      try {
        await this.$connect();
        this.connected = true;
        this.logger.log('Connected to PostgreSQL');
        return;
      } catch (error) {
        const last = attempt === connectRetries + 1;
        this.logger.warn(
          `PostgreSQL connection attempt ${attempt}/${connectRetries + 1} failed${last ? '' : `, retrying in ${connectRetryDelayMs}ms`}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        if (last) {
          this.logger.error(
            'Starting without a database connection. /health/ready will report "down" until it recovers.',
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, connectRetryDelayMs));
      }
    }
  }

  /**
   * Slow queries are logged with their duration; full query text only when
   * explicitly asked for, because it contains the parameters — and the
   * parameters contain the phone numbers.
   */
  private wireQueryLogging(): void {
    const { logQueries, slowQueryMs } = this.config;

    this.$on('query', (event) => {
      if (event.duration >= slowQueryMs) {
        this.logger.warn({ durationMs: event.duration, query: event.query }, 'slow query');
      } else if (logQueries) {
        this.logger.debug({ durationMs: event.duration, query: event.query });
      }
    });

    this.$on('warn', (event) => this.logger.warn(event.message));
    this.$on('error', (event) => {
      this.connected = false;
      this.logger.error(event.message);
    });
  }
}
