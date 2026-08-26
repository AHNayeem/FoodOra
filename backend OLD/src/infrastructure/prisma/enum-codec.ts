import { Prisma } from './generated';

/**
 * Postgres stores `restaurant-owner`; the Prisma client calls it
 * `RESTAURANT_OWNER`; the frontend, the GraphQL scalar and every log line say
 * `restaurant-owner`.
 *
 * That third form is the contract (D5 §Enums), so exactly one layer is allowed
 * to know about the second — the repositories. This is what they use, and it is
 * built from the **DMMF** rather than from hand-written maps: `@map("cloud-kitchen")`
 * in the schema is already the single source of truth for the pairing, and
 * re-typing 104 enums into TypeScript would be 104 chances to disagree with it.
 *
 * ```ts
 * const roles = enumCodec('UserRoleSlug');
 * roles.toWire('RESTAURANT_OWNER'); // "restaurant-owner"
 * roles.toDb('restaurant-owner');   // "RESTAURANT_OWNER"
 * ```
 *
 * `W` is the wire form, `D` the Prisma client's. `D` is worth parameterising because
 * Prisma's generated `where` and `data` types demand the literal union rather than
 * `string` — without it every call site would need a cast, and a cast is exactly the
 * thing that would let a wrong value through.
 */
export interface EnumCodec<W extends string = string, D extends string = string> {
  readonly name: string;
  /** Prisma client value → the frontend's string. */
  toWire(value: string): W;
  /** The frontend's string → Prisma client value. Throws on anything outside the enum. */
  toDb(value: W): D;
  /** Every wire value, in schema order — what a scalar's member list is built from. */
  readonly wireValues: readonly W[];
}

const cache = new Map<string, EnumCodec>();

export function enumCodec<W extends string = string, D extends string = string>(
  enumName: string,
): EnumCodec<W, D> {
  const hit = cache.get(enumName);
  if (hit) return hit as EnumCodec<W, D>;

  const definition = Prisma.dmmf.datamodel.enums.find((candidate) => candidate.name === enumName);
  if (!definition) {
    // A typo here would otherwise surface as a silent `undefined` on every read.
    throw new Error(
      `No enum "${enumName}" in the Prisma schema. Available: ${Prisma.dmmf.datamodel.enums
        .map((e) => e.name)
        .join(', ')}`,
    );
  }

  const toWireMap = new Map<string, string>();
  const toDbMap = new Map<string, string>();
  for (const value of definition.values) {
    // `dbName` is the `@map`ped label; without one the two forms are identical.
    const wire = value.dbName ?? value.name;
    toWireMap.set(value.name, wire);
    toDbMap.set(wire, value.name);
  }

  const codec: EnumCodec<W, D> = {
    name: enumName,
    wireValues: [...toWireMap.values()] as W[],
    toWire(value) {
      const wire = toWireMap.get(value);
      if (wire === undefined) throw new Error(`"${value}" is not a member of ${enumName}.`);
      return wire as W;
    },
    toDb(value) {
      const db = toDbMap.get(value);
      if (db === undefined) throw new Error(`"${value}" is not a member of ${enumName}.`);
      return db as D;
    },
  };

  cache.set(enumName, codec);
  return codec;
}

/**
 * Asserts that a `shared/enums` vocabulary and its Postgres enum contain exactly
 * the same members.
 *
 * Called at module init by the modules that own a vocabulary, so a value added to
 * the schema but not to the TypeScript union — or the reverse — fails the boot
 * rather than one unlucky query months later. This is the seam where a
 * hand-written union and a generated client could drift, so it is the seam that
 * gets a check.
 */
export function assertVocabularyMatches(enumName: string, vocabulary: readonly string[]): void {
  const codec = enumCodec(enumName);
  const inSchema = new Set(codec.wireValues);
  const inCode = new Set(vocabulary);

  const missingInCode = [...inSchema].filter((value) => !inCode.has(value));
  const missingInSchema = [...inCode].filter((value) => !inSchema.has(value));

  if (missingInCode.length || missingInSchema.length) {
    throw new Error(
      [
        `Vocabulary drift between the Postgres enum "${enumName}" and its shared/enums union.`,
        missingInCode.length ? `  in the schema only: ${missingInCode.join(', ')}` : '',
        missingInSchema.length ? `  in the union only: ${missingInSchema.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
}
