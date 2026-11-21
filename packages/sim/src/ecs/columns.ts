// Column registry (ADR-005 §3-4). Every key of `World` must appear in exactly one of the lists
// below; ecs.test.ts enforces it. Adding a column = declare it here. Changing HASHED_COLUMNS
// (content or order) changes every hash: bump REPLAY_FORMAT_VERSION.
import type { World } from './world';

/**
 * Per-entity columns folded into hash(), in hash order. The derived entity id
 * (makeEid(gen[i], i)) is hashed first, before these.
 */
export const HASHED_COLUMNS = [
  'typeId',
  'owner',
  'posX',
  'posY',
  'velX',
  'velY',
  'facing',
  'hp',
  'orderKind',
  'goalX',
  'goalY',
  'pathState',
  'pathIdx',
  'stuck',
] as const;

/** World-level scalars folded into hash() (after the tick). */
export const HASHED_SCALARS = ['count'] as const;

/**
 * Not folded into hash(). alive/gen/highWater enter through the eid and the iteration;
 * pathCount, waypoints and repathAt enter hashFull(); prevX/prevY/radius are derived;
 * capacity and the free-slot stack are bookkeeping.
 */
export const UNHASHED_COLUMNS = [
  'capacity',
  'highWater',
  'alive',
  'gen',
  'radius',
  'prevX',
  'prevY',
  'pathCount',
  'wpX',
  'wpY',
  'repathAt',
  'freeSlots',
  'freeTop',
] as const;

export type HashedColumn = (typeof HASHED_COLUMNS)[number];
export type UnhashedColumn = (typeof UNHASHED_COLUMNS)[number];
export type HashedScalar = (typeof HASHED_SCALARS)[number];

// Compile-time guard: every listed name is a real World key.
export type ListedColumn = HashedColumn | UnhashedColumn | HashedScalar;
export const _listedColumnsAreWorldKeys: ListedColumn extends keyof World ? true : never = true;
// ...and every World key is listed.
export const _worldKeysAreListed: keyof World extends ListedColumn ? true : never = true;
