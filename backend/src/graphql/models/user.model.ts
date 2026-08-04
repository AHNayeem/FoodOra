import { Field, ObjectType } from '@nestjs/graphql';

import { DateTimeScalar } from '../../common/scalars';
import type { UserRole, UserStatus } from '../../shared/enums';
import { UserRoleScalar, UserStatusScalar } from '../scalars.registry';

/**
 * `frontend/types/user.ts::User`, field for field.
 *
 * Which is the constraint the whole phase is built around: the frontend has read
 * this shape since Phase C, so the GraphQL type has to *be* it rather than something
 * a mapping layer converts into it. `role` is a single kebab-case string even though
 * the real model is a many-to-many, and `permissions` is a flat resolved array even
 * though it is computed from three tables — both because that is what the client
 * already consumes (D6 §RBAC).
 *
 * `status` is the one addition, and it is additive: an unknown field costs a Phase C
 * client nothing.
 *
 * **Why it lives here rather than in a module.** E2 put it in
 * `modules/auth/presentation/`, which was right while `me` was the only thing that
 * returned a user. E3 makes that untenable: the admin directory returns users too,
 * and a module may not import another module's `presentation/` — so the choice was a
 * second `@ObjectType('User')` (a schema-assembly collision) or one type in shared
 * surface. A GraphQL object type referenced by several modules *is* shared surface,
 * the same way `MutationPayload` and `Page` are, and later phases only make that
 * truer: `Order.customer`, `Review.author`, `VendorStaff.user` all resolve to this.
 */
@ObjectType('User', { description: 'An account, exactly as frontend/types/user.ts describes it.' })
export class User {
  @Field(() => String) id!: string;
  @Field(() => String) name!: string;
  @Field(() => String) email!: string;
  @Field(() => String, { nullable: true }) phone!: string | null;
  @Field(() => String) avatar!: string;

  @Field(() => UserRoleScalar, { description: 'The primary role. Backs `User.role`.' })
  role!: UserRole;

  @Field(() => [String], {
    description:
      'Resolved permission slugs — role grants ∪ direct grants − direct denials. `["*"]` for a super-admin.',
  })
  permissions!: string[];

  @Field(() => UserStatusScalar) status!: UserStatus;
  @Field(() => String) countryCode!: string;
  @Field(() => String) currency!: string;
  @Field(() => String) locale!: string;

  @Field(() => Boolean, { description: 'True once either the email or the phone is verified.' })
  isVerified!: boolean;

  @Field(() => DateTimeScalar) createdAt!: Date;
  @Field(() => DateTimeScalar) updatedAt!: Date;
  @Field(() => DateTimeScalar, { nullable: true }) deletedAt!: Date | null;
}
