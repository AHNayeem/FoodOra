// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * The Clean Architecture dependency rule (D1) is enforced here, mechanically.
 *
 *     presentation ──┐
 *                    ├──► application ──► domain
 *     infrastructure ┘
 *
 * A layer may only import from itself and the layers to its right. Cross-module
 * imports are allowed only against another module's `domain/` — its published
 * contract. A rule that lives in a memo is a rule that rots; these fail `bun run
 * lint`, and therefore CI.
 */

/** Frameworks a pure-domain file must never see. */
const FRAMEWORK_IMPORTS = [
  {
    regex: '^@nestjs/',
    message: 'domain/ is framework-free: no NestJS. Move this to application/ or infrastructure/.',
  },
  {
    regex: '^@prisma/|/prisma/|^ioredis$|^graphql|^@apollo/',
    message:
      'domain/ must not know about Prisma, Redis or GraphQL. Depend on a port in domain/ports/ and implement it in infrastructure/.',
  },
];

/** Layers that sit to the LEFT of the arrow and may not be depended upon. */
const OUTER_LAYERS = [
  {
    regex: '(^|/)infrastructure/',
    message:
      'Inner layers must not import infrastructure/. Inject a port token instead (see D1 §The dependency rule).',
  },
  {
    regex: '(^|/)presentation/',
    message: 'Nothing may import presentation/ — it is the outermost layer.',
  },
];

/** modules/<a> may only reach into modules/<b>/domain (the published contract). */
const CROSS_MODULE = {
  regex: '(^|/)modules/[^/]+/(application|infrastructure|presentation)/',
  message:
    "Cross-module import: a module may only import another module's domain/ (its published contract), or talk to it through shared/contracts and domain events.",
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'src/infrastructure/prisma/generated/**', 'eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Nest resolvers/handlers are routinely async without an await.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { arguments: false, attributes: false } },
      ],
      // Nothing reads process.env directly — config/ owns it (D1 §Config).
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Read configuration through ConfigService / the typed config namespaces in src/config. Only config/ and main.ts bootstrap may touch process.env.',
        },
      ],
    },
  },

  // --- layer boundaries -----------------------------------------------------
  {
    files: ['src/modules/*/domain/**/*.ts', 'src/shared/kernel/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [...FRAMEWORK_IMPORTS, ...OUTER_LAYERS, CROSS_MODULE] },
      ],
    },
  },
  {
    files: ['src/modules/*/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...OUTER_LAYERS, CROSS_MODULE] }],
    },
  },
  {
    files: ['src/modules/*/infrastructure/**/*.ts', 'src/modules/*/presentation/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [CROSS_MODULE] }],
    },
  },

  // --- the places that are allowed to be un-pure -----------------------------
  {
    files: ['src/config/**/*.ts', 'src/main.ts', 'scripts/**/*.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: { '@typescript-eslint/no-unsafe-member-access': 'off', 'no-console': 'off' },
  },
);
