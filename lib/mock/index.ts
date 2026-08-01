/**
 * Mock data barrel. This is the *only* place seed data lives. Components never
 * import from here directly — they go through `services/*`, which wraps these
 * arrays in async, paginated functions. Swapping to a real backend means
 * rewriting `services/*`, not touching any component.
 */
export * from "./cuisines";
export * from "./categories";
export * from "./vendors";
export * from "./menus";
export * from "./foods";
export * from "./users";
export * from "./settings";
export * from "./addresses";
export * from "./couriers";
export * from "./wallet";
export * from "./testimonials";
export * from "./posts";
export * from "./offers";
export * from "./coupons";
export * from "./pages";
export * from "./vendor-orders";
export * from "./demo-orders";
export * from "./catering";
export * from "./tables";
export * from "./qr-menus";
export * from "./meal-plans";
export * from "./reservations";
export * from "./delivery-zones";
export * from "./riders";
export * from "./delivery-jobs";
export * from "./reviews";
