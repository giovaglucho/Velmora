import { z } from 'zod';

export const I18nFile = z.object({ locale: z.enum(['es', 'en']), strings: z.record(z.string(), z.string()) });
export type I18nFile = z.infer<typeof I18nFile>;
