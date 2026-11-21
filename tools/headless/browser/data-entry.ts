// Browser bundle of the data layer (esbuild IIFE): builds SimData from balance tables in the page
// and returns simDataHash + the speed column, to compare against Node (R1/F1 H4).
import { buildSimData, bundledRaw, loadGameData } from '@reinos/data';
import { simDataHash, type SimData } from '@reinos/shared';
import { TIE_SPEED_COUNT, withTieSpeeds } from '../src/tie-table';

export interface DataDigest {
  hash: number;
  speeds: number[];
}

function digest(raw: typeof bundledRaw): DataDigest {
  const sim = buildSimData(loadGameData(raw)) as SimData;
  return { hash: simDataHash(sim), speeds: sim.speedFxPerTick.slice() };
}

(globalThis as unknown as { ReinosData: unknown }).ReinosData = {
  bundled: (): DataDigest => digest(bundledRaw),
  tie: (round: number): DataDigest => digest(withTieSpeeds(bundledRaw, round)),
  tieSpeedCount: TIE_SPEED_COUNT,
};
