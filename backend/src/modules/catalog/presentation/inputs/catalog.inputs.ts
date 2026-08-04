import { Field, Float, ID, InputType } from '@nestjs/graphql';
import { z } from 'zod';

import { VendorSortScalar, VendorTypeScalar } from '../../../../graphql';
import { VENDOR_SORTS, VENDOR_TYPES, type VendorSort, type VendorType } from '../../../../shared/enums';

/**
 * `frontend/services/catalog.ts::VendorQuery`, as a GraphQL input.
 *
 * Everything is optional, because the directory page's default state is "no filters"
 * and a required argument there would mean the page could not render before the user
 * touched anything.
 *
 * The Zod schema beside it is not belt-and-braces over the scalars — they already
 * refuse a value outside the vocabulary. What it adds is the bounds a scalar has no
 * opinion about: a 400-character `search` term is a table scan expressed as a string,
 * and a latitude of 900 is either a bug or someone probing.
 */

@InputType({ description: 'Where "how far away" is measured from — the asker’s position.' })
export class GeoOriginInput {
  @Field(() => Float) lat!: number;
  @Field(() => Float) lng!: number;
}

@InputType({ description: 'Filters and ordering for a vendor list. Every field is optional.' })
export class VendorQueryInput {
  @Field(() => VendorTypeScalar, { nullable: true }) type?: VendorType;

  @Field(() => ID, { nullable: true, description: 'A `Cuisine.id`, from the `cuisines` query.' })
  cuisineId?: string;

  @Field(() => String, { nullable: true, description: 'Case-insensitive substring of the name or tagline.' })
  search?: string;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'Keep only branches open at request time, in their own timezone. Evaluated in the application layer, not in SQL — see policies/listing.ts.',
  })
  openNow?: boolean;

  @Field(() => VendorSortScalar, { nullable: true, defaultValue: 'recommended' })
  sort?: VendorSort;

  @Field(() => GeoOriginInput, {
    nullable: true,
    description: 'Supply it and `Vendor.distanceKm` is real and `sort: "distance"` means something. Omit it and both are 0.',
  })
  origin?: GeoOriginInput;
}

/** A latitude/longitude that is actually on Earth. */
const geoOrigin = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const VendorQuerySchema = z.object({
  type: z.enum(VENDOR_TYPES).optional(),
  cuisineId: z.string().trim().min(1).max(40).optional(),
  // Trimmed but not lower-cased: the repository searches case-insensitively, and
  // folding case here would make the value in a log differ from what was typed.
  search: z.string().trim().max(120).optional(),
  openNow: z.boolean().optional(),
  sort: z.enum(VENDOR_SORTS).optional(),
  origin: geoOrigin.optional(),
});

export type VendorQueryArgs = z.infer<typeof VendorQuerySchema>;
