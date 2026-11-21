import { z } from 'zod';

const metric = z.number().nonnegative().nullable();

export const DevlogSchema = z.object({
  fase: z.number().int().min(0).max(13),
  titulo: z.string().min(1),
  /** Porcentaje del plan total (fase+1)/14. */
  porcentaje: z.number().min(0).max(100),
  fecha: z.string().optional(),
  ahoraSePuede: z.string().min(1),
  /** null = aún no medido (se muestra como pendiente, nunca se inventa). */
  metricas: z.object({ fps: metric, tick: metric, tests: metric, nota: z.string().optional() }),
  /** Notas extra para el README de la fase (una viñeta cada una; no se muestran en la tarjeta del sitio). */
  notas: z.array(z.string().min(1)).optional(),
  siguiente: z.string().min(1),
  /** Rutas relativas a docs/progress/fase-XX/media/. */
  imagenes: z.array(z.object({ archivo: z.string().min(1), alt: z.string().min(1) })),
  video: z.string().optional(),
});

export type Devlog = z.infer<typeof DevlogSchema>;

export const RoadmapSchema = z.object({
  fases: z
    .array(
      z.object({
        fase: z.number().int().min(0).max(13),
        titulo: z.string().min(1),
        estado: z.enum(['hecha', 'en curso', 'próxima', 'futura']),
        pasos: z.array(z.string().min(1)).min(1),
        /** Lo que impide cerrar la fase (puerta humana o criterio abierto). null = nada pendiente. */
        pendiente: z.string().min(1).nullable(),
      }),
    )
    .length(14),
});

export type Roadmap = z.infer<typeof RoadmapSchema>;

export const HITOS: { n: number; nombre: string; desde: number; hasta: number }[] = [
  { n: 1, nombre: 'Prototipo', desde: 0, hasta: 3 },
  { n: 2, nombre: 'MVP vs IA', desde: 4, hasta: 5 },
  { n: 3, nombre: 'Aspecto AAA', desde: 6, hasta: 7 },
  { n: 4, nombre: 'Online', desde: 8, hasta: 9 },
  { n: 5, nombre: 'Lanzamiento', desde: 10, hasta: 13 },
];
