import { Field, InputType, Int } from '@nestjs/graphql';
import { z } from 'zod';

import { DateTimeScalar } from '../../../../common/scalars';
import { RbacError } from '../../domain';

/**
 * Slug and rank rules mirror `domain/policies/escalation.policy.ts`.
 *
 * `rank` is capped below 100 in Zod, and that cap is a second line of defence rather than
 * the rule: the real protection is `canAdministerRank`, which refuses any rank at or above
 * the actor's own. But 100 is `super-admin`, and a custom role created at 100 would be
 * indistinguishable from it by rank — so refusing it at the edge means the escalation policy
 * never has to reason about a tie with the top of the ladder.
 */
const roleSlug = z
  .string()
  .trim()
  .max(60)
  .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, RbacError.invalidSlug);

const rank = z.number().int().min(1).max(99);
const permissionSlugs = z.array(z.string().trim().min(3).max(80)).max(200);
const vendorId = z.string().trim().min(1).max(40).nullish();
const expiresAt = z.date().nullish();

@InputType({ description: 'Create a custom role from catalogue permissions.' })
export class CreateRoleInput {
  @Field(() => String, { description: 'Kebab-case, unique, and never a built-in’s slug.' })
  slug!: string;

  @Field(() => String) name!: string;
  @Field(() => String, { nullable: true, defaultValue: '' }) description?: string;

  @Field(() => Int, {
    description: 'Must be strictly below your own highest rank. 100 (super-admin) is refused.',
  })
  rank!: number;

  @Field(() => [String], { nullable: true, defaultValue: [] })
  permissions?: string[];
}

export const CreateRoleSchema = z.object({
  slug: roleSlug,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional(),
  rank,
  permissions: permissionSlugs.optional(),
});

@InputType({ description: 'Edit a custom role. Built-ins refuse this.' })
export class UpdateRoleInput {
  @Field(() => String) roleId!: string;
  @Field(() => String, { nullable: true }) name?: string;
  @Field(() => String, { nullable: true }) description?: string;
  @Field(() => Int, { nullable: true }) rank?: number;
}

export const UpdateRoleSchema = z.object({
  roleId: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(240).optional(),
  rank: rank.optional(),
});

@InputType({ description: 'Replace a role’s permission set. What the admin matrix submits.' })
export class SetRolePermissionsInput {
  @Field(() => String) roleId!: string;
  @Field(() => [String], { description: 'The complete set, not a delta.' })
  permissions!: string[];
}

export const SetRolePermissionsSchema = z.object({
  roleId: z.string().trim().min(1).max(40),
  permissions: permissionSlugs,
});

// `…InputType` because `AssignRoleInput` is already the service's input interface; the schema
// gets the name that belongs to it.
@InputType('AssignRoleInput', { description: 'Grant a role to an account.' })
export class AssignRoleInputType {
  @Field(() => String) userId!: string;
  @Field(() => String) roleSlug!: string;

  @Field(() => String, {
    nullable: true,
    description: 'Scope to one vendor — "manager of *this* branch". Null = platform-wide.',
  })
  vendorId?: string | null;

  @Field(() => DateTimeScalar, {
    nullable: true,
    description: 'Must be in the future. A lapsed grant is filtered at resolution, not swept.',
  })
  expiresAt?: Date | null;
}

export const AssignRoleSchema = z.object({
  userId: z.string().trim().min(1).max(40),
  roleSlug: roleSlug,
  vendorId,
  expiresAt,
});

@InputType({ description: 'Revoke a role from an account.' })
export class RevokeRoleInput {
  @Field(() => String) userId!: string;
  @Field(() => String) roleSlug!: string;
  @Field(() => String, { nullable: true }) vendorId?: string | null;
}

export const RevokeRoleSchema = z.object({
  userId: z.string().trim().min(1).max(40),
  roleSlug,
  vendorId,
});

@InputType({ description: 'Grant or deny one permission directly on an account (PBAC).' })
export class SetDirectGrantInput {
  @Field(() => String) userId!: string;
  @Field(() => String) permissionSlug!: string;

  @Field(() => Boolean, {
    defaultValue: true,
    description: 'false writes an explicit denial, which beats every role grant.',
  })
  effect!: boolean;

  @Field(() => String, { nullable: true }) vendorId?: string | null;
  @Field(() => DateTimeScalar, { nullable: true }) expiresAt?: Date | null;
}

export const SetDirectGrantSchema = z.object({
  userId: z.string().trim().min(1).max(40),
  permissionSlug: z.string().trim().min(3).max(80),
  effect: z.boolean(),
  vendorId,
  expiresAt,
});

@InputType({ description: 'Remove a direct grant or denial, so the account’s roles decide again.' })
export class RemoveDirectGrantInput {
  @Field(() => String) userId!: string;
  @Field(() => String) permissionSlug!: string;
  @Field(() => String, { nullable: true }) vendorId?: string | null;
}

export const RemoveDirectGrantSchema = z.object({
  userId: z.string().trim().min(1).max(40),
  permissionSlug: z.string().trim().min(3).max(80),
  vendorId,
});
