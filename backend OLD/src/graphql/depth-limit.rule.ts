import {
  type FragmentDefinitionNode,
  GraphQLError,
  Kind,
  type OperationDefinitionNode,
  type SelectionSetNode,
  type ValidationContext,
  type ValidationRule,
} from 'graphql';

/**
 * Rejects a query nested deeper than `max` **before** a single resolver runs
 * (D5 §Performance).
 *
 * Depth is the cheapest denial of service in GraphQL: `vendor { reviews {
 * author { orders { vendor { … } } } } }` is a short document that asks for an
 * exponential amount of work. Complexity scoring catches breadth; this catches
 * depth, and it catches it during validation, which is before the schema has
 * committed to anything.
 *
 * Hand-rolled rather than pulled from a package because the logic is thirty
 * lines and the well-known package for it has been unmaintained for years —
 * a dependency in the request path is a liability, not a convenience.
 */
export function depthLimit(max: number): ValidationRule {
  return (context: ValidationContext) => {
    const fragments: Record<string, FragmentDefinitionNode> = Object.create(null) as Record<
      string,
      FragmentDefinitionNode
    >;

    for (const definition of context.getDocument().definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        fragments[definition.name.value] = definition;
      }
    }

    return {
      OperationDefinition(node: OperationDefinitionNode) {
        const depth = depthOf(node, fragments, new Set());
        if (depth > max) {
          context.reportError(
            new GraphQLError(
              `Query is nested ${depth} levels deep; the maximum is ${max}.`,
              { nodes: [node], extensions: { code: 'BAD_USER_INPUT', depth, max } },
            ),
          );
        }
      },
    };
  };
}

function depthOf(
  node: { selectionSet?: SelectionSetNode },
  fragments: Record<string, FragmentDefinitionNode>,
  /** Guards against a fragment cycle, which would otherwise recurse forever. */
  visitedFragments: Set<string>,
): number {
  if (!node.selectionSet) return 0;

  let deepest = 0;
  for (const selection of node.selectionSet.selections) {
    switch (selection.kind) {
      case Kind.FIELD: {
        // Introspection is one flat, well-known tree; counting it against the
        // budget would break GraphiQL for no security benefit.
        if (selection.name.value.startsWith('__')) break;
        deepest = Math.max(deepest, 1 + depthOf(selection, fragments, visitedFragments));
        break;
      }
      case Kind.INLINE_FRAGMENT:
        // An inline fragment is not a level of nesting, only a type condition.
        deepest = Math.max(deepest, depthOf(selection, fragments, visitedFragments));
        break;
      case Kind.FRAGMENT_SPREAD: {
        const name = selection.name.value;
        if (visitedFragments.has(name)) break;
        const fragment = fragments[name];
        if (!fragment) break;
        deepest = Math.max(
          deepest,
          depthOf(fragment, fragments, new Set(visitedFragments).add(name)),
        );
        break;
      }
    }
  }
  return deepest;
}
