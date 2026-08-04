import { GraphQLError, GraphQLScalarType, Kind, type ValueNode } from 'graphql';

/**
 * The one place a naïve code-first schema would break the frontend.
 *
 * GraphQL enum values must match the name grammar — a letter or underscore
 * followed by letters, digits or underscores. The frontend's unions are
 * kebab-case — `"cloud-kitchen"`, `"rider-assigned"`,
 * `"free-delivery"` — so a native GraphQL enum simply **cannot** carry them, and
 * mapping `CLOUD_KITCHEN ↔ "cloud-kitchen"` on the client would put a
 * translation layer in exactly the place this architecture exists to avoid
 * (D5 §Enums).
 *
 * So every domain vocabulary reaches the wire as a validated scalar: the value
 * is the frontend's string verbatim, the server still rejects anything outside
 * the set, and codegen emits the exact TypeScript union. The cost is losing
 * enum autocomplete in GraphiQL — the description lists the members instead.
 *
 * Postgres keeps native enums underneath, with `@map`-ed kebab-case labels, so
 * storage integrity is unaffected.
 */
export function createEnumScalar<T extends string>(
  name: string,
  values: readonly T[],
  description?: string,
): GraphQLScalarType<T, T> {
  const allowed = new Set<string>(values);

  const assertMember = (value: unknown): T => {
    if (typeof value !== 'string' || !allowed.has(value)) {
      throw new GraphQLError(
        `Expected ${name} to be one of: ${values.join(' | ')}. Received ${JSON.stringify(value)}.`,
        { extensions: { code: 'BAD_USER_INPUT', scalar: name } },
      );
    }
    return value as T;
  };

  return new GraphQLScalarType<T, T>({
    name,
    description: `${description ? `${description} ` : ''}One of: ${values.join(' | ')}.`,
    serialize: assertMember,
    parseValue: assertMember,
    parseLiteral: (ast: ValueNode) => {
      if (ast.kind !== Kind.STRING) {
        throw new GraphQLError(`${name} must be provided as a String.`, {
          extensions: { code: 'BAD_USER_INPUT', scalar: name },
        });
      }
      return assertMember(ast.value);
    },
  });
}
