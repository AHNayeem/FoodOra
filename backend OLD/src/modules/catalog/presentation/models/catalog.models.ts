import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

import { Paginated } from '../../../../common/pagination';
import { DateTimeScalar, MoneyScalar } from '../../../../common/scalars';
import { DietaryTagScalar, VendorTypeScalar } from '../../../../graphql';
import type { DietaryTag, VendorType } from '../../../../shared/enums';

/**
 * The wire types for the catalog.
 *
 * Unlike reference data, these **do** have an existing service seam to match, and the
 * match is the deliverable: every field name, nullability and type below is what
 * `frontend/types/catalog.ts` already declares, so `services/catalog.ts` can swap its
 * body and keep its signature. Where the two disagreed, the schema was changed rather
 * than the frontend — which is the brief's rule, and the reason `hours` is an object
 * of seven named days rather than the array a fresh design would pick.
 *
 * Money is the `Money` scalar (a plain number in `Vendor.currency`), timestamps are
 * `DateTime` (an ISO-8601 string, matching `ISODate`), and the two kebab-case
 * vocabularies are validated scalars rather than GraphQL enums (D5 §Enums).
 */

/** `BaseEntity` — every catalog type carries the same audit shape a row does. */
@ObjectType({ isAbstract: true })
abstract class CatalogEntityModel {
  @Field(() => ID) id!: string;
  @Field(() => DateTimeScalar) createdAt!: Date;
  @Field(() => DateTimeScalar) updatedAt!: Date;

  @Field(() => DateTimeScalar, { nullable: true, description: 'Soft-delete marker; null when active.' })
  deletedAt!: Date | null;
}

@ObjectType('Cuisine', { description: 'A cuisine a vendor can be filtered by. Replaces lib/mock/cuisines.ts.' })
export class CuisineModel extends CatalogEntityModel {
  @Field(() => String) slug!: string;
  @Field(() => String) name!: string;
  @Field(() => String, { description: 'Rendered verbatim, e.g. "🍝".' }) emoji!: string;
  @Field(() => String) image!: string;
}

@ObjectType('Category', {
  description: 'A browse tile on the home grid. Replaces lib/mock/categories.ts.',
})
export class CategoryModel extends CatalogEntityModel {
  @Field(() => String) slug!: string;
  @Field(() => String) name!: string;
  @Field(() => String) emoji!: string;
  @Field(() => String) image!: string;
  @Field(() => Int, { description: 'Ordering weight for the craving rail.' }) sort!: number;

  @Field(() => [String], {
    description:
      'Match terms the tile actually searches for, heaviest first. Normalised out of `category_keywords`, so a tile is a real query rather than a decorative link.',
  })
  keywords!: string[];
}

@ObjectType('DayHours', { description: 'One opening window. Both null means closed that day.' })
export class DayHoursModel {
  @Field(() => String, { nullable: true, description: 'Local "HH:mm".' }) open!: string | null;
  @Field(() => String, { nullable: true }) close!: string | null;
}

/**
 * `WeeklyHours = Record<Weekday, DayHours>` as seven named fields.
 *
 * A list of `{ weekday, open, close }` would be the better schema and is the wrong one
 * here: the frontend indexes this object by weekday key, so a list would mean a
 * component change, and V1 exists to avoid exactly that. The underlying table *is* a
 * list — several rows per weekday for a split service — and `toWeeklyHours` projects
 * this shape out of it.
 */
@ObjectType('WeeklyHours', { description: 'Opening grid, Monday first. Keyed by weekday, as the frontend indexes it.' })
export class WeeklyHoursModel {
  @Field(() => DayHoursModel) mon!: DayHoursModel;
  @Field(() => DayHoursModel) tue!: DayHoursModel;
  @Field(() => DayHoursModel) wed!: DayHoursModel;
  @Field(() => DayHoursModel) thu!: DayHoursModel;
  @Field(() => DayHoursModel) fri!: DayHoursModel;
  @Field(() => DayHoursModel) sat!: DayHoursModel;
  @Field(() => DayHoursModel) sun!: DayHoursModel;
}

@ObjectType('GeoPoint', { description: 'A point plus the human-readable address at it.' })
export class GeoPointModel {
  @Field(() => Float) lat!: number;
  @Field(() => Float) lng!: number;
  @Field(() => String) address!: string;
  @Field(() => String) city!: string;
  @Field(() => String, { description: 'ISO 3166-1 alpha-2.' }) countryCode!: string;
}

@ObjectType('Vendor', {
  description:
    'A storefront: the `vendors` row joined to its primary `vendor_branches` row, flattened into the shape frontend/types/catalog.ts already renders.',
})
export class VendorModel extends CatalogEntityModel {
  @Field(() => String) slug!: string;
  @Field(() => VendorTypeScalar) type!: VendorType;

  @Field(() => ID, { nullable: true, description: 'Owning account. Null for an unclaimed listing.' })
  ownerId!: string | null;

