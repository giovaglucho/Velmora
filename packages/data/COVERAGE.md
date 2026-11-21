# Cobertura del GDD en @reinos/data

Resultado de `pnpm data:check`: resources=4 ages=4 units=43 buildings=25 techs=76 upgrades=25 factions=4 maps=1 difficulties=6 aiRules=2 i18nKeys=20 economySources=9 gatherRates=9; 31 avisos (valores pendientes del GDD).

## Cubierto (transcrito)

- §4.2-4.6 economía (tasas, fuentes, mercado, comercio, tributo, Fragmentos), §4.5 completo (16 filas -> 18 techs con filas "éter / piedra" expandidas).
- §5 eras (costos, tiempos, requisitos, bonus implícitos de armadura/PV).
- §6 tabla de edificios completa (24 filas + Torre de bombarda de éter), mejoras de defensas (como upgrades), construcción/reparación (combat.json).
- §7.1 tabla de unidades completa (43 variantes), §7.2 líneas de mejora (21 upgrades de unidad + 4 de edificio).
- §8 clases, área, guarnición, Custodios, counters, actitudes, formaciones (combat.json).
- §9.1-9.4 tecnologías (Forja, Cuartel/Arquería/Establo/Puerto, Academia/Bastión/Ciudadela, Santuario).
- §10 las 4 facciones de lanzamiento, con bonus, bonus de equipo, unidad única, técnicas únicas y exclusiones.
- §11.2-11.4 pool de mapas + script `llanuras_de_ceniza`; §3.5 parámetros globales; §11.3 terrenos.
- §12.1 capas, §12.2 reglas de ejemplo, §12.3 dificultades + calibración.

## No cubierto / pendiente (con motivo)

| Qué                                                                                                                                              | Motivo                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Estadísticas base de las 4 unidades únicas (Lancero del Alba, Berserker de Fiordo, Arquero de Dunas, Ballesta de Cobre) y sus versiones de élite | §10 solo describe mecánicas; sin PV/ataque/costo. Mecánicas numéricas ya en `factions/*.json` (`statsPending: true`). |
| Costo/tiempo/efecto de las 8 técnicas únicas                                                                                                     | §9.3 "Varía"; el efecto está, sin costo ni tiempo (`techs.json`, `faction` presente, sin `cost`).                     |
| Costo y tiempo de 19 de las 21 mejoras de unidad (todas salvo Espada larga y Caballero real) y de las 4 mejoras de defensa                       | §7.2 dice "como en AoE2" sin cifras (avisos de `data:check`).                                                         |
| Bonus de ataque (lanceros +vs caballería, espadas vs edificios, etc.) y valores de daño por clase                                                | §7.1 solo da un "Atq"; §8.1 da únicamente el ejemplo del Alabardero mejorado (10 +32).                                |
| Mejoras ocultas de Recluta y Batidor (§5 "definidas en ages.json")                                                                               | Sin números en el GDD; `ages.implicit.hiddenUnitUpgrades` con `stats: {}`.                                            |
| Efecto de Devoción y Teocracia; era/recurso exacto de las techs del Santuario sin etiqueta                                                       | §9.4 incompleto (era asumida III, recurso éter, marcado AMBIGUO).                                                     |
| Brulote rápido, Barco de demolición pesado, Galeón de éter de élite, Escaramuzador de élite                                                      | Mencionados en §7.2/§8.4 sin fila en §7.1. Radio 3,5 del demolición pesado queda en `combat.json` con `unitPending`.  |
| Monarca (75 PV), Héroes, animales (oveja/ciervo/jabalí/lobo) como unidades; Cocas de comercio                                                    | §7.3 / §4.6 sin estadísticas completas; las fuentes de comida de animales están en `economy.sources`.                 |
| Cantidad de peces / pesca desde la orilla                                                                                                        | §4.4 solo da la trampa de peces (715).                                                                                |
| Tamaño, armadura y tiempo de Torre de bombarda de éter                                                                                           | §6 solo da costo y PV.                                                                                                |
| PV de Era IV de Molino/Aserradero/Campamento/Forja/Mercado/Torre de vigía/Muralla/Portón y de edificios con "/"                                  | El GDD no especifica más allá de las eras listadas.                                                                   |
| Mapas distintos de Llanuras de Ceniza (scripts RMS)                                                                                              | §11.2 solo da descripción; `game.mapPool` los lista con `scriptAvailable: false`. Mapa Gigante 240 (fuera de 1.0).    |
| Facciones posteriores (Kaer Morn, Ixtal, Shen, Kharun)                                                                                           | §2: contenido de actualizaciones; sin bonus detallados.                                                               |
| Campañas (`campaigns/*/*.json`, §12.4), build orders de IA (§12.2 solo describe el formato), música por facción                                  | Fuera del alcance de Fase 0 o sin datos en el GDD.                                                                    |

## Decisiones de interpretación (AMBIGUO en `notes`)

- "X–Y" sobre 3 variantes: primera=X, resto=Y (arietes, onagros, galeras: armadura, alcance, visión, velocidad, edad).
- Tiempo "60/36" de la Galera: 60 base, 36 resto; "34/27" del Jinete arquero: 34 / 27.
- Edificio de las filas sin edificio en §7.1 hereda el de la fila anterior (Escaramuzador y Jinete arquero -> Arquería; Escorpión -> Taller).
- Atq de proyectil/barco/pólvora se guarda como `pierce`; melee como `melee`.
- Valdren "mejoras gratis de Yugo" = Yugo gratis; Skjald +10/15/20% PV por era no acumulativo; Tessaline +25% precisión relativo; "Anillo de tensión RoF −10%" literal sobre recarga.
