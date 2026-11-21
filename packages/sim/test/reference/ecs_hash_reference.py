#!/usr/bin/env python3
"""Independent reference for ADR-005 §4 hash() on the fixed 5-entity world used by ecs.test.ts.

Run: python3 ecs_hash_reference.py   -> prints the golden hash (decimal and hex).
Layout: tick, count, gridVersion, prng[0..3], then per live slot (ascending) eid + 14 columns.
FNV-1a 32-bit over little-endian int32 values.
"""

def fnv_int32(h, v):
    v &= 0xFFFFFFFF
    for k in range(4):
        h ^= (v >> (8 * k)) & 0xFF
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h

TICK, GRID_VERSION, PRNG = 123, 7, [1, 2, 3, 4]
# (gen, idx, typeId, owner, posX, posY, velX, velY, facing, hp, orderKind, goalX, goalY, pathState, pathIdx, stuck)
LIVE = [
    (1, 0, 1, 0, 1500, 2500, -12, 7, 900, 40000, 1, 9500, 8500, 2, 1, 3),
    (2, 1, 2, 1, 4500, 4500, 0, 0, 5, 100000, 0, 0, 0, 0, 0, 0),
    (1, 2, 0, 255, 0, 0, 0, 0, 0, 25000, 0, 0, 0, 0, 0, 0),
    (1, 4, 2, 0, 512000, 512000, -2147483648, 0, 1023, -5, 1, 0, 2147483647, 4, 0, 65535),
]
h = 0x811C9DC5
for v in [TICK, len(LIVE), GRID_VERSION] + PRNG:
    h = fnv_int32(h, v)
for gen, idx, *cols in LIVE:
    for v in [(gen << 16) | idx] + cols:
        h = fnv_int32(h, v)
print(h, hex(h))
