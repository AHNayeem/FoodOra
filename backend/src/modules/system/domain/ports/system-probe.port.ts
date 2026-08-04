import type { ServiceStatus } from '../../../../shared/enums';

/**
 * A port: what the application layer needs, expressed without naming who
 * provides it. `infrastructure/` supplies the adapter; `domain/` never learns
 * that the answer comes from Prisma and ioredis.
 *
 * This module is small on purpose. It is the reference implementation of the
 * D1 layering that every later module copies — domain declares the contract,
 * application orchestrates, infrastructure adapts, presentation maps — so the
 * pattern is demonstrated on something with no business rules to argue about.
 */
export const SYSTEM_PROBE = Symbol('SYSTEM_PROBE');

export interface DependencyState {
  /** `database`, `redis-cache`, … */
  name: string;
  status: ServiceStatus;
  latencyMs: number | null;
}

export interface SystemProbePort {
  probeDependencies(): Promise<DependencyState[]>;
}
