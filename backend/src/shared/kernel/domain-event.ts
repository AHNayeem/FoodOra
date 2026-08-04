/**
 * A domain event is a fact that has already happened, named in the past tense
 * (`order.placed`, `payment.captured`, `rider.assigned`).
 *
 * Two delivery paths, deliberately different (D1 §Events):
 *
 * - **in-process** (`EventEmitter2`) for same-request reactions that may be
 *   lost if the process dies, because the request died with them;
 * - **transactional outbox** for anything that must survive a crash —
 *   notifications, dispatch, payouts, gateway webhooks. Nothing is published to
 *   a queue inside a transaction that could still roll back.
 */
export interface DomainEvent<TPayload = unknown> {
  /** Stable dotted name; also the outbox topic and the queue routing key. */
  readonly name: string;
  /** The aggregate this happened to, so a consumer can re-read it. */
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: TPayload;
  readonly occurredAt: Date;
  /** Correlates the event with the request that caused it, across services. */
  readonly correlationId?: string;
  /** The actor responsible, when there was one (a cron job has none). */
  readonly actorId?: string;
}

export function domainEvent<TPayload>(
  name: string,
  aggregateType: string,
  aggregateId: string,
  payload: TPayload,
  occurredAt: Date,
  context: { correlationId?: string; actorId?: string } = {},
): DomainEvent<TPayload> {
  return {
    name,
    aggregateType,
    aggregateId,
    payload,
    occurredAt,
    correlationId: context.correlationId,
    actorId: context.actorId,
  };
}
