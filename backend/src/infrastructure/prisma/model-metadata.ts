import { Prisma } from './generated';

/**
 * Which models carry which conventions, read from the DMMF at boot.
 *
 * The alternative is a hand-maintained list of 169 model names, which would be
 * wrong within a week. Deriving it from the schema means adding `deletedAt` to
 * a new model is all it takes for soft delete to start applying to it — the
 * convention documented in `main.prisma` becomes self-enforcing rather than
 * aspirational.
 */
function modelsWithField(field: string): ReadonlySet<string> {
  return new Set(
    Prisma.dmmf.datamodel.models
      .filter((model) => model.fields.some((f) => f.name === field))
      .map((model) => model.name),
  );
}

/** 58 of 169. Immutable financial records deliberately have none (main.prisma §3). */
export const SOFT_DELETE_MODELS = modelsWithField('deletedAt');

/** 64 of 169. Append-only tables have no `version` (main.prisma §4). */
export const VERSIONED_MODELS = modelsWithField('version');

export const HAS_CREATED_BY = modelsWithField('createdBy');
export const HAS_UPDATED_BY = modelsWithField('updatedBy');
export const HAS_DELETED_BY = modelsWithField('deletedBy');

/** `Vendor` → `vendor`, the key on the client. */
export function delegateKey(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}