  @Field(() => String) name!: string;
  @Field(() => String) tagline!: string;
  @Field(() => String) description!: string;
  @Field(() => String) logo!: string;
  @Field(() => String) cover!: string;

  @Field(() => [ID], { description: 'Cuisine ids, in the order the merchant lists them.' })
  cuisineIds!: string[];

  @Field(() => [DietaryTagScalar]) dietary!: DietaryTag[];

  @Field(() => Int, { description: '1–4, rendered as $ – $$$$.' }) priceLevel!: number;
  @Field(() => Float, { description: '0–5, denormalised from the review aggregate.' }) rating!: number;
  @Field(() => Int) reviewCount!: number;

  @Field(() => GeoPointModel) location!: GeoPointModel;

  @Field(() => Float, {
    description:
      'Straight-line km from the query’s `origin`. Computed, never stored — it is a property of the pair (vendor, asker). 0 when no origin was supplied.',
  })
  distanceKm!: number;

  @Field(() => [Int], { description: 'Exactly two entries: [min, max] minutes.' })
  etaMinutes!: [number, number];

  @Field(() => MoneyScalar) deliveryFee!: number;
  @Field(() => MoneyScalar) minOrder!: number;
  @Field(() => MoneyScalar, { nullable: true }) freeDeliveryOver!: number | null;

  @Field(() => WeeklyHoursModel) hours!: WeeklyHoursModel;

  @Field(() => Boolean, {
    description:
      'Derived in the branch’s own timezone from its hours, closures, pause and kill switch — not a stored flag, because a stored flag has to be written by something in every timezone the platform serves.',
  })
  isOpen!: boolean;

  @Field(() => Boolean) isFeatured!: boolean;
  @Field(() => Boolean) isTrending!: boolean;

  @Field(() => String, { nullable: true, description: 'Editorial promo headline, e.g. "20% off over ৳800".' })
  promoLabel!: string | null;

  @Field(() => String, { description: 'ISO 4217. Every Money field on this type is in it.' })
  currency!: string;
}

@ObjectType('FoodOption', { description: 'One choice inside a group — a variant, or an add-on.' })
export class FoodOptionModel {
  @Field(() => ID) id!: string;
  @Field(() => String) name!: string;

  @Field(() => MoneyScalar, { description: 'Added to the base price; may be negative.' })
  priceDelta!: number;
}

@ObjectType('FoodOptionGroup', {
  description: 'A choice set. `min: 1, max: 1` is a radio group (Size); `min: 0` is add-ons.',
})
export class FoodOptionGroupModel {
  @Field(() => ID) id!: string;
  @Field(() => String) name!: string;
  @Field(() => Boolean) required!: boolean;
  @Field(() => Int) min!: number;
  @Field(() => Int) max!: number;
  @Field(() => [FoodOptionModel]) options!: FoodOptionModel[];
}

@ObjectType('FoodItem', { description: 'A dish. Replaces lib/mock/foods.ts.' })
export class FoodItemModel extends CatalogEntityModel {
  @Field(() => String) slug!: string;
  @Field(() => ID) vendorId!: string;
  @Field(() => ID) sectionId!: string;
  @Field(() => String) name!: string;
  @Field(() => String) description!: string;
  @Field(() => String) image!: string;
  @Field(() => MoneyScalar) price!: number;

  @Field(() => MoneyScalar, { nullable: true, description: 'Pre-discount price, for the strike-through.' })
  compareAtPrice!: number | null;

  @Field(() => [DietaryTagScalar]) dietary!: DietaryTag[];
  @Field(() => Int, { description: '0–3.' }) spicyLevel!: number;
  @Field(() => Int, { nullable: true }) calories!: number | null;
  @Field(() => Float) rating!: number;
  @Field(() => Int) reviewCount!: number;
  @Field(() => Boolean) isPopular!: boolean;

  @Field(() => Boolean, { description: 'The merchant’s switch. Stock is ANDed in by the inventory unit.' })
  isAvailable!: boolean;

  @Field(() => [FoodOptionGroupModel]) optionGroups!: FoodOptionGroupModel[];
}

@ObjectType('MenuSection', { description: 'An ordered grouping within a vendor’s menu.' })
export class MenuSectionModel extends CatalogEntityModel {
  @Field(() => ID) vendorId!: string;
  @Field(() => String) name!: string;
  @Field(() => Int) sort!: number;
}

@ObjectType('MenuSectionWithItems', {
  description: 'A section with its available dishes attached — one query for a whole menu.',
})
export class MenuSectionWithItemsModel extends MenuSectionModel {
  @Field(() => [FoodItemModel]) items!: FoodItemModel[];
}

/** `{ items, total, page, pageSize, hasMore }` — `frontend/services/http.ts::Paginated`. */
export const VendorPage = Paginated(VendorModel, 'VendorPage');
