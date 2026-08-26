import type { DomainEvent } from './domain-event';

/**
 * The audit shape every persisted row carries, and the one
 * `frontend/types/common.ts::BaseEntity` already exposes — so a read model needs
 * no reshaping at the boundary.
 */
export interface AuditFields {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Soft-delete marker; `null` means active (D2 §Soft delete). */
  readonly deletedAt: Date | null;
}

export abstract class Entity<TId extends string = string> {
  protected constructor(public readonly id: TId) {}

  equals(other?: Entity<TId> | null): boolean {
    if (!other) return false;
    if (other === this) return true;
    return other.constructor === this.constructor && other.id === this.id;
  }
}

/**
 * An aggregate root is the only object a repository loads or saves, and the
 * only place invariants are enforced. It records the events its behaviour
 * produced; the application layer drains them *after* the transaction commits.
 */
export abstract class AggregateRoot<TId extends string = string> extends Entity<TId> {
  /** Optimistic locking (D2 §Optimistic locking); `updateMany` guards on it. */
  private _version = 0;
  private _events: DomainEvent[] = [];

  get version(): number {
    return this._version;
  }

  protected setVersion(version: number): void {
    this._version = version;
  }

  protected record(event: DomainEvent): void {
    this._events.push(event);
  }

  /** Returns the pending events and clears them — draining is a one-shot. */
  pullEvents(): DomainEvent[] {
    const events = this._events;
    this._events = [];
    return events;
  }
}
