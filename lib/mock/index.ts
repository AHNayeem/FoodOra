/**
 * Mock data barrel. This is the *only* place seed data lives. Components never
 * import from here directly — they go through `services/*`, which wraps these
 * arrays in async, paginated functions. Swapping to a real backend means
 * rewriting `services/*`, not touching any component.
 */
export * from "./cuisines";
export * from "./categories";
export * from "./vendors";
