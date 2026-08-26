# =============================================================================
# FoodOra API — multi-stage image (D10 §Docker)
#
# BUILD FROM THE REPOSITORY ROOT, not from backend/:
#
#     docker build -f backend/Dockerfile -t foodora-api .
#
# The client is generated from `database/prisma/schema`, and Docker cannot copy
# from above its build context. D10's sketch had the Dockerfile reach out to
# `../database`, which no build context permits; the context is the repo root
# instead, and `.dockerignore` at the root keeps the layer small.
#
# Debian rather than Alpine, also deliberately. Prisma compiles its query engine
# per libc, and `binaryTargets = ["native"]` resolves at *generate* time — a
# musl engine baked on Alpine cannot load in the glibc distroless runtime. Both
# stages are bookworm, so "native" is `debian-openssl-3.0.x` in both.
# =============================================================================

# ---- dependencies -----------------------------------------------------------
FROM oven/bun:1 AS deps
WORKDIR /app

COPY backend/package.json backend/bun.lock ./
RUN bun install --frozen-lockfile

# The schema owns its own pinned Prisma CLI (multi-file schemas need >= 6.7, and
# a floating major picks up 7.x, which rejects this layout).
COPY database/package.json database/bun.lock /schema/
RUN cd /schema && bun install --frozen-lockfile

# ---- build ------------------------------------------------------------------
FROM deps AS build
WORKDIR /app

COPY database/prisma /schema/prisma
COPY backend/ ./

# `prisma generate` needs the env var to exist, not to resolve — nothing
# connects at build time.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DATABASE_DIRECT_URL=postgresql://build:build@localhost:5432/build
RUN cd /schema && bunx prisma generate

# `nest build` copies the generated client (and its engine) into dist via the
# assets rule in nest-cli.json.
RUN bun run build

# Emit the SDL into the image so the running container never writes to its own
# filesystem, and prune to production dependencies.
RUN bun run schema:emit || true
RUN bun install --frozen-lockfile --production

# ---- runtime ----------------------------------------------------------------
FROM gcr.io/distroless/nodejs22-debian12 AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/schema.gql ./schema.gql

# Distroless: no shell, no package manager, and not root. Nothing to escalate
# into, and nothing to `curl | sh` if something does get in.
USER nonroot

EXPOSE 4000

# No shell here either, so the check is a node one-liner. Kubernetes uses the
# httpGet probes on /health/live and /health/ready instead; this is for Compose.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Workers are this same image with a different entrypoint (`dist/worker.js`,
# E8), so the API and its workers can never disagree about the schema.
CMD ["dist/main.js"]


# ---- development ------------------------------------------------------------
# Used only by docker-compose.dev.yml, with the source bind-mounted over it.
FROM deps AS development
WORKDIR /app
COPY database/prisma /schema/prisma
COPY backend/ ./
ENV NODE_ENV=development
EXPOSE 4000 9229
CMD ["bun", "run", "start:dev"]
