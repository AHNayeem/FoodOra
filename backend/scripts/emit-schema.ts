/**
 * Emits `schema.gql` from the code-first decorators, without listening on a
 * port and without needing Postgres or Redis to be up.
 *
 *   bun run schema:emit    # write it
 *   bun run schema:check   # fail if the committed file is stale
 *
 * The committed SDL is the artifact CI diffs to catch a breaking change before
 * the frontend meets it (D10 §CI/CD). A generated file that is only produced at
 * runtime cannot be reviewed in a pull request, which is the whole point of
 * committing it.
 *
 * ## Two things this script gets right that the first version did not
 *
 * **The schema is always generated to a scratch file**, never straight onto the
 * committed one, and the comparison is between that scratch file and what is on disk.
 * The previous version let `autoSchemaFile` overwrite `schema.gql` in place and then
 * compared "before" with "after" — which cannot distinguish *generated and identical*
 * from *never generated at all*. It could not, and did not: see below.
 *
 * **The environment is set before `AppModule` is imported.** `@nestjs/config`'s
 * `forRoot()` reads `.env`, validates it and caches the result *while the module graph
 * is being imported* — the call sits in a `@Module({ imports: [...] })` decorator
 * argument, which JavaScript evaluates at import time. So `process.env.X = …` written
 * below an `import { AppModule }` line is already too late, silently. That is why the
 * import is dynamic and happens inside `main()`.
 *
 * Those two bugs compounded into a check that had never once done its job: nothing was
 * ever generated, so `before === after` always held, so `schema:check` printed
 * "✓ schema.gql is up to date" no matter what the code said. It was found in V1 Unit 3
 * by deliberately deleting `schema.gql` and watching the script report success while
 * producing nothing.
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMA_FILE = process.env.GRAPHQL_SCHEMA_FILE ?? 'schema.gql';
const SCHEMA_PATH = join(process.cwd(), SCHEMA_FILE);

/**
 * Relative, because `graphql.module.ts` resolves the configured name against
 * `process.cwd()`. Deleted in a `finally`, and gitignored in case a crash beats it.
 */
const SCRATCH_FILE = '.schema.generated.gql';
const SCRATCH_PATH = join(process.cwd(), SCRATCH_FILE);

async function generate(): Promise<string> {
  // Both must be set before the import below, not after it. See the header.
  process.env.GRAPHQL_SCHEMA_EMIT = 'true';
  process.env.GRAPHQL_SCHEMA_FILE = SCRATCH_FILE;

  const { NestFactory } = await import('@nestjs/core');
  const { FastifyAdapter } = await import('@nestjs/platform-fastify');
  const { AppModule } = await import('../src/app.module');

  rmSync(SCRATCH_PATH, { force: true });

  // `init()` runs the GraphQL module's schema build — which is where
  // `autoSchemaFile` writes — but never binds a socket.
  const app = await NestFactory.create(AppModule, new FastifyAdapter(), {
    logger: ['error', 'warn'],
  });
  await app.init();
  await app.close();

  if (!existsSync(SCRATCH_PATH)) {
    throw new Error(
      `The GraphQL module did not write ${SCRATCH_FILE}. ` +
        'Check that GRAPHQL_SCHEMA_EMIT reaches `graphqlConfig` — it must be set before ' +
        '`AppModule` is imported, because @nestjs/config caches the environment at import time.',
    );
  }
  return readFileSync(SCRATCH_PATH, 'utf8');
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');

  let generated: string;
  try {
    generated = await generate();
  } finally {
    rmSync(SCRATCH_PATH, { force: true });
  }

  const committed = existsSync(SCHEMA_PATH) ? readFileSync(SCHEMA_PATH, 'utf8') : null;
  const lines = generated.split('\n').length - 1;

  if (check) {
    if (committed === null) {
      console.error(`✖ ${SCHEMA_FILE} is missing. Run \`bun run schema:emit\` and commit it.`);
      process.exit(1);
    }
    if (committed !== generated) {
      console.error(
        `✖ ${SCHEMA_FILE} is out of date. Run \`bun run schema:emit\` and commit the result.`,
      );
      process.exit(1);
    }
    console.log(`✓ ${SCHEMA_FILE} is up to date (${lines} lines).`);
    return;
  }

  if (committed === generated) {
    console.log(`✓ ${SCHEMA_FILE} already matches the code (${lines} lines).`);
    return;
  }

  writeFileSync(SCHEMA_PATH, generated, 'utf8');
  console.log(
    committed === null
      ? `✓ Created ${SCHEMA_FILE} (${lines} lines).`
      : `✓ Updated ${SCHEMA_FILE} (${lines} lines).`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? `✖ ${error.message}` : error);
  process.exit(1);
});
