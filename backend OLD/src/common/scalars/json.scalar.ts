import { GraphQLError, GraphQLScalarType, Kind, type ObjectValueNode, type ValueNode } from 'graphql';

/**
 * Serves the JSONB columns whose whole purpose is *not* to be joined —
 * `Order.vendorSnapshot`, `Reservation.venueSnapshot`, notification template
 * params, audit diffs (D2 §Snapshots). They are immutable copies that already
 * have the shape the frontend renders, so reshaping them into typed GraphQL
 * objects would be work in service of nothing.
 *
 * Everything a client filters, sorts or joins on is a real column with a real
 * type. If a field starts being queried, that is the signal to promote it out
 * of the JSON, not to build a JSON query language.
 */
function parseLiteral(ast: ValueNode, variables?: Record<string, unknown> | null): unknown {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value);
    case Kind.OBJECT:
      return parseObject(ast, variables);
    case Kind.LIST:
      return ast.values.map((value) => parseLiteral(value, variables));
    case Kind.NULL:
      return null;
    case Kind.VARIABLE:
      return variables?.[ast.name.value];
    default:
      throw new GraphQLError(`JSONObject cannot represent a ${ast.kind} literal.`, {
        extensions: { code: 'BAD_USER_INPUT', scalar: 'JSONObject' },
      });
  }
}

function parseObject(
  ast: ObjectValueNode,
  variables?: Record<string, unknown> | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of ast.fields) {
    out[field.name.value] = parseLiteral(field.value, variables);
  }
  return out;
}

function assertObject(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new GraphQLError(`JSONObject ${where} expects an object; got ${typeof value}.`, {
      extensions: { code: 'BAD_USER_INPUT', scalar: 'JSONObject' },
    });
  }
  return value as Record<string, unknown>;
}

export const JSONObjectScalar = new GraphQLScalarType<
  Record<string, unknown>,
  Record<string, unknown>
>({
  name: 'JSONObject',
  description: 'An arbitrary JSON object. Used for immutable snapshots and template parameters.',
  serialize: (value) => assertObject(value, 'output'),
  parseValue: (value) => assertObject(value, 'input'),
  parseLiteral: (ast, variables) => {
    if (ast.kind !== Kind.OBJECT) {
      throw new GraphQLError('JSONObject must be provided as an object literal.', {
        extensions: { code: 'BAD_USER_INPUT', scalar: 'JSONObject' },
      });
    }
    return parseObject(ast, variables);
  },
});
