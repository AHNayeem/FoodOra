import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

import { type DbClient, PrismaService } from './prisma.service';

export interface TransactionOptions {
  /** Milliseconds the interactive transaction may hold open. */
  timeout?: number;
  /** Milliseconds to wait for a connection from the pool. */
  maxWait?: number;
}

/**
 * The unit of work (D1 §Transactions).
 *
 * An application handler declares the boundary — `runInTransaction(async () =>
 * { … })` — and every repository underneath enlists automatically, because
 * `client` reads the transaction out of `AsyncLocalStorage` rather than taking
 * it as a parameter. Repositories therefore never open a transaction and never
 * receive one, which is what keeps a repository composable: the same method
 * works standalone and as one step of a five-repository checkout.
 *
 * Nesting joins the outer transaction rather than opening a second one. Two
 * concurrent transactions inside one request is not a nested unit of work, it
 * is a deadlock waiting for load.
 */
@Injectable()
export class TransactionManager {
  private readonly storage = new AsyncLocalStorage<DbClient>();

  constructor(private readonly prisma: PrismaService) {}

  /** The transaction client if one is open, otherwise the plain client. */
  get client(): DbClient {
    return this.storage.getStore() ?? this.prisma.db;
  }

  get isInTransaction(): boolean {
    return this.storage.getStore() !== undefined;
  }

  async runInTransaction<T>(fn: () => Promise<T>, options: TransactionOptions = {}): Promise<T> {
    if (this.storage.getStore()) return fn();

    return this.prisma.db.$transaction(
      async (tx) => this.storage.run(tx as DbClient, fn),
      // A checkout that has not committed in ten seconds is not going to.
      { timeout: options.timeout ?? 10_000, maxWait: options.maxWait ?? 5_000 },
    );
  }
}
