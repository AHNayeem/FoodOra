import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

import { ValidationError, type ValidationIssue } from '../errors';

/**
 * Runs a Zod schema before the resolver ever sees the argument.
 *
 * The schemas themselves live in `shared/contracts` and are imported by **both**
 * sides — the same object validates a react-hook-form submission in the browser
 * and the mutation on the server, so a rule cannot drift between them
 * (D5 §Validation). What the client checks for responsiveness, the server
 * re-checks for truth.
 *
 * Zod messages are i18n keys, not prose, because the failure is rendered by the
 * frontend in whichever of en/bn/ar the user is reading.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    // `input.address.postcode` — the exact path react-hook-form's `setError`
    // wants, prefixed with the argument name so a form with two inputs can tell
    // which one failed.
    const prefix = metadata.data ? `${metadata.data}.` : '';
    const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
      path: `${prefix}${issue.path.join('.')}`.replace(/\.$/, ''),
      key: issue.message,
    }));

    throw new ValidationError(issues);
  }
}

/** Sugar: `@Args('input', zodPipe(PlaceOrderSchema))`. */
export function zodPipe<T>(schema: ZodType<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
