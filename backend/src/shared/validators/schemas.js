/**
 * schemas.js — the shared JSON Schemas every route can `$ref`.
 *
 * Validation is Fastify's own: JSON Schema compiled by Ajv, declared per route
 * under `params` / `querystring` / `headers` / `body`, and a `response` schema
 * that both documents and serialises. No validation library is added on top, and
 * that is a decision rather than an omission — Fastify compiles a schema to a
 * specialised function once at boot, so validation costs nothing per request,
 * and the same declaration is what an OpenAPI document is generated from later.
 * A second validator would mean the route's real contract lived somewhere the
 * framework could not see.
 *
 * The shared pieces live here so that `error` means one thing across the whole
 * API. Registered once in `app.js` via `fastify.addSchema`, referenced as
 * `{ $ref: "error#" }`.
 */
import { paginationProperties } from "../utils/pagination.js";

/** `usr_01J8…` — the id format `main.prisma` §1 mandates. */
export const idSchema = {
  $id: "id",
  type: "string",
  pattern: "^[a-z]{2,6}_[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$",
  minLength: 5,
  maxLength: 40,
};

/**
 * The exception body. Every non-2xx response in the API serialises through this,
 * which is what makes "the API always fails the same way" checkable rather than
 * aspirational.
 */
export const errorSchema = {
  $id: "error",
  type: "object",
  required: ["success", "error"],
  additionalProperties: false,
  properties: {
    success: { type: "boolean", const: false },
    error: {
      type: "object",
      required: ["code", "key", "message"],
      properties: {
        code: { type: "string" },
        key: { type: "string" },
        message: { type: "string" },
        details: {},
        requestId: { type: "string" },
      },
    },
  },
};

/** The query half of any list route: `?page=2&pageSize=50`. */
export const paginationQuerySchema = {
  $id: "paginationQuery",
  type: "object",
  additionalProperties: false,
  properties: { ...paginationProperties },
};

export const SHARED_SCHEMAS = [idSchema, errorSchema, paginationQuerySchema];

/**
 * Wrap a payload schema in the success envelope.
 *
 * Written as a function because the envelope is fixed and the payload is not:
 * `response: { 200: success({ type: "object", properties: { … } }) }` keeps the
 * two facts — "it succeeded" and "here is what came back" — from being restated
 * in every route.
 */
export const success = (data) => ({
  type: "object",
  required: ["success", "data"],
  properties: { success: { type: "boolean", const: true }, data },
});

/**
 * The four responses almost every route can produce, ready to spread into
 * `response`. A route adds the ones specific to it.
 */
export const commonErrorResponses = Object.freeze({
  400: { $ref: "error#" },
  401: { $ref: "error#" },
  403: { $ref: "error#" },
  404: { $ref: "error#" },
  500: { $ref: "error#" },
});
