# Registro de licencias de assets

Todo asset (imagen, modelo, sonido, musica, fuente, shader de terceros) debe figurar aqui.

## Reglas

1. **Cero material de Age of Empires** (ni de Microsoft/Ensemble/Forgotten Empires): ni sprites, sonidos, musica, nombres, textos ni iconos, ni como placeholder.
2. **Evitar CC BY-SA** (y cualquier copyleft de assets): su clausula de redistribucion bajo la misma licencia contamina el proyecto. Preferir CC0, CC BY, MIT, OFL, dominio publico o assets propios.
3. **Registrar antes de integrar:** la fila se agrega en el mismo PR que incorpora el archivo; sin fila no hay merge.
4. Cumplir la atribucion exigida y guardar el texto/URL de la licencia.
5. Los assets generados por herramientas propias se registran como "Propio" con la herramienta usada.

## Registro

| Asset                                                                                        | Fuente                                                                         | Licencia            | Atribucion | Fase | Archivo                                                                      |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------- | ---------- | ---- | ---------------------------------------------------------------------------- |
| Textura de terreno provisional: pasto (512x512, tileable)                                    | Generado por `tools/asset-pipeline` (`pnpm assets:gen`, semilla fija, sin red) | Propio (procedural) | Ninguna    | 2    | `packages/client/public/assets/provisional/ground0.png`                      |
| Textura de terreno provisional: tierra (512x512, tileable)                                   | Generado por `tools/asset-pipeline` (`pnpm assets:gen`, semilla fija, sin red) | Propio (procedural) | Ninguna    | 2    | `packages/client/public/assets/provisional/ground1.png`                      |
| Textura de terreno provisional: arena (512x512, tileable)                                    | Generado por `tools/asset-pipeline` (`pnpm assets:gen`, semilla fija, sin red) | Propio (procedural) | Ninguna    | 2    | `packages/client/public/assets/provisional/ground2.png`                      |
| Textura de terreno provisional: ceniza/roca (512x512, tileable)                              | Generado por `tools/asset-pipeline` (`pnpm assets:gen`, semilla fija, sin red) | Propio (procedural) | Ninguna    | 2    | `packages/client/public/assets/provisional/ground3.png`                      |
| Textura de terreno provisional: agua (512x512, tileable)                                     | Generado por `tools/asset-pipeline` (`pnpm assets:gen`, semilla fija, sin red) | Propio (procedural) | Ninguna    | 2    | `packages/client/public/assets/provisional/water.png`                        |
| Mascara de ruido del splatting (256x256, tileable, 4 canales)                                | Generado por `tools/asset-pipeline` (`pnpm assets:gen`, semilla fija, sin red) | Propio (procedural) | Ninguna    | 2    | `packages/client/public/assets/provisional/noise.png`                        |
| Atlas provisional de unidades (5 apariencias x 8 direcciones x idle/walk x body/team, 64x96) | Generado por `tools/asset-pipeline` (`pnpm assets:gen`, semilla fija, sin red) | Propio (procedural) | Ninguna    | 2    | `packages/client/public/assets/provisional/units.png (+ units.json)`         |
| Atlas provisional de edificio (8 direcciones x body/team, 128x128)                           | Generado por `tools/asset-pipeline` (`pnpm assets:gen`, semilla fija, sin red) | Propio (procedural) | Ninguna    | 2    | `packages/client/public/assets/provisional/buildings.png (+ buildings.json)` |
| Atlas UI provisional: anillo de seleccion, marcador de orden, punto de minimapa              | Generado por `tools/asset-pipeline` (`pnpm assets:gen`, semilla fija, sin red) | Propio (procedural) | Ninguna    | 2    | `packages/client/public/assets/provisional/ui.png (+ ui.json)`               |
| Manifiesto del conjunto provisional (hashes sha256)                                          | Generado por `tools/asset-pipeline` (`pnpm assets:gen`, semilla fija, sin red) | Propio (procedural) | Ninguna    | 2    | `packages/client/public/assets/provisional/manifest.json`                    |

## Tipografias previstas (no integradas)

Verificado con grep: el devlog (`tools/devlog`) usa `Georgia`/`system-ui` del sistema y no carga ninguna fuente externa.

| Fuente | Uso previsto          | Licencia    | Estado                 |
| ------ | --------------------- | ----------- | ---------------------- |
| Cinzel | Titulos / UI tematica | SIL OFL 1.1 | Prevista, no integrada |
| Inter  | Texto de UI           | SIL OFL 1.1 | Prevista, no integrada |

Al integrarlas: agregar filas al registro con su archivo y conservar el texto de la licencia OFL.
