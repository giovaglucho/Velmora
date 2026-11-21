# Registro de licencias de assets

Todo asset (imagen, modelo, sonido, musica, fuente, shader de terceros) debe figurar aqui.

## Reglas

1. **Cero material de Age of Empires** (ni de Microsoft/Ensemble/Forgotten Empires): ni sprites, sonidos, musica, nombres, textos ni iconos, ni como placeholder.
2. **Evitar CC BY-SA** (y cualquier copyleft de assets): su clausula de redistribucion bajo la misma licencia contamina el proyecto. Preferir CC0, CC BY, MIT, OFL, dominio publico o assets propios.
3. **Registrar antes de integrar:** la fila se agrega en el mismo PR que incorpora el archivo; sin fila no hay merge.
4. Cumplir la atribucion exigida y guardar el texto/URL de la licencia.
5. Los assets generados por herramientas propias se registran como "Propio" con la herramienta usada.

## Registro

| Asset | Fuente | Licencia | Atribucion | Fase | Archivo |
| ----- | ------ | -------- | ---------- | ---- | ------- |
|       |        |          |            |      |         |

## Tipografias previstas (no integradas)

Verificado con grep: el devlog (`tools/devlog`) usa `Georgia`/`system-ui` del sistema y no carga ninguna fuente externa.

| Fuente | Uso previsto | Licencia | Estado |
| ------ | ------------ | -------- | ------ |
| Cinzel | Titulos / UI tematica | SIL OFL 1.1 | Prevista, no integrada |
| Inter  | Texto de UI           | SIL OFL 1.1 | Prevista, no integrada |

Al integrarlas: agregar filas al registro con su archivo y conservar el texto de la licencia OFL.
