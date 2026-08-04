import { gql, type TypedDocumentNode } from "@apollo/client";

import type { Category, Cuisine, FoodItem, MenuSection, Vendor } from "@/types";

/**
 * The catalog documents.
 *
 * Every selection set here is exactly `types/catalog.ts` and nothing more — same
 * fields, same names, same nullability — so the objects that come back *are* the
 * `Vendor`, `FoodItem` and `Category` the components already render. That is what lets
 * `services/catalog.ts` swap its body and keep its signature, and it is why the wire
 * types below are declared in terms of the frontend's own interfaces rather than being
 * restated: if they drifted, the compiler would say so at the assignment.
 *
 * Two shapes need a word:
 *
 * - **`hours`** comes back as an object of seven named weekdays, which is
 *   `WeeklyHours = Record<Weekday, DayHours>` on the nose. A list of
 *   `{ weekday, open, close }` would be the better schema and the wrong one — the
 *   components index this by weekday key.
 * - **`etaMinutes`** is `[Int!]!` on the wire and `[number, number]` in the frontend.
 *   The server always sends exactly two entries (they are two columns), and the tuple
 *   is asserted once, here, rather than in each of the four places that read it.
 *
 * Hand-written `TypedDocumentNode`s for the same reason as `auth.operations.ts`: Apollo
 * v4 infers the result type from the document, and an untyped `DocumentNode` types
 * `data` as `{}`. `@graphql-codegen/client-preset` over `backend/schema.gql` is what
 * replaces these when the count justifies the toolchain.
 */

const VENDOR_FIELDS = gql`
  fragment VendorFields on Vendor {
    id
    slug
    type
    ownerId
    name
    tagline
    description
    logo
    cover
    cuisineIds
    dietary
    priceLevel
    rating
    reviewCount
    location {
      lat
      lng
      address
      city
      countryCode
    }
    distanceKm
    etaMinutes
    deliveryFee
    minOrder
    freeDeliveryOver
    hours {
      mon {
        open
        close
      }
      tue {
        open
        close
      }
      wed {
        open
        close
      }
      thu {
        open
        close
      }
      fri {
        open
        close
      }
      sat {
        open
        close
      }
      sun {
        open
        close
      }
    }
    isOpen
    isFeatured
    isTrending
    promoLabel
    currency
    createdAt
    updatedAt
    deletedAt
  }
`;

const FOOD_FIELDS = gql`
  fragment FoodFields on FoodItem {
    id
    slug
    vendorId
    sectionId
    name
    description
    image
    price
    compareAtPrice
    dietary
    spicyLevel
    calories
    rating
    reviewCount
    isPopular
    isAvailable
    optionGroups {
      id
      name
      required
      min
      max
      options {
        id
        name
        priceDelta
      }
    }
    createdAt
    updatedAt
    deletedAt
  }
`;

/**
 * `etaMinutes` is the one field whose wire type is looser than the frontend's, so the
 * wire shape is stated once and narrowed at the boundary in `services/catalog.ts`.
 */
export type VendorWire = Omit<Vendor, "etaMinutes"> & { etaMinutes: number[] };

/** `services/catalog.ts::MenuSectionWithItems`, on the wire. */
export interface MenuSectionWithItemsWire extends MenuSection {
  items: FoodItem[];
}

export interface VendorPageWire {
  items: VendorWire[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface VendorQueryWire {
  type?: string;
  cuisineId?: string;
  search?: string;
  openNow?: boolean;
  sort?: string;
  origin?: { lat: number; lng: number };
}

export const CUISINES: TypedDocumentNode<{ cuisines: Cuisine[] }, Record<string, never>> = gql`
  query Cuisines {
    cuisines {
      id
      slug
      name
      emoji
      image
      createdAt
      updatedAt
      deletedAt
    }
  }
`;

export const CATEGORIES: TypedDocumentNode<{ categories: Category[] }, Record<string, never>> = gql`
  query Categories {
    categories {
      id
      slug
      name
      emoji
      image
      sort
      keywords
      createdAt
      updatedAt
      deletedAt
    }
  }
`;

export const VENDORS: TypedDocumentNode<
  { vendors: VendorPageWire },
  { query?: VendorQueryWire; page?: { page: number; pageSize: number } }
> = gql`
  ${VENDOR_FIELDS}
  query Vendors($query: VendorQueryInput, $page: PageInput) {
    vendors(query: $query, page: $page) {
      items {
        ...VendorFields
      }
      total
      page
      pageSize
      hasMore
    }
  }
`;

export const VENDOR: TypedDocumentNode<{ vendor: VendorWire | null }, { slug: string }> = gql`
  ${VENDOR_FIELDS}
  query VendorBySlug($slug: String!) {
    vendor(slug: $slug) {
      ...VendorFields
    }
  }
`;

export const TRENDING_VENDORS: TypedDocumentNode<
  { trendingVendors: VendorWire[] },
  { limit: number }
> = gql`
  ${VENDOR_FIELDS}
  query TrendingVendors($limit: Int) {
    trendingVendors(limit: $limit) {
      ...VendorFields
    }
  }
`;

export const FEATURED_VENDORS: TypedDocumentNode<
  { featuredVendors: VendorWire[] },
  { limit: number }
> = gql`
  ${VENDOR_FIELDS}
  query FeaturedVendors($limit: Int) {
    featuredVendors(limit: $limit) {
      ...VendorFields
    }
  }
`;

export const VENDOR_MENU: TypedDocumentNode<
  { vendorMenu: MenuSectionWithItemsWire[] },
  { vendorId: string }
> = gql`
  ${FOOD_FIELDS}
  query VendorMenu($vendorId: ID!) {
    vendorMenu(vendorId: $vendorId) {
      id
      vendorId
      name
      sort
      createdAt
      updatedAt
      deletedAt
      items {
        ...FoodFields
      }
    }
  }
`;

export const POPULAR_ITEMS: TypedDocumentNode<
  { popularItems: FoodItem[] },
  { vendorId: string; limit: number }
> = gql`
  ${FOOD_FIELDS}
  query PopularItems($vendorId: ID!, $limit: Int) {
    popularItems(vendorId: $vendorId, limit: $limit) {
      ...FoodFields
    }
  }
`;

export const FOOD: TypedDocumentNode<{ food: FoodItem | null }, { slug: string }> = gql`
  ${FOOD_FIELDS}
  query FoodBySlug($slug: String!) {
    food(slug: $slug) {
      ...FoodFields
    }
  }
`;
