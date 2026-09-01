/**
 * routes.js — the twenty-eight endpoints, and what each one requires.
 *
 * Mounted by `routes/v1/index.js` at `${API_PREFIX}/menu`, so every path below
 * reads `/api/v1/menu/…` from outside.
 *
 * | Method | Path | Auth | Authorization |
 * | --- | --- | --- | --- |
 * | GET | `/vendors/:vendorId` | — | — |
 * | GET | `/vendors/:vendorId/items/:itemId` | — | — |
 * | POST | `/vendors/:vendorId/items/:itemId/selection` | — | — |
 * | GET | `/vendors/:vendorId/board` | required | membership |
 * | GET | `/vendors/:vendorId/menus` | required | membership |
 * | POST/PATCH/DELETE | menus, sections, items, groups, options | required | membership + `owner`/`manager` |
 * | PUT | `/vendors/:vendorId/items/:itemId/availability` | required | membership + `owner`/`manager`/`kitchen`/`cashier` |
 * | GET | `/vendors/:vendorId/inventory`, `…/items/:itemId/inventory`, `…/movements` | required | membership |
 * | PUT | `…/items/:itemId/inventory` | required | membership + `owner`/`manager` |
 * | POST | `…/items/:itemId/inventory/adjust` | required | membership + `owner`/`manager`/`kitchen`/`cashier` |
 *
 * ## Every path carries `:vendorId`, including the ones that would not need it
 *
 * `PATCH /vendors/:vendorId/sections/:sectionId` is longer than
 * `PATCH /sections/:sectionId` and it is the shape this module wants, for a
 * reason that is about authorization rather than about REST purity: module 3's
 * guard is declarative and reads the vendor out of the path
 * (`requireVendorAccess("vendorId")`). With the vendor in the path, a caller who
 * is not a member of it is refused **before any row is read**, by the same guard
 * on every route, with no chance of a route forgetting to check.
 *
 * The alternative — resolve the section, then check its vendor — puts the
 * authorization decision inside twenty-two handlers and makes "did this one
 * remember?" a question somebody has to keep answering. It also leaks: the read
 * happens before the refusal.
 *
 * The pair still has to agree, and `service.js` checks that it does: a section id
 * belonging to another vendor is a **404**, not a 403, so a merchant cannot
 * discover which ids exist at a competitor by trying them.
 *
 * ## Reads are public; the board is not
 *
 * `GET /vendors/:vendorId` is the menu a customer sees, and it needs no session
 * for the reason `config/backend.ts` gives about the catalog: a menu that only
 * worked once somebody had signed in would be the wrong shape. It is guarded
 * instead by *what it returns* — the derived read model, filtered by the response
 * schema, with no stock counts, no `sku`, no switched-off sections.
 *
 * `/board` is the same rows unfiltered, and that is why it needs membership.
 *
 * ## `/board` and `/menus` are static segments after a parameter
 *
 * Fastify prefers a static segment over a parametric sibling, deterministically,
 * so `/vendors/ven_…/board` reaches the board and never the item route. Nothing
 * here shadows anything: `board`, `menus`, `inventory`, `sections`, `items`,
 * `option-groups` and `options` are all fixed words in positions where the
 * alternative is an id, and an id is validated against `id#` before a handler runs.
 */
import { ROUTE_SCHEMAS } from "./schemas.js";
import { MANAGE_ROLES, SERVICE_ROLES } from "./service.js";

