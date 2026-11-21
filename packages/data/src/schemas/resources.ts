import { z } from 'zod';
import { LocalizedName, ResourceId, Notes } from './common.js';

export const ResourceDef = z.object({
  id: ResourceId,
  name: LocalizedName,
  role: z.string(),
  sources: z.array(z.string()),
  notes: Notes,
});
export const ResourcesFile = z.object({ resources: z.array(ResourceDef).length(4) });
export type ResourcesFile = z.infer<typeof ResourcesFile>;
