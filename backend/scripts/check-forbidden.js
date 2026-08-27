#!/usr/bin/env node
/**
 * check-forbidden.js — proves the stack is the stack that was asked for.
 *
 * The phase brief bans TypeScript, NestJS, Redis, Docker and (unless the
 * frontend forces it) GraphQL, and asks for the backend to be *searched* rather
 * than asserted clean. This is that search, as a command, so the answer survives
 * the next person who adds a dependency without reading the brief.
 *
 * It looks at the source tree and the dependency manifest, not at
 * `node_modules`: a transitive dependency of Fastify that happens to mention
 * Redis in its README is not this backend using Redis, and flagging it would
 * make the check something people learn to ignore.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "coverage", "dist", "build"]);

function walk(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

const files = walk(root);
const rel = (file) => relative(root, file);
const sources = files.filter((file) => [".js", ".mjs", ".cjs"].includes(extname(file)));

const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });

const failures = [];
const record = (rule, detail) => failures.push(`${rule}: ${detail}`);

// -- TypeScript --------------------------------------------------------------
for (const file of files) {
  if ([".ts", ".tsx", ".mts", ".cts"].includes(extname(file)) && !file.endsWith(".d.ts")) {
    record("TypeScript", `${rel(file)} is a TypeScript file`);
  }
}
for (const config of ["tsconfig.json", "tsconfig.build.json"]) {
  if (files.some((file) => rel(file) === config)) record("TypeScript", `${config} exists`);
}
for (const dependency of dependencies) {
  if (dependency === "typescript" || dependency.startsWith("ts-") || dependency.startsWith("@types/")) {
    record("TypeScript", `dependency "${dependency}"`);
  }
}

// -- NestJS ------------------------------------------------------------------
for (const dependency of dependencies) {
  if (dependency.startsWith("@nestjs/") || dependency === "nest-cli") record("NestJS", `dependency "${dependency}"`);
}
for (const file of sources) {
  const text = readFileSync(file, "utf8");
  // A comment explaining why NestJS is gone is not a NestJS import.
  if (/from\s+["']@nestjs\//.test(text) || /require\(["']@nestjs\//.test(text)) {
    record("NestJS", `${rel(file)} imports @nestjs`);
  }
}

// -- Redis -------------------------------------------------------------------
for (const dependency of dependencies) {
  if (/^(ioredis|redis|@fastify\/redis|connect-redis|bullmq|bull)$/.test(dependency)) {
    record("Redis", `dependency "${dependency}"`);
  }
}
for (const file of sources) {
  if (/\bREDIS_URL\b|redis:\/\//.test(readFileSync(file, "utf8"))) record("Redis", `${rel(file)} references Redis`);
}
if (/\bREDIS_/.test(readFileSync(join(root, ".env.example"), "utf8"))) {
  record("Redis", ".env.example declares a Redis variable");
}

// -- Docker ------------------------------------------------------------------
for (const file of files) {
  const name = rel(file);
  if (/^(Dockerfile|\.dockerignore|docker-compose\.ya?ml)$/.test(name) || name.startsWith("docker/")) {
    record("Docker", `${name} exists`);
  }
}

// -- GraphQL -----------------------------------------------------------------
for (const dependency of dependencies) {
  if (/graphql|apollo|mercurius|type-graphql/.test(dependency)) record("GraphQL", `dependency "${dependency}"`);
}

// -- The stack that *should* be here ----------------------------------------
for (const required of ["fastify", "@foodora/database"]) {
  if (!dependencies.includes(required)) record("Stack", `"${required}" is missing`);
}
if (manifest.type !== "module") record("Stack", 'package.json "type" is not "module"');

if (failures.length > 0) {
  console.error(`✗ ${failures.length} forbidden-technology finding${failures.length > 1 ? "s" : ""}:\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `✓ ${sources.length} JavaScript files, ${dependencies.length} dependencies — ` +
    "no TypeScript, NestJS, Redis, Docker or GraphQL.",
);
