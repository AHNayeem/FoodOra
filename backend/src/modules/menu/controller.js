/**
 * controller.js — HTTP, and the caller's membership read once.
 *
 * The same division modules 2 and 4 keep: read the request into plain values,
 * call the service, wrap the answer in the envelope. No handler here decides who
 * may edit a menu — the route's guard decides whether they may touch the vendor
 * at all, and `service.js` decides whether the row they also named belongs to it.
 *
 * ## Why `access` is resolved here
 *
 * Module 3's `requireAuthorization` returns a verdict internally and keeps only
 * the pass/fail; the `access` object behind it — `{ via, staffRole, branchId }` —
 * is what this module needs for two rules the guard cannot express:
 *
 *  - **branch scope.** `VendorStaff.branchId` narrows a member to one location, and
 *    an inventory row carries the branch it belongs to. Whether *this* shelf is
 *    *that* member's shelf is a per-row question;
 *  - **vendor-wide authoring.** A member scoped to one branch may not rewrite a
 *    menu that every branch serves. `service.js::requireVendorWide` refuses it.
 *
 * So the controller asks `authz.vendorAccess` once per request and hands the
 * service three plain values. Asking again costs nothing when module 3's cache is
 * warm and one indexed read when it is not — and the alternative, passing the
 * request down, is what `modules/catalog/controller.js` argues against: a service
 * holding a request can reach for a JWT claim, and the claims are empty by design.
 */
import { ok, okPage, refuse } from "../../shared/errors/envelope.js";

/** `{ refusal }` → 200 refusal; anything else → 200 success. Module 2's shape. */
const envelope = (result) =>
  result?.refusal ? refuse(result.refusal, result.path) : ok(result?.payload ?? null);

export function createController({ app, service }) {
  /**
   * Who is asking, and from which branch.
   *
   * Only ever called on a guarded route, so `request.account` is set and
   * `vendorAccess` has already answered yes once. A caller that reached a public
   * route with no token gets the anonymous shape and every write path is closed to
   * them by the guard rather than by this.
   */
  async function accessFor(request) {
    const userId = request.account?.id ?? null;
    const vendorId = request.params?.vendorId ?? null;
    if (!userId || !vendorId) return { userId: null, via: null, staffRole: null, branchId: null };

    const verdict = await app.authz.vendorAccess(userId, vendorId);
    return { userId, via: verdict.via, staffRole: verdict.staffRole, branchId: verdict.branchId };
  }

  /** Every write handler is this: resolve membership, call the service, envelope it. */
  const write = (fn) => async (request) => envelope(await fn(request, { access: await accessFor(request) }));

  const { vendorId, itemId, menuId, sectionId, groupId, optionId } = {
    vendorId: (request) => request.params.vendorId,
    itemId: (request) => request.params.itemId,
    menuId: (request) => request.params.menuId,
    sectionId: (request) => request.params.sectionId,
    groupId: (request) => request.params.groupId,
    optionId: (request) => request.params.optionId,
  };

  return {
    // -- Reads --------------------------------------------------------------

    vendorMenu: async (request) =>
      ok(
        await service.vendorMenu(vendorId(request), {
          kind: request.query.kind,
          includeUnavailable: request.query.includeUnavailable,
        }),
      ),

    publicItem: async (request) => ok(await service.publicItem(vendorId(request), itemId(request))),

    validateSelection: async (request) =>
      ok(await service.validateSelection(vendorId(request), itemId(request), request.body?.options ?? [])),

    board: async (request) =>
      ok(await service.board(vendorId(request), { kind: request.query.kind, menuId: request.query.menuId })),

    listMenus: async (request) => ok(await service.listMenus(vendorId(request), { kind: request.query.kind })),

    // -- Menus --------------------------------------------------------------

    createMenu: write((request, context) => service.createMenu(vendorId(request), request.body, context)),
    updateMenu: write((request, context) =>
      service.updateMenu(vendorId(request), menuId(request), request.body, context),
    ),
    deleteMenu: write((request, context) => service.deleteMenu(vendorId(request), menuId(request), context)),

    // -- Sections -----------------------------------------------------------

    createSection: write((request, context) =>
      service.createSection(vendorId(request), menuId(request), request.body, context),
    ),
    updateSection: write((request, context) =>
      service.updateSection(vendorId(request), sectionId(request), request.body, context),
    ),
    deleteSection: write((request, context) =>
      service.deleteSection(vendorId(request), sectionId(request), context),
    ),
    reorderSections: write((request, context) =>
      service.reorderSections(vendorId(request), menuId(request), request.body.sectionIds, context),
    ),

    // -- Items --------------------------------------------------------------

    createItem: write((request, context) =>
      service.createItem(vendorId(request), sectionId(request), request.body, context),
    ),
    updateItem: write((request, context) =>
      service.updateItem(vendorId(request), itemId(request), request.body, context),
    ),
    deleteItem: write((request, context) => service.deleteItem(vendorId(request), itemId(request), context)),
    reorderItems: write((request, context) =>
      service.reorderItems(vendorId(request), sectionId(request), request.body.itemIds, context),
    ),
    setAvailability: write((request, context) =>
      service.setAvailability(vendorId(request), itemId(request), request.body.isAvailable, context),
    ),

    // -- Options ------------------------------------------------------------

    createGroup: write((request, context) =>
      service.createGroup(vendorId(request), itemId(request), request.body, context),
    ),
    updateGroup: write((request, context) =>
      service.updateGroup(vendorId(request), groupId(request), request.body, context),
    ),
    deleteGroup: write((request, context) => service.deleteGroup(vendorId(request), groupId(request), context)),
    createOption: write((request, context) =>
      service.createOption(vendorId(request), groupId(request), request.body, context),
    ),
    updateOption: write((request, context) =>
      service.updateOption(vendorId(request), optionId(request), request.body, context),
    ),
    deleteOption: write((request, context) => service.deleteOption(vendorId(request), optionId(request), context)),

    // -- Inventory ----------------------------------------------------------

    /** `Paginated<T>` — `okPage` derives `hasMore`, so the envelope matches `services/http.ts`. */
    listInventory: async (request) => {
      const page = await service.listInventory(vendorId(request), request.query, {
        access: await accessFor(request),
      });
      return okPage(page);
    },

    itemStock: async (request) =>
      ok(await service.itemStock(vendorId(request), itemId(request), { access: await accessFor(request) })),

    movements: async (request) =>
      ok(
        await service.movements(vendorId(request), itemId(request), {
          limit: request.query.limit,
          access: await accessFor(request),
        }),
      ),

    setItemStock: write((request, context) =>
      service.setItemStock(vendorId(request), itemId(request), request.body, context),
    ),

    adjustItemStock: write((request, context) =>
      service.adjustItemStock(vendorId(request), itemId(request), request.body, context),
    ),
  };
}

export default createController;
