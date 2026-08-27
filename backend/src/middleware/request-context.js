/**
 * request-context.js — the id that ties a log line to a response.
 *
 * Every request gets one, every log line carries it, every error body returns
 * it, and it goes out on `x-request-id`. That is the whole feature, and it is
 * worth having on day one rather than the day after the first production
 * incident: "it failed at 14:32" is not something anyone can grep for.
 *
 * An inbound `x-request-id` is honoured so a trace started at the frontend keeps
 * one id end to end — but it is length-capped and character-restricted first.
 * The value is echoed into a header and into logs; accepting an arbitrary string
 * is how a log file gets forged newlines in it.
 */
import { randomUUID } from "node:crypto";

const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function genReqId(request) {
  const inbound = request.headers["x-request-id"];
  return typeof inbound === "string" && SAFE_ID.test(inbound) ? inbound : `req_${randomUUID()}`;
}

export async function attachRequestId(request, reply, payload) {
  reply.header("x-request-id", request.id);
  return payload;
}

/**
 * What is logged about a request, and what is not.
 *
 * `authorization` and `cookie` are redacted rather than omitted, so it is still
 * visible *that* a call was authenticated. The body is never logged: it is where
 * passwords, OTPs and card references are, and a log that contains them is a
 * credential store nobody meant to build.
 */
export const loggerSerializers = {
  req(request) {
    return {
      method: request.method,
      url: request.url,
      route: request.routeOptions?.url,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
      authenticated: Boolean(request.headers.authorization),
    };
  },
  res(reply) {
    return { statusCode: reply.statusCode };
  },
};

export const loggerRedactions = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
];
