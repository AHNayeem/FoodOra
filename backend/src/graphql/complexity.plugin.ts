import type { ApolloServerPlugin, GraphQLRequestListener } from '@apollo/server';
import { Inject } from '@nestjs/common';
import { Plugin } from '@nestjs/apollo';
import { GraphQLError } from 'graphql';
import {
  fieldExtensionsEstimator,
  getComplexity,
  simpleEstimator,
} from 'graphql-query-complexity';

import { currentRequestContext } from '../common/context';
import { graphqlConfig, type GraphqlConfig } from '../config';

/**
 * Scores an operation before execution and refuses the expensive ones.
 *
 * Depth alone is not enough: `vendors(pageSize: 100) { menu { items { options
 * { … } } } }` is only four levels deep and still asks for tens of thousands of
 * rows. Cost estimation catches breadth, and the budget is lower for anonymous
 * callers (300 vs 1000) because an unauthenticated request is the one an
 * attacker can send a million of.
 *
 * A list field declares its own multiplier via `@Field({ extensions: {
 * complexity: … } })`; everything else costs 1.
 */
@Plugin()
export class ComplexityPlugin implements ApolloServerPlugin {
  constructor(@Inject(graphqlConfig.KEY) private readonly config: GraphqlConfig) {}

  async requestDidStart(): Promise<GraphQLRequestListener<Record<string, unknown>>> {
    const { maxComplexity, maxComplexityAnonymous } = this.config;

    return {
      didResolveOperation: async ({ request, document, schema }) => {
        const complexity = getComplexity({
          schema,
          operationName: request.operationName,
          query: document,
          variables: request.variables,
          estimators: [fieldExtensionsEstimator(), simpleEstimator({ defaultComplexity: 1 })],
        });

        const budget = currentRequestContext()?.actor ? maxComplexity : maxComplexityAnonymous;

        if (complexity > budget) {
          throw new GraphQLError(
            `Query is too expensive: cost ${complexity}, budget ${budget}. Request fewer fields or a smaller page.`,
            { extensions: { code: 'BAD_USER_INPUT', complexity, budget } },
          );
        }
      },
    };
  }
}
