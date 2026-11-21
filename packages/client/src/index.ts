// Public type contracts of the client package (ADR-006). Types only: importing this never pulls Pixi/React.
export type { FromWorker, ToWorker, SnapshotMode, ReadyInfo, PerfInfo } from './worker/protocol';
export type { SnapshotView, SnapshotLayout } from './worker/snapshot';
export type { SimClient } from './worker/client';
export type { Camera, Viewport, TileRange, Vec2, ZoomIndex } from './render/types';
export type { GameView } from './ui/store';
