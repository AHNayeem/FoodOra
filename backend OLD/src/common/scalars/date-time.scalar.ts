import { GraphQLError, GraphQLScalarType, Kind, type ValueNode } from 'graphql';

/**
 * ISO-8601 on the wire, `Date` in the server, and exactly what
 * `frontend/types/common.ts::ISODate` already is — a string. The frontend
 * never parses these into `Date` at the boundary, so the format has to be the
 * one it already stores.
 */
function toDate(value: unknown, where: string): Date {
  const date =
    value instanceof Date
      ? value
      : typeof value === 'string' || typeof value === 'number'
        ? new Date(value)
        : null;

  if (!date || Number.isNaN(date.getTime())) {
    throw new GraphQLError(`DateTime ${where} expects an ISO-8601 string; got ${typeof value}.`, {
      extensions: { code: 'BAD_USER_INPUT', scalar: 'DateTime' },
    });
  }
  return date;
}

export const DateTimeScalar = new GraphQLScalarType<Date, string>({
  name: 'DateTime',
  description: 'An ISO-8601 timestamp in UTC, e.g. "2026-08-03T14:20:00.000Z".',
  serialize: (value) => toDate(value, 'output').toISOString(),
  parseValue: (value) => toDate(value, 'input'),
  parseLiteral: (ast: ValueNode) => {
    if (ast.kind !== Kind.STRING) {
      throw new GraphQLError('DateTime must be provided as a String.', {
        extensions: { code: 'BAD_USER_INPUT', scalar: 'DateTime' },
      });
    }
    return toDate(ast.value, 'literal');
  },
});
