/**
 * GraphQL object types that more than one module returns.
 *
 * The default is still that a module owns its own types in
 * `modules/<name>/presentation/models/`. This folder is for the handful that are
 * genuinely shared vocabulary — where two modules returning the same concept would
 * otherwise have to declare two `@ObjectType`s with the same name, which fails
 * schema assembly, or two with different names, which fractures the client.
 */
export { User } from './user.model';
