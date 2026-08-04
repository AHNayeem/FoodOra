/**
 * Validate every GraphQL document in `lib/graphql/` against the API's committed SDL.
 *
 *     bun run verify:graphql
 *
 * The backend is code-first and emits `backend/schema.gql` on every build, and that
 * file is the contract. This script parses each document the client can send and
 * runs the real GraphQL validator over it, which catches the whole class of mistakes
 * that otherwise only surface at runtime against a working database: a renamed
 * field, a required argument that was added, a fragment on a type that no longer has
 * that field, an enum value the server stopped accepting.
 *
 * Needs no database, no running API and no network — which is the point. It is the
 * cheapest possible guard on the frontend/backend seam, and every cutover unit
 * should add its documents to `MODULES` below.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildSchema, print, validate, type DocumentNode, type GraphQLSchema } from 'graphql';

import * as authOperations from '../lib/graphql/auth.operations';
import * as cartOperations from '../lib/graphql/cart.operations';
import * as catalogOperations from '../lib/graphql/catalog.operations';
import * as orderOperations from '../lib/graphql/order.operations';

/** Each entry is a module whose exported `DocumentNode`s are all checked. */
const MODULES: Array<{ name: string; exports: Record<string, unknown> }> = [
  { name: 'auth.operations', exports: authOperations },
  { name: 'catalog.operations', exports: catalogOperations },
  { name: 'cart.operations', exports: cartOperations },
  { name: 'order.operations', exports: orderOperations },
];

/** Run from `frontend/` via the `verify:graphql` script, so the sibling is one level up. */
const SCHEMA_PATH = join(process.cwd(), '..', 'backend', 'schema.gql');

function isDocument(value: unknown): value is DocumentNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as DocumentNode).kind === 'Document' &&
    Array.isArray((value as DocumentNode).definitions)
  );
}

/**
 * A fragment alone is not a validatable document — `validate` reports it as unused.
 * Only operations are checked; the fragments they interpolate come along inside them.
 */
function hasOperation(document: DocumentNode): boolean {
  return document.definitions.some((d) => d.kind === 'OperationDefinition');
}

function main(): void {
  let schema: GraphQLSchema;
  try {
    schema = buildSchema(readFileSync(SCHEMA_PATH, 'utf8'));
  } catch (error) {
    console.error(`✗ could not read the API schema at ${SCHEMA_PATH}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    console.error('  Run `bun run schema:emit` in backend/ first.');
    process.exit(1);
  }

  let checked = 0;
  let failed = 0;

  for (const { name, exports } of MODULES) {
    console.log(`\n${name}`);
    for (const [exportName, value] of Object.entries(exports)) {
      if (!isDocument(value)) continue;
      if (!hasOperation(value)) {
        console.log(`  · ${exportName} (fragment only, checked via its operations)`);
        continue;
      }

      checked += 1;
      const errors = validate(schema, value);
      if (errors.length === 0) {
        console.log(`  ✓ ${exportName}`);
        continue;
      }

      failed += 1;
      console.log(`  ✗ ${exportName}`);
      for (const error of errors) console.log(`      ${error.message}`);
      console.log(
        print(value)
          .split('\n')
          .map((line) => `      | ${line}`)
          .join('\n'),
      );
    }
  }

  console.log(
    `\n${failed === 0 ? '✓' : '✗'} ${checked} operation${checked === 1 ? '' : 's'} validated, ${failed} failed.`,
  );
  if (failed > 0) process.exit(1);
}

main();
