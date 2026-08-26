import { GraphQLError, GraphQLScalarType, Kind, type ValueNode } from 'graphql';

/** Anything with `.toNumber()` — Prisma's `Decimal`, decimal.js, big.js. */
interface DecimalLike {
  toNumber(): number;
}

function isDecimalLike(value: unknown): value is DecimalLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toNumber' in value &&
    typeof (value as DecimalLike).toNumber === 'function'
  );
}

/**
 * Money crosses the wire as a plain number in the entity's own currency —
 * `1250` is ৳1250, and BDT displays with zero fraction digits.
 *
 * Storage is `Decimal(14, 2)`, not minor-unit integers, because the frontend
 * types money as `number` and minor units would have put an exponent conversion
 * in every resolver in both directions (D2 §Money). `numeric` is exact; this
 * scalar is the single `.toNumber()` at the boundary, and the only place the
 * lossy step happens — which is why it is one file rather than three hundred
 * call sites.
 *
 * The currency travels beside the amount on the owning type (`Order.currency`,
 * `Vendor.currency`), never inside it.
 */
function toAmount(value: unknown, where: string): number {
  const amount = isDecimalLike(value)
    ? value.toNumber()
    : typeof value === 'string'
      ? Number(value)
      : value;

  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new GraphQLError(`Money ${where} expects a finite number; got ${typeof value}.`, {
      extensions: { code: 'BAD_USER_INPUT', scalar: 'Money' },
    });
  }
  // Two decimal places, matching Decimal(14, 2). Rounding here rather than
  // trusting float arithmetic keeps 0.1 + 0.2 out of a receipt.
  return Math.round(amount * 100) / 100;
}

export const MoneyScalar = new GraphQLScalarType<number, number>({
  name: 'Money',
  description:
    'A monetary amount as a plain number in the entity\'s currency (stored as Decimal(14,2)). The currency code travels on the owning type.',
  serialize: (value) => toAmount(value, 'output'),
  parseValue: (value) => toAmount(value, 'input'),
  parseLiteral: (ast: ValueNode) => {
    if (ast.kind !== Kind.FLOAT && ast.kind !== Kind.INT && ast.kind !== Kind.STRING) {
      throw new GraphQLError('Money must be provided as a number.', {
        extensions: { code: 'BAD_USER_INPUT', scalar: 'Money' },
      });
    }
    return toAmount(ast.value, 'literal');
  },
});
