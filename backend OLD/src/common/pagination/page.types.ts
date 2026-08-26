import { Field, Int, InterfaceType, ObjectType } from '@nestjs/graphql';
import type { Type } from '@nestjs/common';

/**
 * Both list shapes in one place, because the frontend already uses both and
 * neither is going away (D5 §Pagination).
 */
@InterfaceType({ description: 'Offset-paginated list metadata.' })
export abstract class Page {
  @Field(() => Int) total!: number;
  @Field(() => Int) page!: number;
  @Field(() => Int) pageSize!: number;
  @Field() hasMore!: boolean;
}

export interface IPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * `Paginated(Vendor)` → a concrete `VendorPage` implementing `Page`.
 *
 * Code-first generics need a class per instantiation; this factory mints them
 * so thirty modules do not each hand-write the same five fields.
 *
 * `name` exists because the default is the **class** name, not the GraphQL one:
 * a model declared `@ObjectType('Vendor') class VendorModel` would otherwise
 * publish `VendorModelPage`, leaking a file-naming convention into the contract
 * the frontend queries.
 */
export function Paginated<T>(classRef: Type<T>, name?: string): Type<IPage<T>> {
  @ObjectType(name ?? `${classRef.name}Page`, { implements: () => [Page] })
  class PageClass implements IPage<T> {
    @Field(() => [classRef])
    items!: T[];

    @Field(() => Int, { description: 'Total matching rows. Estimated above 50k (D5).' })
    total!: number;

    @Field(() => Int) page!: number;
    @Field(() => Int) pageSize!: number;
    @Field() hasMore!: boolean;
  }

  return PageClass;
}

@ObjectType()
export class PageInfo {
  @Field() hasNextPage!: boolean;
  @Field() hasPreviousPage!: boolean;
  @Field(() => String, { nullable: true }) startCursor?: string | null;
  @Field(() => String, { nullable: true }) endCursor?: string | null;
}

export interface IEdge<T> {
  cursor: string;
  node: T;
}

export interface IConnection<T> {
  edges: IEdge<T>[];
  pageInfo: PageInfo;
  totalCount: number;
}

/** Relay-style connection for the keyset feeds. */
export function Connection<T>(classRef: Type<T>): Type<IConnection<T>> {
  @ObjectType(`${classRef.name}Edge`)
  class EdgeClass implements IEdge<T> {
    @Field(() => String) cursor!: string;
    @Field(() => classRef) node!: T;
  }

  @ObjectType(`${classRef.name}Connection`)
  class ConnectionClass implements IConnection<T> {
    @Field(() => [EdgeClass]) edges!: IEdge<T>[];
    @Field(() => PageInfo) pageInfo!: PageInfo;
    @Field(() => Int) totalCount!: number;
  }

  return ConnectionClass;
}