export default async function menuRoutes(fastify, { controller }) {
  /**
   * Membership, at three widths.
   *
   * `read` is any member — the owner, an active staff row of any role, or a
   * vendor-scoped assignment. `manage` and `service` add a staff-role narrowing;
   * `policy.js` treats the owner as satisfying any of them, on the same grounds
   * `lib/staff.ts` gives the owner the whole grant table.
   */
  const read = fastify.requireVendorAccess("vendorId");
  const manage = fastify.requireVendorAccess("vendorId", { staffRole: [...MANAGE_ROLES] });
  const service = fastify.requireVendorAccess("vendorId", { staffRole: [...SERVICE_ROLES] });

  // -- Public reads ---------------------------------------------------------

  fastify.get("/vendors/:vendorId", { schema: ROUTE_SCHEMAS.vendorMenu }, controller.vendorMenu);
  fastify.get("/vendors/:vendorId/items/:itemId", { schema: ROUTE_SCHEMAS.publicItem }, controller.publicItem);
  fastify.post(
    "/vendors/:vendorId/items/:itemId/selection",
    { schema: ROUTE_SCHEMAS.validateSelection },
    controller.validateSelection,
  );

  // -- The merchant's board -------------------------------------------------

  fastify.get("/vendors/:vendorId/board", { schema: ROUTE_SCHEMAS.board, preHandler: read }, controller.board);
  fastify.get(
    "/vendors/:vendorId/menus",
    { schema: ROUTE_SCHEMAS.listMenus, preHandler: read },
    controller.listMenus,
  );

  // -- Menus ----------------------------------------------------------------

  fastify.post(
    "/vendors/:vendorId/menus",
    { schema: ROUTE_SCHEMAS.createMenu, preHandler: manage },
    controller.createMenu,
  );
  fastify.patch(
    "/vendors/:vendorId/menus/:menuId",
    { schema: ROUTE_SCHEMAS.updateMenu, preHandler: manage },
    controller.updateMenu,
  );
  fastify.delete(
    "/vendors/:vendorId/menus/:menuId",
    { schema: ROUTE_SCHEMAS.deleteMenu, preHandler: manage },
    controller.deleteMenu,
  );

  // -- Sections -------------------------------------------------------------

  fastify.post(
    "/vendors/:vendorId/menus/:menuId/sections",
    { schema: ROUTE_SCHEMAS.createSection, preHandler: manage },
    controller.createSection,
  );
  fastify.post(
    "/vendors/:vendorId/menus/:menuId/sections/order",
    { schema: ROUTE_SCHEMAS.reorderSections, preHandler: manage },
    controller.reorderSections,
  );
  fastify.patch(
    "/vendors/:vendorId/sections/:sectionId",
    { schema: ROUTE_SCHEMAS.updateSection, preHandler: manage },
    controller.updateSection,
  );
  fastify.delete(
    "/vendors/:vendorId/sections/:sectionId",
    { schema: ROUTE_SCHEMAS.deleteSection, preHandler: manage },
    controller.deleteSection,
  );

  // -- Items ----------------------------------------------------------------

  fastify.post(
    "/vendors/:vendorId/sections/:sectionId/items",
    { schema: ROUTE_SCHEMAS.createItem, preHandler: manage },
    controller.createItem,
  );
  fastify.post(
    "/vendors/:vendorId/sections/:sectionId/items/order",
    { schema: ROUTE_SCHEMAS.reorderItems, preHandler: manage },
    controller.reorderItems,
  );
  fastify.patch(
    "/vendors/:vendorId/items/:itemId",
    { schema: ROUTE_SCHEMAS.updateItem, preHandler: manage },
    controller.updateItem,
  );
  fastify.delete(
    "/vendors/:vendorId/items/:itemId",
    { schema: ROUTE_SCHEMAS.deleteItem, preHandler: manage },
    controller.deleteItem,
  );

  /**
   * The 86 switch, on `service` rather than `manage`.
   *
   * The one route where the two widths differ, and the difference is the point:
   * the pass runs out of sea bass and takes it off; repricing it is the manager's.
   * `lib/staff.ts` grants `kitchen.operate` and `pos.operate` to exactly the roles
   * allowed here and `menu.manage` to exactly the roles allowed above.
   */
  fastify.put(
    "/vendors/:vendorId/items/:itemId/availability",
    { schema: ROUTE_SCHEMAS.setAvailability, preHandler: service },
    controller.setAvailability,
  );

  // -- Modifier groups and options ------------------------------------------

  fastify.post(
    "/vendors/:vendorId/items/:itemId/option-groups",
    { schema: ROUTE_SCHEMAS.createGroup, preHandler: manage },
    controller.createGroup,
  );
  fastify.patch(
    "/vendors/:vendorId/option-groups/:groupId",
    { schema: ROUTE_SCHEMAS.updateGroup, preHandler: manage },
    controller.updateGroup,
  );
  fastify.delete(
    "/vendors/:vendorId/option-groups/:groupId",
    { schema: ROUTE_SCHEMAS.deleteGroup, preHandler: manage },
    controller.deleteGroup,
  );
  fastify.post(
    "/vendors/:vendorId/option-groups/:groupId/options",
    { schema: ROUTE_SCHEMAS.createOption, preHandler: manage },
    controller.createOption,
  );
  fastify.patch(
    "/vendors/:vendorId/options/:optionId",
    { schema: ROUTE_SCHEMAS.updateOption, preHandler: manage },
    controller.updateOption,
  );
  fastify.delete(
    "/vendors/:vendorId/options/:optionId",
    { schema: ROUTE_SCHEMAS.deleteOption, preHandler: manage },
    controller.deleteOption,
  );

  // -- Inventory ------------------------------------------------------------

  fastify.get(
    "/vendors/:vendorId/inventory",
    { schema: ROUTE_SCHEMAS.listInventory, preHandler: read },
    controller.listInventory,
  );
  fastify.get(
    "/vendors/:vendorId/items/:itemId/inventory",
    { schema: ROUTE_SCHEMAS.itemStock, preHandler: read },
    controller.itemStock,
  );
  fastify.get(
    "/vendors/:vendorId/items/:itemId/inventory/movements",
    { schema: ROUTE_SCHEMAS.movements, preHandler: read },
    controller.movements,
  );
  fastify.put(
    "/vendors/:vendorId/items/:itemId/inventory",
    { schema: ROUTE_SCHEMAS.setItemStock, preHandler: manage },
    controller.setItemStock,
  );
  /** Counting what is left is the counter's job as much as the manager's. */
  fastify.post(
    "/vendors/:vendorId/items/:itemId/inventory/adjust",
    { schema: ROUTE_SCHEMAS.adjustItemStock, preHandler: service },
    controller.adjustItemStock,
  );
}
