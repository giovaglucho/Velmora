# Reinos de Ceniza — Documento Técnico (GDD + TDD)

Nov 21, 2026 · @GiovaG

## 1. Visión y pilares

**Reinos de Ceniza** es un RTS histórico-fantástico de construcción de imperios que se juega entero en el navegador: entrás a una URL en Render y en menos de 20 segundos estás en el menú principal, con campaña, partida rápida contra IA y multijugador online ranked. Toma como referencia mecánica a Age of Empires II: Definitive Edition (economía de 4 recursos, 4 edades, fórmula de daño aditiva por clases de armadura, lockstep determinista) y cambia toda la temática, nombres, arte, audio y textos por material original.

**Frase de venta:** "Un RTS de PC de calidad AAA, sin descargar nada."

### Pilares de diseño

1.  **Profundidad clásica, ritmo moderno.** Reglas fieles al género (economía con caminata real, counters piedra-papel-tijera, edades, murallas, asedio) y modos cortos de 15–20 min para sesiones rápidas.

2.  **"No puedo creer que esto sea un navegador".** Arte 2.5D isométrico prerenderizado desde 3D con iluminación por normal maps, agua y niebla por shader, partículas y post-proceso. Objetivo de calidad visual: 8,5/10, nunca menos de 8.

3.  **Cero fricción.** Sin instalación, carga progresiva, invitado sin registro para jugar contra la IA, cuenta para ranked y progresión.

4.  **Justo y competitivo.** Simulación determinista, repeticiones de todas las partidas, ranking con temporadas, balance basado en datos (JSON).

5.  **Siempre una partida más.** Desafío diario con semilla fija, misiones semanales, progresión cosmética de cuenta, ligas.

### Público

- Jugadores de RTS clásicos (AoE2, AoM, Stronghold, Warcraft III) que quieren jugar desde cualquier PC, incluso la del trabajo.

- Jugadores casuales de estrategia que entran por la campaña y los modos rápidos.

- Plataforma objetivo: navegador de escritorio (Chrome, Edge, Firefox, Safari 17+) con teclado y mouse. Móvil queda fuera del alcance 1.0 (se muestra una pantalla de aviso).

### Qué se mantiene y qué cambia respecto de AoE2 DE

| Aspecto            | AoE2 DE (referencia)                    | Reinos de Ceniza                                                  |
|--------------------|-----------------------------------------|-------------------------------------------------------------------|
| Recursos           | Comida, madera, oro, piedra             | Víveres, madera, éter, piedra (mismo rol económico)               |
| Edades             | Oscura, Feudal, Castillos, Imperial     | Era de Ceniza, Era del Hierro, Era de los Bastiones, Era del Éter |
| Civilizaciones     | 56 históricas                           | 4 facciones de lanzamiento y 4 posteriores, todas originales      |
| Monje y conversión | Monje, "Wololo"                         | Custodio, "Resonancia" (canto propio, sin frases del original)    |
| Reliquias          | Generan oro en el monasterio            | Fragmentos Coronales: generan éter en el Santuario                |
| Daño               | max(1, Σ max(0, Atq − Arm)) × elevación | Igual (es una regla de juego, no un asset)                        |
| Red                | Lockstep con relay                      | Lockstep con relay por WebSocket en Render                        |
| Plataforma         | PC nativo                               | Navegador (WebGL2, WebGPU opcional)                               |
|                    |                                         |                                                                   |

**Regla de oro técnica:** el código lee datos y nunca tiene valores de balance escritos a mano. Todo número de este documento vive en /packages/data/\*.json y se valida con un esquema.

## 2. Mundo y temática

El mundo es **Velmora**, un continente medieval que vive 300 años después de **la Caída de la Corona Celeste**: un cristal gigante que flotaba sobre el cielo se quebró y llovió sobre la tierra en forma de esquirlas de **éter**, un mineral luminoso que se usa como moneda, combustible de armas y fuente de poder de los Custodios. La magia es escasa y tangible (no hay hechizos de ejército ni dragones voladores): el tono es "histórico con un 15% de fantasía", para que la lectura del campo de batalla sea tan clara como en AoE2.

### Tono visual

- Paleta cálida de "hora dorada" con cielos de ceniza; el éter es el único elemento cian brillante, así que las minas, los Custodios y las armas de éter destacan solos.

- Arquitectura reconocible por facción desde la silueta (techos nevados, cúpulas de arenisca, torres de mármol, piedra negra).

- Legibilidad ante todo: color de jugador fuerte en estandartes, escudos y gualdrapas; sombras suaves; nada de ruido visual que tape las unidades.

### Facciones de lanzamiento

| Facción             | Inspiración cultural                    | Arquitectura                         | Idea de juego                                           | Equivalente de rol en AoE2 |
|---------------------|-----------------------------------------|--------------------------------------|---------------------------------------------------------|----------------------------|
| Casa Valdren        | Reinos francos y castellanos            | Piedra clara, techos de pizarra azul | Caballería pesada y castillos baratos                   | Francos / Teutones         |
| Clanes Skjald       | Escandinavia y Britania del norte       | Madera tallada, techos nevados       | Infantería agresiva, barcos fuertes, economía de madera | Vikingos / Godos           |
| Sultanato de Azhar  | Persia y el Magreb                      | Arenisca, cúpulas, azulejos          | Arqueros a caballo, comercio y mercado                  | Sarracenos / Mongoles      |
| Concordia Tessaline | Venecia, Bizancio y las ciudades-estado | Mármol blanco, arcadas, cobre        | Asedio, pólvora de éter, defensa                        | Italianos / Bizantinos     |

### Facciones posteriores (contenido de actualizaciones)

| Facción              | Inspiración       | Idea de juego                                         |
|----------------------|-------------------|-------------------------------------------------------|
| Dominio de Kaer Morn | Celtas de pantano | Custodios fuertes, curación, emboscada en bosque      |
| Tribus de Ixtal      | Mesoamérica       | Sin caballería; infantería rápida, oro/éter abundante |
| Imperio de Shen      | China y Corea     | Ballesteros de ráfaga, aldeanos extra al inicio       |
| Horda de Kharun      | Estepa            | No necesita casas, caballería a distancia, nómadas    |

### Las cuatro eras

| Era                        | Equivalente | Fantasía narrativa                                     |
|----------------------------|-------------|--------------------------------------------------------|
| I. Era de Ceniza           | Edad Oscura | Aldeas que sobreviven entre ruinas y ceniza            |
| II\. Era del Hierro        | Feudal      | Se forjan las primeras armas y se recupera el comercio |
| III\. Era de los Bastiones | Castillos   | Fortalezas, Custodios y fragmentos de la Corona        |
| IV\. Era del Éter          | Imperial    | El éter refinado alimenta pólvora, asedio y maravillas |

**Glosario de nombres propios:** Colono (aldeano), Custodio (monje), Santuario (monasterio), Ciudadela (centro urbano), Bastión (castillo), Fragmento Coronal (reliquia), Resonancia (conversión), Faro Celeste (maravilla).

## 3. Modos de juego

La versión 1.0 tiene tres puertas de entrada desde el menú: **Campaña**, **Partida rápida contra IA** y **Multijugador online**, además de Tutorial, Repeticiones y Editor de escenarios (este último en la 1.1).

### 3.1 Campaña

- **Prólogo "Las Cenizas" (3 misiones, tutorial narrativo):** economía, militar básico, subir de era y atacar una base.

- **Campaña 1 "La Espada de Valdren" (6 misiones):** primera campaña completa, con objetivos variados (escolta, defensa con oleadas, destruir maravilla, conquista naval ligera, regicidio, batalla final).

- **Campañas 2–4** (una por facción restante): contenido posterior.

- Cada misión tiene briefing con mapa ilustrado y narración, objetivos primarios y secundarios, 3 dificultades y una medalla (bronce, plata, oro) según tiempo y objetivos secundarios.

- Los escenarios son JSON: mapa fijo, unidades iniciales, disparadores (triggers) con condiciones y efectos (§12.4), diálogos con retrato y escenas cortas con cámara scriptada.

### 3.2 Partida rápida y escaramuza contra IA

- **Partida rápida:** un clic. 1v1 contra IA en un mapa aleatorio del pool, dificultad recordada, velocidad 1,7.

- **Escaramuza personalizada:** de 1 a 8 jugadores (humanos e IA), equipos, mapa, tamaño, recursos iniciales, era inicial, población (75–500), velocidad, modo de victoria, revelar mapa, semilla.

- Dificultades de IA: Aprendiz, Fácil, Normal, Difícil, Muy difícil y Despiadada (§12).

### 3.3 Multijugador online

- **Ranked 1v1 y por equipos (2v2, 3v3, 4v4):** cola con matchmaking por rating, veto de mapas, facción elegida o aleatoria.

- **Ranked "Guerra de Coronas":** variante tipo Empire Wars, empieza en Era del Hierro con economía montada; partidas de 12–20 min. Es el modo estrella para enganchar.

- **Salas personalizadas:** lobby con chat, configuración completa, IA de relleno, espectadores con retraso de 2 minutos.

- **Jugar con amigos:** invitación por enlace (/lobby/ABCD12).

### 3.4 Modos y condiciones de victoria

| Modo                     | Descripción                                                           | Disponible en |
|--------------------------|-----------------------------------------------------------------------|---------------|
| Conquista                | Destruir todas las unidades y edificios clave del rival               | 1.0           |
| Faro Celeste (maravilla) | Construir la maravilla y defenderla 200 s de juego por tamaño de mapa | 1.0           |
| Fragmentos               | Controlar todos los Fragmentos Coronales durante 200 s                | 1.0           |
| Regicidio                | Cada jugador tiene un Monarca; si muere, pierde                       | 1.0           |
| Guerra de Coronas        | Inicio en Era del Hierro con 15 colonos repartidos y edificios base   | 1.0           |
| Muerte súbita            | Perder la Ciudadela es perder                                         | 1.1           |
| Rey de la Colina         | Controlar un monumento central                                        | 1.1           |
| Batalla real             | Mapa que se cierra con una tormenta de ceniza                         | 1.2           |
| Desafío diario           | Escenario con semilla del día, misma para todos, tabla de tiempos     | 1.0           |

### 3.5 Parámetros globales

- Tamaños de mapa: Diminuto 120×120 (2 j.), Pequeño 144 (3), Mediano 168 (4), Normal 200 (6), Grande 220 (8). Gigante 240 y superiores quedan fuera de la 1.0 por rendimiento.

- Población: 200 por defecto, máximo 300 en 1.0 (500 cuando el rendimiento lo permita).

- Velocidades: 1,0 / 1,5 / **1,7 (estándar)** / 2,0. Todos los tiempos del documento son segundos de juego.

## 4. Economía

La economía replica la de AoE2: 4 recursos, colonos que caminan de verdad entre recurso y depósito, cargas fijas y tasas por segundo. Todos los valores están en economy.json y se calibran con tests de build order (§17).

### 4.1 Recursos

| Recurso | Rol                                                        | Fuentes                                                            |
|---------|------------------------------------------------------------|--------------------------------------------------------------------|
| Víveres | Colonos, infantería, eras, tecnologías                     | Ovejas, ciervos, jabalíes, bayas, granjas, pesca, trampas de peces |
| Madera  | Edificios, arqueros, asedio, barcos                        | Árboles, bosques                                                   |
| Éter    | Recurso premium: unidades de élite, eras III–IV, Custodios | Vetas de éter, Fragmentos Coronales, comercio                      |
| Piedra  | Ciudadelas, torres, murallas, Bastiones                    | Canteras                                                           |

### 4.2 Colono

25 PV, ataque 3, armadura 0/0, velocidad 0,8, visión 4, cuesta 50 víveres y tarda 25 s. Se empieza con 3 colonos y un Batidor (Shen: 6 colonos). Carga 10 de todo, salvo caza: 35.

### 4.3 Tasas de recolección base

| Tarea                  | Recurso | Por segundo   | Por minuto |
|------------------------|---------|---------------|------------|
| Pesca desde la orilla  | Víveres | 0,43          | 25,8       |
| Caza                   | Víveres | 0,41          | 24,6       |
| Pastoreo (ovejas)      | Víveres | 0,33          | 19,8       |
| Granja                 | Víveres | 0,32 efectivo | 19,2       |
| Bayas                  | Víveres | 0,31          | 18,6       |
| Tala                   | Madera  | 0,39          | 23,4       |
| Minería de éter        | Éter    | 0,38          | 22,8       |
| Cantera                | Piedra  | 0,36          | 21,6       |
| Fragmento en Santuario | Éter    | 0,5           | 30         |

Modelo de cálculo:

tasa\_{efectiva} = tasa\_{base} \times \prod m\_{tecnolog\acute{\imath}a} \times \prod m\_{facci\acute{o}n}

La granja genera víveres en un búfer invisible de hasta 15 a 0,4/s y el colono toma 1/4 de su capacidad por golpe, así que la capacidad de carga es una mejora directa.

### 4.4 Fuentes y cantidades

| Fuente                       | Cantidad                | Distancia a la Ciudadela               | Notas                                 |
|------------------------------|-------------------------|----------------------------------------|---------------------------------------|
| Oveja (8 por jugador en 1v1) | 100                     | 10–12 casillas                         | Se capturan por visión; 4 más a 14–30 |
| Ciervo (3–4)                 | 140                     | 14–30                                  | Se pudre a 0,25/s                     |
| Jabalí (2)                   | 340                     | 16–22                                  | Hay que atraerlo; pudre a 0,4/s       |
| Bayas (6 arbustos)           | 125 c/u                 | 8–10                                   |                                       |
| Granja                       | 175 base (550 con todo) | —                                      | 60 madera, 3×3, 15 s, requiere Molino |
| Trampa de peces              | 715                     | —                                      | 100 madera                            |
| Veta de éter                 | 800 por casilla         | 1 de 7 casillas a 8–10; 2 de 4 a 18–26 | Brillo cian                           |
| Cantera                      | 350 por casilla         | 1 de 5 y 1 de 4 a 10–24                |                                       |

Los animales matados por unidades militares o edificios no dan víveres. Los cadáveres pierden comida al ritmo al que la recogería un colono.

### 4.5 Tecnologías económicas

| Tecnología                      | Era | Edificio          | Costo             | Tiempo (s) | Efecto                             |
|---------------------------------|-----|-------------------|-------------------|------------|------------------------------------|
| Jubón acolchado                 | I   | Ciudadela         | 50 éter           | 25         | Colonos +15 PV, +1/+2 armadura     |
| Carretilla                      | II  | Ciudadela         | 175 vív. 50 mad.  | 75         | +10% velocidad, +25% carga         |
| Carro de mano                   | III | Ciudadela         | 300 vív. 200 mad. | 55         | +10% velocidad, +50% carga         |
| Hacha templada                  | II  | Aserradero        | 100 vív. 50 mad.  | 25         | Madera +20%                        |
| Sierra de arco                  | III | Aserradero        | 150 vív. 100 mad. | 50         | Madera +20%                        |
| Sierra doble                    | IV  | Aserradero        | 300 vív. 200 mad. | 100        | Madera +10%                        |
| Yugo                            | II  | Molino            | 75 vív. 75 mad.   | 20         | Granjas +75                        |
| Arado de hierro                 | III | Molino            | 125 vív. 125 mad. | 40         | Granjas +125, +1 carga             |
| Rotación de cultivos            | IV  | Molino            | 250 vív. 250 mad. | 70         | Granjas +175                       |
| Picos de éter / de piedra       | II  | Campamento minero | 100 vív. 75 mad.  | 30         | +15%                               |
| Pozos profundos (éter / piedra) | III | Campamento minero | 175 vív. 75 mad.  | 75         | +15%                               |
| Redes de pesca                  | III | Puerto            | 150 vív. 200 mad. | 45         | Pesqueros +10% velocidad, +5 carga |
| Caravana                        | III | Mercado           | 200 vív. 200 éter | 40         | Comercio +50% velocidad            |
| Acuñación                       | III | Mercado           | 200 vív. 100 éter | 70         | Tributo 20%                        |
| Banca                           | IV  | Mercado           | 300 vív. 200 éter | 70         | Tributo 0%                         |
| Gremios                         | IV  | Mercado           | 300 vív. 200 éter | 50         | Comisión de mercado 15%            |

### 4.6 Mercado, comercio y tributo

- **Mercado:** compra y venta de víveres, madera y piedra por éter. Precio base 100 (piedra 130), comisión 30%, cada operación mueve 100 unidades y desplaza el precio ±3 (mínimo 20, máximo 9999). Precios compartidos por todos los jugadores de la partida.

- **Carreta de comercio** (100 mad. 50 éter, 70 PV, velocidad 1,25): éter por viaje entre dos Mercados a distancia d (casillas) en un mapa de lado L:

\acute{e}ter = 0{,}46 \times d \times \left(\frac{d}{L} + 0{,}3\right)

Mínimo 5 casillas para generar 1. Las cocas de comercio rinden 25% menos y son más rápidas.

- **Tributo:** comisión 30% (enviar 100 retira 130), Acuñación 20%, Banca 0%.

- **Fragmentos Coronales:** 5 en mapas estándar; solo los recoge un Custodio; en el Santuario generan 0,5 éter/s cada uno.

## 5. Eras

Se avanza de era en la Ciudadela; mientras se investiga, la Ciudadela no entrena colonos. Al completarse suena una fanfarria propia de la facción y los edificios cambian de modelo (madera → piedra → piedra ornamentada con detalles de éter).

| Era             | Costo                  | Tiempo (s) | Requisito                                                                                                                      |
|-----------------|------------------------|------------|--------------------------------------------------------------------------------------------------------------------------------|
| II\. Hierro     | 500 víveres            | 130        | 2 edificios de Era I (Cuartel, Molino, Aserradero, Campamento minero, Puerto). No cuentan casas, granjas, murallas ni atalayas |
| III\. Bastiones | 800 víveres, 200 éter  | 160        | 2 edificios de Era II (Arquería, Establo, Forja, Mercado)                                                                      |
| IV\. Éter       | 1000 víveres, 800 éter | 190        | 2 edificios de Era III o 1 Bastión                                                                                             |

**Bonus implícitos al subir de era:**

- Edificios (salvo atalayas, torres, Bastiones y murallas): +1/+1 de armadura por era.

- PV de edificios por era: Cuartel/Arquería/Establo 1200/1500/1800/2100; Casa 550/750/900/900.

- Batidor: +2 de visión por era. Recluta y Batidor reciben mejoras ocultas de estadísticas de AoE2 (definidas en ages.json).

## 6. Edificios

Todos los edificios ocupan N×N casillas, se colocan sobre la rejilla y pasan por 4 estados visuales de construcción (cimientos, andamio, 60%, terminado) y 3 de daño (75%, 50%, 25% con fuego y humo). Valores con "/" van por era desde la de desbloqueo. Sin Albañilería ni Arquitectura (cada una +10% PV, +1/+1 armadura).

| Edificio             | Equivalente AoE2    | Era | Costo                         | Constr. (s) | PV           | Arm. C/P         | Tamaño | Función                                                |
|----------------------|---------------------|-----|-------------------------------|-------------|--------------|------------------|--------|--------------------------------------------------------|
| Ciudadela            | Centro urbano       | I   | 275 mad. 100 pie.             | 150         | 2400         | 3/5 (+1 por era) | 4×4    | +5 pob., guarnición 15, colonos, eras, dispara flechas |
| Casa                 | Casa                | I   | 25 mad.                       | 25          | 550–900      | 0/7 (+1)         | 2×2    | +5 pob.                                                |
| Molino               | Molino              | I   | 100 mad.                      | 35          | 600/800/1000 | 0/7 (+1)         | 2×2    | Depósito de víveres                                    |
| Aserradero           | Campamento maderero | I   | 100 mad.                      | 35          | 600/800/1000 | 0/7 (+1)         | 2×2    | Depósito de madera                                     |
| Campamento minero    | Campamento minero   | I   | 100 mad.                      | 35          | 600/800/1000 | 0/7 (+1)         | 2×2    | Depósito de éter y piedra                              |
| Puerto               | Puerto              | I   | 150 mad.                      | 35          | 1800         | 0/7 (+1)         | 3×3    | Barcos, pesca, depósito                                |
| Cuartel              | Cuartel             | I   | 175 mad.                      | 50          | 1200–2100    | 0/7 (+1)         | 3×3    | Infantería                                             |
| Granja               | Granja              | I   | 60 mad.                       | 15          | 480          | 0/0              | 3×3    | Víveres infinitos con resiembra                        |
| Empalizada           | Empalizada          | I   | 3 mad.                        | 6           | 150/250      | 2/5              | 1×1    | Muro                                                   |
| Puerta de empalizada | Ídem                | I   | 20 mad.                       | 30          | 240/400      | 2/2              | 4×1    | Paso aliado                                            |
| Atalaya              | Puesto avanzado     | I   | 25 mad. 5 pie.                | 15          | 500          | 0/0              | 1×1    | Visión 6/8/10/12                                       |
| Arquería             | Galería de tiro     | II  | 175 mad.                      | 50          | 1500–2100    | 1/8 (+1)         | 3×3    | Arqueros                                               |
| Establo              | Establo             | II  | 175 mad.                      | 50          | 1500–2100    | 1/8 (+1)         | 3×3    | Caballería                                             |
| Forja                | Herrería            | II  | 150 mad.                      | 40          | 1800/2100    | 1/8 (+1)         | 3×3    | Mejoras de ataque y armadura                           |
| Mercado              | Mercado             | II  | 175 mad.                      | 60          | 1800/2100    | 1/8 (+1)         | 4×4    | Comercio                                               |
| Trampa de peces      | Ídem                | II  | 100 mad.                      | 40          | 50           | 0/0              | 1×1    | 715 víveres                                            |
| Torre de vigía       | Torre de vigilancia | II  | 35 mad. 125 pie.              | 80          | 850/1020     | 1/7              | 1×1    | Guarnición 5                                           |
| Muralla de piedra    | Ídem                | II  | 5 pie.                        | 10          | 1080/1800    | 8/10             | 1×1    | Muro                                                   |
| Portón               | Puerta              | II  | 30 pie.                       | 70          | 1650/2700    | 6/6              | 4×1    | Paso aliado                                            |
| Santuario            | Monasterio          | III | 175 mad.                      | 40          | 2100         | 2/9 (+1)         | 3×3    | Custodios, Fragmentos                                  |
| Academia             | Universidad         | III | 200 mad.                      | 60          | 2100         | 2/9 (+1)         | 4×4    | Tecnologías de edificios y balística                   |
| Taller de asedio     | Ídem                | III | 200 mad.                      | 40          | 1500–2100    | 1/8 (+1)         | 4×4    | Asedio                                                 |
| Bastión              | Castillo            | III | 650 pie.                      | 200         | 4800         | 8/11             | 4×4    | +20 pob., guarnición 20, únicos, Fundíbulo             |
| Faro Celeste         | Maravilla           | IV  | 1000 mad. 1000 pie. 1000 éter | 3500        | 4800         | 3/10             | 5×5    | Victoria por maravilla                                 |

**Mejoras de defensas:** Muralla reforzada 3000 PV y 12/12; Portón reforzado 4000 PV; Torre de guardia 1500 PV 2/8; Torreón 2250 PV 3/9; Torre de bombarda de éter 125 pie. 100 éter, 2220 PV.

**Construcción con varios colonos:**

t\_{real} = \frac{3 \cdot t}{n + 2}

Con 2 colonos 75% del tiempo, con 4 el 50%. Grúa de rueda (Academia) +20% de velocidad.

**Reparación:** el primer colono repara 750 PV/min de juego y cada uno extra suma 375; asedio y barcos al 25%. Reparar de 1 PV al máximo cuesta el 50% del costo original.

**Reglas de colocación:** no se puede construir sobre agua (salvo Puerto y trampas), bosque, acantilado ni casillas no exploradas; los cimientos de un enemigo visible bloquean; las murallas se arrastran como línea y se convierten en portón al colocar uno encima.

## 7. Unidades

Las estadísticas parten de AoE2 DE (parche 188329) como base de balance probada y se ajustan con datos propios. Tiempos de recarga (RoF) en segundos; "Prec." es la precisión de proyectil. Los valores definitivos viven en units.json.

### 7.1 Tabla base

| Unidad                            | Edificio / Era  | Costo             | T (s) | PV          | Atq      | Arm. C/P  | Alc. | RoF   | Vel.    | Visión | Prec. | Clases              |
|-----------------------------------|-----------------|-------------------|-------|-------------|----------|-----------|------|-------|---------|--------|-------|---------------------|
| Colono                            | Ciudadela / I   | 50 vív.           | 25    | 25          | 3        | 0/0       | —    | 2     | 0,8     | 4      | —     | civil               |
| Recluta                           | Cuartel / I     | 60 vív. 20 éter   | 21    | 40          | 4        | 0/1       | —    | 2     | 0,9     | 4      | —     | infantería          |
| Guerrero                          | II              | ídem              | 21    | 45          | 6        | 0/1       | —    | 2     | 0,9     | 4      | —     | infantería          |
| Espada larga                      | III             | ídem              | 21    | 60          | 9        | 0/1       | —    | 2     | 0,9     | 4      | —     | infantería          |
| Gran espada                       | IV              | ídem              | 21    | 60          | 12       | 0/1       | —    | 2     | 0,9     | 5      | —     | infantería          |
| Campeón ceniciento                | IV              | ídem              | 21    | 70          | 13       | 1/1       | —    | 2     | 0,9     | 5      | —     | infantería          |
| Lancero / Piquero / Alabardero    | II / III / IV   | 35 vív. 25 mad.   | 22    | 45/55/60    | 3/4/6    | 0/0       | —    | 3     | 1,0     | 4      | —     | infantería, lancero |
| Arquero                           | Arquería / II   | 25 mad. 45 éter   | 35    | 30          | 4        | 0/0       | 4    | 2     | 0,96    | 6      | 80%   | arquero             |
| Ballestero                        | III             | ídem              | 27    | 35          | 5        | 0/0       | 5    | 2     | 0,96    | 7      | 85%   | arquero             |
| Arbalestero                       | IV              | ídem              | 27    | 40          | 6        | 0/0       | 5    | 2     | 0,96    | 7      | 90%   | arquero             |
| Escaramuzador / veterano          | II / III        | 25 vív. 35 mad.   | 22    | 30/35       | 2/3      | 0/3, 0/4  | 4/5  | 3     | 0,96    | 6–7    | 90%   | arquero             |
| Jinete arquero / pesado           | III / IV        | 40 mad. 60 éter   | 34/27 | 50/60       | 6/7      | 0/0, 1/0  | 4    | 2     | 1,4     | 5–6    | 50%   | arquero, caballería |
| Arcabucero de éter                | Arquería / IV   | 45 vív. 50 éter   | 34    | 35          | 17       | 1/0       | 7    | 3,45  | 0,96    | 9      | 65%   | pólvora             |
| Batidor                           | Establo / II    | 80 vív.           | 30    | 45          | 5        | 0/2       | —    | 2     | 1,55    | 6      | —     | caballería          |
| Jinete ligero / Húsar             | III / IV        | 80 vív.           | 30    | 60/75       | 7        | 0/2       | —    | 2/1,9 | 1,5     | 8/10   | —     | caballería          |
| Caballero                         | III             | 60 vív. 75 éter   | 30    | 100         | 10       | 2/2       | —    | 1,8   | 1,35    | 4      | —     | caballería          |
| Caballero real                    | IV              | ídem              | 30    | 120         | 12       | 2/2       | —    | 1,8   | 1,35    | 4      | —     | caballería          |
| Paladín                           | IV              | ídem              | 30    | 160         | 14       | 2/3       | —    | 1,9   | 1,35    | 5      | —     | caballería          |
| Custodio                          | Santuario / III | 100 éter          | 51    | 30          | —        | 0/0       | 9    | —     | 0,7     | 11     | —     | custodio            |
| Ariete / blindado / de asedio     | Taller / III–IV | 160 mad. 75 éter  | 36    | 175/200/270 | 2/3/4    | 0/180–195 | —    | 5     | 0,5–0,6 | 3      | —     | asedio              |
| Lanzapiedras / Onagro / de asedio | Taller          | 160 mad. 135 éter | 46    | 50/60/70    | 40/50/75 | 0/6–8     | 7–8  | 6     | 0,6     | 9–10   | —     | asedio              |
| Escorpión / pesado                | Taller          | 75 mad. 75 éter   | 30    | 40/50       | 12/16    | 0/7       | 7    | 3,6   | 0,65    | 9      | —     | asedio              |
| Bombarda de éter                  | Taller / IV     | 225 mad. 225 éter | 56    | 80          | 40       | 2/5       | 12   | 6,5   | 0,7     | 14     | 92%   | asedio, pólvora     |
| Fundíbulo                         | Bastión / IV    | 200 mad. 200 éter | 50    | 150         | 200      | 1/150     | 16   | 10    | 0,8     | 18     | 80%   | asedio              |
| Zapador                           | Bastión / III   | 65 vív. 20 éter   | 25    | 50          | 25       | 0/2       | —    | —     | 0,8     | 4      | —     | infantería          |
| Carreta de comercio               | Mercado / II    | 100 mad. 50 éter  | 51    | 70          | —        | 0/0       | —    | —     | 1,25    | 7      | —     | civil               |
| Pesquero                          | Puerto / I      | 75 mad.           | 40    | 50          | —        | 1/1       | —    | —     | 1,26    | 5      | —     | barco               |
| Galera / de guerra / Galeón       | Puerto / II–IV  | 90 mad. 30 éter   | 60/36 | 120/135/165 | 6/7/8    | 0/6–8     | 5–7  | 3     | 1,43    | 7–9    | —     | barco               |
| Brulote                           | Puerto / II     | 75 mad. 45 éter   | 36    | 100         | 2 cont.  | 0/6       | 2,5  | 0,25  | 1,35    | 5      | —     | barco               |
| Barco de demolición               | Puerto / III    | 70 mad. 50 éter   | 31    | 60          | 95       | 0/3       | —    | —     | 1,6     | 6      | —     | barco               |
| Galeón de éter                    | Puerto / IV     | 200 mad. 150 éter | 46    | 120         | 35       | 0/6       | 13   | 10    | 1,1     | 15     | 50%   | barco, pólvora      |

### 7.2 Líneas de mejora

- **Infantería:** Recluta → Guerrero → Espada larga → Gran espada → Campeón ceniciento; Lancero → Piquero → Alabardero.

- **Arqueros:** Arquero → Ballestero → Arbalestero; Escaramuzador → veterano; Jinete arquero → pesado; Arcabucero de éter.

- **Caballería:** Batidor → Jinete ligero → Húsar; Caballero → Caballero real → Paladín.

- **Asedio:** Ariete → blindado → de asedio; Lanzapiedras → Onagro → de asedio; Escorpión → pesado; Bombarda de éter; Fundíbulo (se despliega y repliega, 10 s).

- **Naval:** Galera → de guerra → Galeón; Brulote → rápido; Barco de demolición → pesado; Galeón de éter → de élite.

- Las mejoras de línea cuestan y tardan como en AoE2 (p. ej. Espada larga 200 vív. 65 éter, 45 s; Caballero real 300 vív. 300 éter, 100 s); van en upgrades.json.

### 7.3 Unidades especiales

- **Monarca** (solo Regicidio): 75 PV, armadura 0/0, rápido, sin ataque.

- **Héroes de campaña:** versiones con más PV y regeneración; no convertibles.

- **Animales:** oveja, ciervo, jabalí, lobo de ceniza (agresivo, ataca colonos aislados).

### 7.4 Animación por unidad (requisito de arte)

Cada unidad necesita 16 direcciones prerenderizadas (no 8 espejadas, por calidad) con: reposo, caminar, atacar (2 variantes en héroes), morir, cadáver que se desvanece, y para colonos: talar, minar, cosechar, construir, cargar. Máscara de color de jugador en un canal separado.

## 8. Combate

El combate usa la fórmula aditiva de AoE2, calculada en aritmética entera (punto fijo ×1000) para que sea idéntica en todos los navegadores.

### 8.1 Fórmula de daño

da\tilde{n}o = \max\left(1,\\ k\_{elev} \cdot k\_{res} \cdot \sum_i \max(0,\\ Atq_i - Arm_i)\right)

- i recorre cuerpo a cuerpo, perforante y cada clase de bonus. Si el objetivo no tiene la clase i, su armadura vale 1000 (ese ataque no hace nada).

- k_elev = 1,25 si el atacante está más alto, 0,75 si está más bajo (solo en colina), 1 si no. Se calcula al impactar y antes del mínimo de 1.

- k_res: resistencia a daño de bonus (algunas unidades únicas, p. ej. −25%).

- Ejemplo: Alabardero mejorado (10 de ataque, +32 contra caballería) contra Paladín (5 de armadura): (10−5)+(32−0) = 37.

### 8.2 Clases de armadura

melee, pierce, infantry, archer, cavalry, cavalry_archer, spear, siege, building, stone_defense, wall, ship, custodian, gunpowder, unique, camel_like (regional), hero. Cada unidad declara sus clases y valores en units.json.

### 8.3 Proyectiles

- Cada proyectil es una entidad simulada con trayectoria parabólica (visual) y punto de impacto determinista.

- Precisión: con probabilidad (1 − prec.) el proyectil cae en un punto desviado dentro de un radio proporcional a la distancia y puede dañar a otra unidad. El sorteo usa el PRNG con semilla de la partida.

- Anillo de tensión (equivalente a Anillo del pulgar): 100% de precisión, RoF −10%. Balística: apunta al punto de intercepción con objetivos en movimiento.

### 8.4 Daño de área

| Fuente                            | Radio (casillas) | Notas                                   |
|-----------------------------------|------------------|-----------------------------------------|
| Lanzapiedras / Onagro / de asedio | 1 / 1,25 / 1,5   | Daña aliados; puede atacar al suelo     |
| Ariete blindado / de asedio       | 1,5 / 2          | Solo edificios                          |
| Bombarda de éter                  | 0,5              |                                         |
| Barco de demolición / pesado      | 2,5 / 3,5        | Caída lineal por distancia, se destruye |

### 8.5 Guarnición

- Infantería, arqueros, Custodios y colonos entran en Ciudadela, torres y Bastión; la caballería solo en el Bastión. Arietes llevan hasta 4 infantes (aumentan su velocidad y ataque).

- Curación en guarnición: 0,1 PV/s en torres y Ciudadela, 0,2 en Bastión.

- Flechas extra: floor(Σ dps_unidad / dps_edificio); los colonos cuentan 2,5 dps fijos; solo suman arqueros, jinetes arqueros y pólvora.

- Las unidades salen expulsadas si el edificio baja del 20% de PV.

- **Campana de la aldea:** todos los colonos en 23 casillas corren a refugiarse; un segundo clic los devuelve a su tarea.

### 8.6 Custodios

- Curan 1 PV cada 0,4 s a aliados heridos cercanos (automático en actitud defensiva).

- **Resonancia** (conversión): fe al 100% requerida; duración mínima 5 s, máxima 12 s, con 28% de probabilidad de éxito cada 1,2 s tras el mínimo. Edificios: 18–29 s, 9%, requiere Redención. Batidores y caballería ligera: 5%.

- La fe se recarga a 1,6/s (Iluminación +87,5%).

- Recogen y transportan Fragmentos Coronales (no pueden convertir mientras cargan uno).

- Sonido propio de canto ascendente con un acorde de cristal al completar: el equivalente memorable al "Wololo", pero original.

### 8.7 Counters

| Unidad                | Fuerte contra                  | Débil contra                              |
|-----------------------|--------------------------------|-------------------------------------------|
| Lanceros              | Caballería                     | Arqueros, espadas                         |
| Espadas               | Infantería, edificios          | Arqueros, caballería pesada               |
| Arqueros              | Infantería, lanceros           | Escaramuzadores, caballería, Lanzapiedras |
| Escaramuzadores       | Arqueros                       | Caballería, infantería                    |
| Caballería            | Arqueros, asedio               | Lanceros, Custodios                       |
| Lanzapiedras / Onagro | Masas de arqueros e infantería | Caballería, arietes                       |
| Ariete                | Edificios                      | Cuerpo a cuerpo                           |
| Custodio              | Unidades caras y lentas        | Caballería ligera                         |

### 8.8 Actitudes y formaciones

- **Actitudes:** Agresiva (persigue), Defensiva (persigue poco y vuelve), Mantener posición, Sin ataque. Asedio de ariete arranca en Defensiva y solo ataca edificios y asedio.

- **Formaciones:** Línea, Caja, Escalonada, Flanco. El grupo se mueve a la velocidad del más lento; la línea se orienta hacia la marcha si la orden supera 10 casillas. Formaciones y movimiento en grupo son una fuente clásica de desincronización: se testean con hash de estado.

- **Patrullar**, **Seguir**, **Custodiar** y cola de órdenes con Shift.

- **Sin fuego amigo** salvo área, proyectiles fallados y barcos de demolición.

## 9. Tecnologías

Las tecnologías son modificadores declarativos ({target, stat, op, value}) aplicados por un sistema genérico; ninguna tiene código propio salvo excepciones marcadas script. Las económicas están en §4.5.

### 9.1 Forja (militar)

| Tecnología                             | Era       | Costo                                                  | T (s)     | Efecto                                                       |
|----------------------------------------|-----------|--------------------------------------------------------|-----------|--------------------------------------------------------------|
| Fragua / Hierro colado / Alto horno    | II/III/IV | 150 vív.; 220 vív. 120 éter; 275 vív. 225 éter         | 50/75/100 | Infantería y caballería +1/+1/+2 ataque                      |
| Escamas / Malla / Placas (infantería)  | II/III/IV | 100 vív.; 200 vív. 100 éter; 300 vív. 150 éter         | 40/55/70  | +1/+1, +1/+1, +1/+2                                          |
| Bardas de escamas / malla / placas     | II/III/IV | 150 vív.; 250 vív. 150 éter; 350 vív. 200 éter         | 45/60/75  | Caballería +1/+1, +1/+1, +1/+2                               |
| Emplumado / Punta de éter / Brazal     | II/III/IV | 100 vív. 50 éter; 200 vív. 100 éter; 300 vív. 200 éter | 30/35/40  | Arqueros, torres y Ciudadela +1 alcance y +1 ataque cada una |
| Acolchado / Cuero / Anillas (arqueros) | II/III/IV | 100 vív.; 150 vív. 150 éter; 250 vív. 250 éter         | 40/55/70  | +1/+1, +1/+1, +1/+2                                          |

### 9.2 Cuartel, Arquería, Establo, Puerto

| Tecnología                        | Edificio | Era       | Costo                                                    | T (s)    | Efecto                                     |
|-----------------------------------|----------|-----------|----------------------------------------------------------|----------|--------------------------------------------|
| Suministros                       | Cuartel  | II        | 75 vív. 75 éter                                          | 20       | Línea de espadas −15 víveres               |
| Gambesones                        | Cuartel  | III       | 100 vív. 100 éter                                        | 25       | Línea de espadas +1 arm. perforante        |
| Escuderos                         | Cuartel  | III       | 100 vív.                                                 | 40       | Infantería +10% velocidad                  |
| Incendiarios                      | Cuartel  | III       | 150 vív. 50 éter                                         | 25       | Infantería +2 contra edificios             |
| Anillo de tensión                 | Arquería | III       | 300 vív. 250 mad.                                        | 45       | Precisión 100%, RoF −10%                   |
| Táctica de estepa                 | Arquería | IV        | 200 vív. 250 éter                                        | 65       | Jinetes arqueros +1/+2 armadura            |
| Linajes                           | Establo  | II        | 150 vív. 100 éter                                        | 50       | Montados +20 PV                            |
| Cría de caballos                  | Establo  | III       | 150 vív.                                                 | 40       | Montados +10% velocidad                    |
| Carenado / Dique seco / Astillero | Puerto   | III/IV/IV | 250 vív. 150 éter; 600 vív. 400 éter; 1000 vív. 300 éter | 50/60/60 | +1 arm. perf.; +15% velocidad; −20% madera |

### 9.3 Academia, Bastión y Ciudadela

| Tecnología                   | Edificio  | Era    | Costo                      | T (s) | Efecto                                        |
|------------------------------|-----------|--------|----------------------------|-------|-----------------------------------------------|
| Albañilería                  | Academia  | III    | 150 vív. 175 mad.          | 50    | Edificios +10% PV, +1/+1                      |
| Arquitectura                 | Academia  | IV     | 300 vív. 200 mad.          | 70    | Edificios +10% PV, +1/+1                      |
| Grúa de rueda                | Academia  | III    | 300 vív. 200 mad.          | 50    | Construcción +20%                             |
| Balística                    | Academia  | III    | 300 mad. 175 éter          | 60    | Puntería a objetivos en movimiento            |
| Aspilleras                   | Academia  | III    | 200 vív. 100 pie.          | 35    | Sin rango mínimo en torres                    |
| Alquimia de éter             | Academia  | IV     | 300 vív. 200 éter          | 100   | +1 ataque a proyectiles; requisito de pólvora |
| Ingenieros de asedio         | Academia  | IV     | 500 vív. 600 mad.          | 45    | Asedio +1 alcance, +20% contra edificios      |
| Torre de bombarda            | Academia  | IV     | 800 vív. 400 mad.          | 60    | Desbloquea la torre                           |
| Vigilancia / Patrulla urbana | Ciudadela | II/III | 75 vív.; 300 vív. 100 éter | 25/40 | Edificios +4 visión cada una                  |
| Matacanes                    | Bastión   | IV     | 400 vív. 400 mad.          | 75    | Bastión +21% PV                               |
| Conscripción                 | Bastión   | IV     | 150 vív. 150 éter          | 60    | Producción militar +33%                       |
| Zapadores                    | Bastión   | IV     | 400 vív. 200 mad.          | 10    | Colonos +15 contra edificios                  |
| Técnica única de Bastión     | Bastión   | III    | Varía                      | Varía | Ver §10                                       |
| Técnica única del Éter       | Bastión   | IV     | Varía                      | Varía | Ver §10                                       |

### 9.4 Santuario

Redención 475 éter/50 s (convertir edificios y asedio), Expiación 325/40 (convertir Custodios), Hierbas sagradas 200/35 (curación en guarnición ×6), Herejía 1000/60 (unidades convertidas mueren), Santidad 175/60 (+15 PV), Fervor 140/50 (+15% velocidad), Devoción 100 vív. 200 éter/40, Fe 550 vív. 750 éter/60 (resistencia a Resonancia), Iluminación 120/65, Imprenta 200/55 (+3 alcance), Teocracia 200/75.

## 10. Facciones

Cada facción es un JSON con bonus (modificadores), bonus de equipo, unidad única (Bastión, con versión de élite), dos técnicas únicas, unidades y tecnologías deshabilitadas, set de arquitectura, idioma de voces y paleta de música.

|                 | Casa Valdren                                                                                            | Clanes Skjald                                                                                     | Sultanato de Azhar                                                          | Concordia Tessaline                                                             |
|-----------------|---------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------|---------------------------------------------------------------------------------|
| Bonus 1         | Bastiones −25% piedra                                                                                   | Colonos talan +15%                                                                                | Mercado: comisión 5%                                                        | Asedio +15% PV                                                                  |
| Bonus 2         | Caballería +20% PV desde Era III                                                                        | Infantería +10% PV en Era II, +15% en III, +20% en IV                                             | Jinetes arqueros +1 ataque contra edificios                                 | Subir de era −15% costo                                                         |
| Bonus 3         | Molinos y granjas: mejoras gratis de Yugo                                                               | Barcos de guerra −15% costo                                                                       | Carretas +25% PV                                                            | Torres y murallas +1 de armadura por era                                        |
| Bonus 4         | Batidores ven +2                                                                                        | Sin Casas hasta Era II (pob. 15)                                                                  | Colonos minan éter +15%                                                     | Pólvora +25% precisión                                                          |
| Bonus de equipo | Caballería aliada +2 visión                                                                             | Puertos aliados −15% madera                                                                       | Comercio aliado +20%                                                        | Academias aliadas investigan +40% más rápido                                    |
| Unidad única    | Lancero del Alba: caballería de choque con carga inicial (+15 de daño en el primer golpe, recarga 20 s) | Berserker de Fiordo: infantería que regenera 1 PV/s y gana velocidad de ataque al bajar de 50% PV | Arquero de Dunas: jinete arquero que dispara en movimiento sin penalización | Ballesta de Cobre: asedio ligero antipersonal que dispara 3 virotes perforantes |
| Técnica Bastión | Juramento: unidades únicas +15% velocidad                                                               | Runas de guerra: infantería +1/+1 armadura                                                        | Ravanasciera: carretas +30% velocidad                                       | Fuego griego de éter: barcos y torres +1 alcance                                |
| Técnica Éter    | Cruzada de Ceniza: caballería +2 ataque                                                                 | Lavahall: infantería que muere cura 10 PV a aliados cercanos                                      | Zoco Imperial: el mercado genera 0,5 éter/s                                 | Ingenio de la Concordia: asedio dispara 20% más rápido                          |
| Les falta       | Arcabucero, Galeón de éter, Anillo de tensión                                                           | Jinete arquero, Caballero real, Bombarda                                                          | Paladín, Campeón, Onagro de asedio                                          | Húsar, Paladín, Jinete arquero pesado                                           |
| Arquitectura    | Europa occidental                                                                                       | Norte de madera                                                                                   | Desierto                                                                    | Mediterráneo                                                                    |
| Voces           | Idioma inventado de raíz latina                                                                         | Idioma inventado de raíz nórdica                                                                  | Idioma inventado de raíz persa/árabe                                        | Idioma inventado de raíz griega/italiana                                        |

**Regla de balance:** las 4 facciones deben quedar entre 47% y 53% de victorias en partidas IA Despiadada contra IA Despiadada (1000 simulaciones headless por par) antes de cada release; después se ajusta con datos de ranked.

## 11. Mapas y generación procedural

Los mapas aleatorios se generan a partir de una **semilla** y un **script de mapa** declarativo en JSON inspirado en el formato RMS de AoE2. Misma semilla + mismo script = mismo mapa en todos los clientes, requisito del lockstep.

### 11.1 Pipeline del generador (por etapas, como RMS)

1.  **Jugadores:** posiciones en círculo con jitter, equipos juntos o enfrentados.

2.  **Tierras:** áreas de jugador (porcentaje, tamaño base, borde difuso) y zonas libres.

3.  **Elevación:** colinas por ruido de valor con semilla; la Ciudadela siempre a elevación 0.

4.  **Acantilados:** líneas a ≥22 casillas de cualquier inicio.

5.  **Terreno:** bosques por clumps, lagos, ríos, playas; texturas por bioma.

6.  **Conexiones:** caminos garantizados entre jugadores (flood fill para validar).

7.  **Objetos:** recursos con distancias de §4.4, Fragmentos, animales, decoración.

8.  **Validación de equidad:** mismos recursos por jugador dentro de ±5%; si falla, se regenera con semilla+1 (determinista).

### 11.2 Pool de mapas 1.0

| Mapa               | Inspiración                   | Rasgo                                                                  |
|--------------------|-------------------------------|------------------------------------------------------------------------|
| Llanuras de Ceniza | Arabia                        | Abierto, colinas, bosques dispersos: el mapa competitivo de referencia |
| Ciudad Amurallada  | Arena                         | Bases rodeadas de muralla, centro abierto                              |
| Bosque Negro       | Black Forest                  | Bosque denso con claros; partidas largas                               |
| Archipiélago Roto  | Islands                       | Islas por jugador, juego naval (1.1 cuando el naval esté completo)     |
| Paso de la Corona  | Mapa híbrido                  | Dos mesetas unidas por pasos estrechos y un lago central               |
| Estepa Gris        | Nomad (sin Ciudadela inicial) | 1.1                                                                    |
| Ríos de Éter       | Mapa original                 | Ríos vadeables que brillan, éter extra en las orillas                  |

### 11.3 Terreno, elevación y visión

- Tipos: pasto, tierra, arena, nieve, ceniza, camino (+10% velocidad), aguas poco profundas (vadeables, −20% velocidad), agua profunda (solo barcos), bosque (impasable, talable), acantilado.

- Elevación 0–7 niveles; multiplicador ±25% (§8.1); las unidades suben colinas un 10% más lento.

- **Niebla de guerra** con 3 estados: inexplorado (negro), explorado (último estado conocido de edificios, desaturado) y visible. Visión = unión de visión propia y aliada, calculada en una rejilla de visibilidad por jugador con conteo de referencias (incremental, no recalculada entera).

- La niebla se renderiza con una textura de baja resolución desenfocada en shader para bordes suaves.

### 11.4 Formato de script de mapa (ejemplo)

{  
"id": "llanuras_de_ceniza",  
"baseTerrain": "grass",  
"players": { "landPercent": 25, "baseSize": 9, "fuzz": 20 },  
"elevation": { "hills": 14, "maxHeight": 3 },  
"forests": { "clumps": 22, "size": \[30, 80\], "avoidPlayers": 12 },  
"objects": \[  
{ "type": "sheep", "perPlayer": 8, "dist": \[10, 12\], "group": 4 },  
{ "type": "boar", "perPlayer": 2, "dist": \[16, 22\] },  
{ "type": "aether_vein", "perPlayer": 1, "tiles": 7, "dist": \[8, 10\] },  
{ "type": "crown_shard", "total": 5, "avoidPlayers": 30 }  
\]  
}

## 12. Inteligencia artificial

La IA es un **sistema experto de reglas** inspirado en los scripts .per de AoE2, ejecutado dentro de la simulación determinista (consume el mismo PRNG y emite comandos igual que un humano). Así funciona en partidas multijugador como relleno y en repeticiones.

### 12.1 Arquitectura en capas

| Capa        | Frecuencia                | Responsabilidad                                                                                                            |
|-------------|---------------------------|----------------------------------------------------------------------------------------------------------------------------|
| Estratégica | cada 2 s                  | Elegir plan (scouts, arqueros, fast castle, boom, torre), decidir subir de era, atacar o defender                          |
| Económica   | cada 1 s                  | Repartir colonos por porcentajes (strategic numbers), construir casas antes del tope, depósitos cerca de recursos, granjas |
| Producción  | cada 0,5 s                | Colas de entrenamiento e investigación según el plan y el counter detectado                                                |
| Táctica     | cada 0,25 s               | Grupos de ataque, objetivos, retirada al bajar del 30% de PV del grupo, focus de arqueros, enfoque de Lanzapiedras         |
| Micro       | cada tick (solo Difícil+) | Esquivar proyectiles de Lanzapiedras, separar unidades, robar ovejas, atraer jabalí                                        |

### 12.2 Reglas (formato)

{ "when": \["age == 1", "canTrain('colono')", "idleQueue('ciudadela')"\],  
"do": \["train('colono')"\] }  
{ "when": \["true"\], "do": \["setSN('food_pct', 60)", "disableSelf()"\] }

Los build orders son guiones con pasos {pob, acción} (p. ej. scouts: 6 a ovejas, 4 a madera, 1 atrae jabalí, 4 a bayas + molino, …, subir con 21 de población).

### 12.3 Dificultades

| Nivel       | Retraso de reacción | Micro    | Bonus económico              | Objetivo                        |
|-------------|---------------------|----------|------------------------------|---------------------------------|
| Aprendiz    | 4 s                 | No       | −50%                         | Nunca ataca antes del min 25    |
| Fácil       | 2,5 s               | No       | −25%                         | Un ataque por era               |
| Normal      | 1,5 s               | Básica   | 0                            | Jugador casual                  |
| Difícil     | 0,8 s               | Sí       | 0                            | Jugador medio (~1000 de rating) |
| Muy difícil | 0,4 s               | Sí       | 0                            | Jugador bueno (~1300)           |
| Despiadada  | 0,2 s               | Completa | +20% (sin trampas de visión) | Desafío para expertos           |

Calibración: la IA Muy difícil debe clicar Era del Hierro antes de 9:30 de juego con el plan de scouts y Era de los Bastiones antes de 17:00 con fast castle (tests automáticos).

### 12.4 Disparadores de campaña

Escenarios con triggers de condición → efecto: tiempo, unidad en área, objeto destruido, recursos, variable; efectos: crear unidad, mostrar diálogo, mover cámara, cambiar diplomacía, objetivo cumplido, victoria/derrota, activar IA, reproducir escena.

## 13. UI/UX, controles, menús y cinemáticas

La experiencia debe sentirse como un juego de PC desde el primer segundo: pantalla completa, cursor propio, música, transiciones animadas y cero apariencia de "página web".

### 13.1 Flujo de arranque

1.  **Precarga (\< 3 s):** logo del estudio animado sobre fondo negro mientras baja el núcleo (\< 4 MB). Botón "Click para comenzar" (necesario para habilitar audio y pantalla completa).

2.  **Cinemática de introducción (60–90 s, saltable):** hecha con el propio motor: cámaras scriptadas sobre escenas 2.5D (la Corona Celeste quebrándose, la lluvia de éter, ejércitos marchando), partículas, texto narrado con subtítulos y música orquestal. Se puede volver a ver desde Extras.

3.  **Menú principal:** fondo vivo (una escena del juego renderizada en tiempo real con cámara lenta, agua, humo, banderas) y botones: Campaña, Partida rápida, Multijugador, Desafío diario, Repeticiones, Perfil, Opciones, Extras.

4.  **Carga de partida:** pantalla con ilustración de la facción o del mapa, consejos de juego y barra de progreso real por jugador (multijugador).

### 13.2 HUD en partida

- **Barra superior:** víveres, madera, éter, piedra (con conteo de colonos por recurso), población actual/máxima, era actual, reloj de juego, menú, objetivos, diplomacia, chat.

- **Panel inferior:** minimapa (modos: normal, combate, economía), retratos y estadísticas de la selección (hasta 60 iconos con PV), cuadrícula de comandos 5×3 con atajos visibles, colas de producción.

- **Botones rápidos:** colono ocioso, militar ocioso, campana de la aldea, ir a la Ciudadela.

- **Notificaciones:** "Estás siendo atacado" con ping en minimapa (tecla para saltar), era alcanzada, tecnología terminada, población al tope.

- **Feedback de órdenes:** marcador animado en el suelo, líneas de waypoints con Shift, contorno de selección, barras de PV sobre unidades (toggle), números de daño desactivados por defecto.

- El HUD es React montado como capa DOM sobre el canvas, pero lee el estado mediante una tienda de solo lectura actualizada a 10 Hz; nunca re-renderiza al ritmo del juego.

### 13.3 Controles (rejilla de atajos configurable)

| Acción                     | Control                                                   |
|----------------------------|-----------------------------------------------------------|
| Seleccionar / caja         | Clic izquierdo / arrastrar                                |
| Orden contextual           | Clic derecho                                              |
| Añadir a selección         | Shift + clic                                              |
| Todas del tipo en pantalla | Doble clic o Ctrl + clic                                  |
| Grupo de control           | Ctrl + 1–0 crear, 1–0 seleccionar, doble pulsación centra |
| Colono ocioso              | . (punto)                                                 |
| Ciudadela                  | H                                                         |
| Construir                  | Q (económico) / W (militar) + letra                       |
| Entrenar 5                 | Shift + clic en el botón                                  |
| Colocar varios edificios   | Shift al colocar                                          |
| Atacar-mover               | A + clic                                                  |
| Patrullar / Detener        | P / S                                                     |
| Campana                    | B                                                         |
| Mover cámara               | Flechas, borde de pantalla, botón central arrastrar       |
| Zoom                       | Rueda (3 niveles, como DE)                                |
| Pausa                      | F3 (single player o consenso)                             |

### 13.4 Accesibilidad y opciones

Calidad gráfica (Baja/Media/Alta/Ultra y autodetección), escala de UI, colores de jugador para daltonismo, subtítulos, volumen por canal (música, efectos, voces, UI), reasignación de teclas, desplazamiento de cámara, idioma (español e inglés en 1.0).

### 13.5 Onboarding

El Prólogo enseña en 25 minutos lo esencial; después se sugieren 3 "Desafíos de academia" (subir a Era del Hierro antes de 10 min, ganar a IA Fácil, defender una oleada). Tooltips de unidad con counters ("Fuerte contra / Débil contra").

### 13.6 Pantalla de fin de partida

Victoria/derrota con animación, puntuación por categoría (militar, economía, tecnología, sociedad), gráfico de línea temporal de población por jugador, tiempos de cada era, APM, cambio de rating, XP ganada, botones "Ver repetición" y "Revancha".

## 14. Retención y enganche

El objetivo es que el jugador quiera "una más": partidas que cierran bien, progreso visible tras cada una y motivos para volver mañana. Nada es pay-to-win; todo lo desbloqueable es cosmético o de prestigio.

| Sistema                 | Cómo funciona                                                                                                              | Motivación              |
|-------------------------|----------------------------------------------------------------------------------------------------------------------------|-------------------------|
| Rating ranked           | Glicko-2 visible como puntos (inicio 1000), ligas Hierro → Bronce → Plata → Oro → Éter → Corona, 10 partidas de colocación | Maestría y estatus      |
| Temporadas              | 3 meses; recompensa de estandarte y marco según liga final; mapa de temporada en rotación                                  | Regresar cada temporada |
| Nivel de cuenta         | XP por partida (victoria 100, derrota 40, primera del día ×2)                                                              | Progreso aunque pierdas |
| Desafío diario          | Escenario con semilla del día; tabla mundial de mejor tiempo; racha de días                                                | Hábito diario           |
| Misiones semanales      | 3 misiones (p. ej. "gana 2 partidas con Azhar", "convierte 10 unidades")                                                   | Variedad                |
| Maestría de facción     | Niveles por facción que desbloquean variantes de estandarte, retratos y frases de victoria                                 | Rejugar facciones       |
| Logros                  | 60 en 1.0 (campaña, ranked, curiosos)                                                                                      | Completismo             |
| Repeticiones y espectar | Toda partida queda guardada (semilla + comandos); compartir enlace                                                         | Aprender, comunidad     |
| Partidas cortas         | Guerra de Coronas 12–20 min, IA de partida rápida en un clic                                                               | Bajo costo de entrada   |
| Social                  | Amigos, invitar por enlace, estado en línea, chat de sala                                                                  | Jugar acompañado        |

**Métricas objetivo (beta):** retención D1 ≥ 35%, D7 ≥ 15%; tiempo hasta la primera partida \< 2 min; 3+ partidas por sesión en jugadores ranked; abandono en tutorial \< 30%. Se miden con telemetría propia anónima (eventos en MongoDB) y opt-out en opciones.

## 15. Arquitectura técnica

El juego es un monorepo TypeScript: una simulación determinista compartida, un cliente React + PixiJS servido como sitio estático, y un backend Node/Express con relay WebSocket desplegado en Render, con MongoDB Atlas y Redis.

<img src="media/image1.png" style="width:6in;height:4.00893in" alt="arquitectura · cliente, servicios de Render y MongoDB Atlas" />

arquitectura · cliente, servicios de Render y MongoDB Atlas

Solo viajan comandos entre la simulación y el relay; ningún servidor simula la partida, por eso el costo de servidor por partida es mínimo.

### 15.1 Stack

| Capa             | Tecnología                                                                              | Por qué                                                          |
|------------------|-----------------------------------------------------------------------------------------|------------------------------------------------------------------|
| Lenguaje         | TypeScript estricto en todo el monorepo                                                 | Tipos compartidos entre sim, cliente y servidor                  |
| Monorepo         | pnpm workspaces + Turborepo                                                             | Builds incrementales, paquetes sim, data, client, server, shared |
| Simulación       | TS puro sin dependencias, en Web Worker                                                 | Determinismo, no bloquea el render                               |
| Render           | PixiJS v8 (WebGL2, WebGPU cuando esté disponible) + shaders GLSL propios                | Miles de sprites a 60 fps, filtros, batching                     |
| UI               | React 19 + Vite + Zustand + Tailwind + Framer Motion                                    | Menús y HUD como capa DOM                                        |
| Audio            | Web Audio API vía Howler.js, buses por canal, audio espacial 2D                         | Música adaptativa y efectos posicionales                         |
| Backend          | Node 22 + Express 5 + ws (o uWebSockets.js si hace falta)                               | MERN pedido; WebSocket nativo                                    |
| Base de datos    | MongoDB Atlas (Mongoose)                                                                | Cuentas, partidas, repeticiones, rating                          |
| Cola y presencia | Render Key Value (Redis)                                                                | Matchmaking, sesiones, rate limit                                |
| Auth             | JWT en cookie httpOnly + refresh, login con email y Google/Discord OAuth; modo invitado | Cero fricción                                                    |
| Assets           | Atlas KTX2/Basis + WebP, audio Opus/WebM, servidos por CDN de Render Static Site        | Carga rápida                                                     |
| Tests            | Vitest, Playwright, tests headless de simulación                                        | Determinismo y regresión visual                                  |

### 15.2 Simulación determinista (packages/sim)

- **Tick fijo de 20 Hz** (50 ms de juego). Velocidad 1,7 → 34 ticks por segundo real. El render interpola entre los dos últimos estados a 60+ fps.

- **Punto fijo:** todas las posiciones, velocidades y daños en enteros (escala 1/1000 de casilla). Prohibidos Math.random, Math.sin/cos, Date.now y floats en la sim; trigonometría por tablas enteras.

- **PRNG** xoshiro128\*\* con semilla de partida.

- **ECS ligero** con arrays tipados (Structure of Arrays): posición, movimiento, salud, combate, recolección, producción, visión, propiedad. Orden de iteración por id ascendente.

- **Comandos** como única entrada: {turn, playerId, type, unitIds, target, payload}. La sim nunca lee input directo.

- **Hash de estado** (FNV-1a sobre componentes clave) cada turno; si difiere entre clientes → desync detectado, se envía dump para depurar.

- **Pathfinding:** A\* jerárquico sobre sectores 16×16 con portales (estilo openage) + flow fields por sector para grupos grandes + steering local (separación, evitación) para que las masas no se traben. Rutas cacheadas por destino.

- **Rendimiento:** 400 unidades en 1v1 ≤ 3 ms por tick; 1200 unidades en 4v4 ≤ 8 ms.

### 15.3 Red: lockstep con relay

- El cliente envía sus comandos al relay; el relay los agrupa por **turno de 200 ms** (4 ticks) y los difunde a todos; cada comando se ejecuta en el turno n+2. Si un cliente no envió su "turno listo", los demás esperan (pausa "Esperando a jugador").

- **Turno adaptativo:** el relay ajusta la duración del turno (100–400 ms) según el ping máximo y el cliente más lento, como en el AoE original.

- **Reconexión:** el relay guarda el log de comandos; el cliente que vuelve re-simula desde el inicio en modo rápido (o desde un snapshot cada 60 s) y se reincorpora.

- **Anti-trampa:** el relay valida forma y frecuencia de comandos, autoría (cada jugador solo manda sobre sus unidades) y compara hashes. El maphack es posible en lockstep; se mitiga ofuscando el estado en el worker y con reportes + revisión de repeticiones.

- **Repeticiones** gratis: semilla + versión de datos + lista de comandos (unos 100–300 KB por partida), guardadas en MongoDB/GridFS.

- **Partidas contra IA:** misma arquitectura sin red (relay local en el worker), así un solo camino de código.

### 15.4 Render 2.5D (packages/client/render)

- Proyección isométrica dimétrica 2:1, casilla de 128×64 px en zoom 1 (3 niveles de zoom: 0,6 / 1 / 1,4).

- **Terreno:** malla de chunks 16×16 con shader de splatting (mezcla suave de hasta 4 texturas por casilla, con máscaras de ruido) + normal map + sombreado por elevación; nada de bordes de tile visibles.

- **Sprites:** prerenderizados desde modelos 3D en 16 direcciones con mapas de color, normal, máscara de jugador y profundidad; iluminación dinámica 2D por normal map (sol fijo de hora dorada + luces puntuales de fuego y éter).

- **Agua:** shader con ondas, reflejo del cielo, espuma en costas, cascadas de éter.

- **Vegetación:** árboles con balanceo por viento en vértices, caída animada al talar, tocones.

- **Partículas:** polvo al caminar, chispas en combate, humo e incendio en edificios dañados, brillo de éter, escombros al destruir.

- **Post-proceso:** bloom suave para el éter, viñeta, color grading por bioma, niebla de guerra con desenfoque.

- **Orden de profundidad** por (y + x + altura) con buckets; culling por cámara; batching por atlas.

- **Calidades:** Baja (sin normal maps ni post), Media, Alta, Ultra (sombras suaves de nubes, partículas ×2).

### 15.5 Backend y despliegue en Render

| Servicio Render | Tipo                                        | Contenido                                                                        |
|-----------------|---------------------------------------------|----------------------------------------------------------------------------------|
| reinos-web      | Static Site (CDN)                           | Cliente compilado y assets con hash                                              |
| reinos-api      | Web Service (Node)                          | REST: auth, perfiles, partidas, repeticiones, tablas, desafío diario             |
| reinos-relay    | Web Service (Node, WebSocket)               | Lobbies, matchmaking, relay lockstep; plan pago (sin suspensión por inactividad) |
| reinos-kv       | Key Value (Redis)                           | Colas de matchmaking, presencia, sesiones                                        |
| MongoDB Atlas   | Externo (Render no ofrece Mongo gestionado) | Datos persistentes                                                               |

- El plan gratuito de Render suspende servicios inactivos: para una experiencia de "entro y juego" el relay y la API deben ir en instancias pagas; la Static Site puede ser gratis.

- render.yaml (Blueprint) define todo como código; CI con GitHub Actions corre tests y despliega en push a main; previews por pull request.

- Escalado: un relay Node maneja ~200 partidas simultáneas (el tráfico es mínimo); para escalar, varios relays con asignación de partida por Redis.

## 16. Dirección de arte y audio

El objetivo visual es 8,5/10 medido contra AoE2 DE y Age of Mythology Retold en capturas lado a lado. La calidad viene de tres cosas: buenos modelos 3D, un pipeline de prerenderizado consistente y shaders que dan vida (luz, agua, viento, partículas). El código puede generar mucho, pero los modelos base deben conseguirse o comprarse: es la mayor dependencia externa del proyecto.

### 16.1 Pipeline de assets (automatizado)

1.  **Modelos 3D fuente** (.glb/.blend) por unidad y edificio, con variantes por facción y por era.

2.  **Blender headless** (blender -b -P render_sprites.py) con una escena estándar: cámara ortográfica a 30° de elevación (proyección 2:1), luz de estudio neutra, renders de 16 direcciones × cada animación a 12–15 fps.

3.  **Salidas por frame:** color (albedo con oclusión), normal map, máscara de color de jugador, profundidad y sombra proyectada separada.

4.  **Empaquetado:** atlas por unidad (TexturePacker libre o free-tex-packer-core), compresión KTX2/Basis con fallback WebP, JSON de animaciones.

5.  **Validación automática:** tamaño en pantalla, centro de pivote, consistencia de luz, presupuesto de memoria por atlas.

### 16.2 Fuentes de modelos (en orden de preferencia)

| Fuente                                                                                                               | Licencia                | Uso                                                                   |
|----------------------------------------------------------------------------------------------------------------------|-------------------------|-----------------------------------------------------------------------|
| Packs comprados (Synty Polygon Fantasy Kingdom, packs medievales de Unity/Fab/itch.io con licencia de uso en juegos) | Comercial               | Base de edificios y unidades; retexturizados con paleta propia        |
| Quaternius, Kenney, Poly Pizza                                                                                       | CC0                     | Props, árboles, animales, prototipos                                  |
| Mixamo                                                                                                               | Gratis con cuenta Adobe | Rigs y animaciones humanoides                                         |
| Generación 3D asistida por IA (herramientas que elija el dueño) + retoque en Blender                                 | Según servicio          | Variantes de facción, unidades únicas                                 |
| 0 A.D.                                                                                                               | CC BY-SA                | Solo como referencia de proporciones; no se mezcla por su share-alike |

Un estilo coherente importa más que el polígono: todas las fuentes pasan por el mismo shader de render (paleta, rim light, contorno sutil) para unificarlas.

### 16.3 Guía de estilo

- Proporciones "heroicas" ligeramente exageradas (cabezas y armas 10% más grandes) para leer a distancia, como en los RTS modernos.

- Color de jugador en un 20–30% de la superficie visible de cada unidad.

- Edificios con 3 variantes de era y 2 de daño; humo y fuego como partículas, no en el sprite.

- Biomas: templado, nevado, desértico, pantano de ceniza, cada uno con 6–8 texturas de terreno tileables de 1024 px y su LUT de color.

- UI: marcos de metal envejecido y pergamino, iconos pintados 64 px, tipografía serif para títulos (Cinzel u otra libre) y sans legible para datos (Inter).

### 16.4 Audio

- **Música:** 1 tema principal de menú, 2 pistas por facción (calma y combate) y música adaptativa que sube de intensidad cuando hay combate en pantalla. Fuentes: compositor contratado, librerías con licencia o música generada con herramientas que el dueño tenga derecho a usar.

- **Voces de unidad:** frases cortas (selección, orden, ataque) en idiomas inventados por facción; 4–6 variantes por tipo. Pueden grabarse o sintetizarse con TTS con licencia comercial y post-proceso.

- **Efectos:** tala, minería, construcción, choques de acero, flechas, impactos de asedio, derrumbes, campana, fanfarria de era, Resonancia del Custodio. Fuentes: Freesound (CC0/CC BY con créditos), Sonniss GDC bundles (libres de regalías), diseño propio.

- **Mezcla:** buses (música, efectos, voces, UI, ambiente), atenuación por distancia a la cámara, límite de voces simultáneas por tipo (p. ej. máx. 6 sonidos de espada), ducking de música en alertas.

- **Alertas sonoras:** "Ataque en la aldea", "Ataque en el ejército", "Era alcanzada", "Población al máximo" como sonidos distintos y reconocibles.

### 16.5 Criterio de aceptación visual

Antes de cerrar cada fase con contenido visual se hace una revisión con capturas de referencia: un subagente revisor (que no hizo el trabajo) puntua 1–10 en legibilidad, cohesión, riqueza y "wow". Se requiere ≥ 8 en cada eje; si no, se itera.

## 17. Rendimiento, calidad y testing

### 17.1 Presupuestos

| Métrica                           | Objetivo                                                    | Hardware de referencia                                      |
|-----------------------------------|-------------------------------------------------------------|-------------------------------------------------------------|
| FPS en partida 1v1 (400 unidades) | ≥ 60 en Alta                                                | Portátil con GPU integrada Intel Iris Xe / AMD 680M, Chrome |
| FPS en 4v4 (1200 unidades)        | ≥ 45 en Media                                               | Mismo                                                       |
| Tick de simulación                | ≤ 3 ms (1v1), ≤ 8 ms (4v4)                                  | Worker en CPU de 4 núcleos                                  |
| Descarga hasta el menú            | ≤ 8 MB                                                      | 50 Mbps                                                     |
| Tiempo hasta el menú              | ≤ 6 s                                                       | 50 Mbps, caché vacía                                        |
| Descarga total de una partida     | ≤ 120 MB (bioma + 2 facciones), cacheado con Service Worker | —                                                           |
| Memoria GPU                       | ≤ 1 GB en Alta                                              | —                                                           |
| Latencia de orden en multijugador | ≤ 300 ms percibida (con feedback inmediato de UI)           | Ping 80 ms                                                  |

### 17.2 Estrategia de tests

- **Unitarios (Vitest):** fórmulas (daño, construcción, comercio), modificadores, colas, pathfinding.

- **Determinismo:** la misma partida (semilla + comandos) produce el mismo hash final en Node, Chrome, Firefox y Safari (Playwright). Cualquier diferencia rompe el build.

- **Calibración económica:** un "bot de build order" ejecuta scouts (Era del Hierro con 21 de población alrededor de 7:55–8:30 de juego) y fast castle (Bastiones alrededor de 16:00–16:30); tolerancia ±15 s.

- **Balance:** torneos headless IA vs IA de 1000 partidas por par de facciones (§10).

- **Rendimiento:** escenas de carga fija (400 y 1200 unidades) medidas en CI con tope de regresión del 10%.

- **Regresión visual:** capturas de escenas de referencia comparadas con umbral de diferencia.

- **E2E:** registrarse, jugar partida rápida, entrar a cola ranked con 2 clientes, ver repetición.

- **Carga:** 200 partidas simultáneas simuladas contra el relay.

### 17.3 Observabilidad

Logs estructurados (pino), métricas del relay (partidas activas, ping, desyncs), reportes de desync con dump de estado, Sentry (o equivalente libre) para errores de cliente y servidor.

## 18. Esquemas de datos, modelos y API

### 18.1 Datos de juego (packages/data, validados con Zod)

{  
"id": "caballero",  
"name": { "es": "Caballero", "en": "Knight" },  
"building": "establo", "age": 3,  
"cost": { "food": 60, "aether": 75 }, "trainTime": 30,  
"hp": 100, "speed": 1.35, "los": 4, "reload": 1.8,  
"attacks": { "melee": 10 },  
"armors": { "melee": 2, "pierce": 2, "cavalry": 0 },  
"classes": \["cavalry"\], "upgradesTo": "caballero_real",  
"sprite": "units/knight", "voice": "cavalry_heavy"  
}

Archivos: resources.json, economy.json, ages.json, units.json, buildings.json, techs.json, upgrades.json, factions/\*.json, maps/\*.json, ai/\*.json, campaigns/\*/\*.json, i18n/\*.json. Una versión de datos (dataVersion) se graba en cada partida y repetición.

### 18.2 Modelos MongoDB

| Colección        | Campos principales                                                                                         |
|------------------|------------------------------------------------------------------------------------------------------------|
| users            | email, passwordHash, oauth, displayName, avatar, level, xp, settings, cosmetics, createdAt                 |
| ratings          | userId, queue (1v1, team, coronas), season, rating, rd, volatility, wins, losses, league                   |
| matches          | mode, map, seed, dataVersion, players\[{userId, faction, team, result, ratingDelta}\], duration, startedAt |
| replays          | matchId, commands (GridFS, comprimido), hashes, size                                                       |
| campaignProgress | userId, campaign, mission, difficulty, medal, bestTime                                                     |
| dailyChallenges  | date, seed, scenario, leaderboard\[{userId, time}\]                                                        |
| quests           | userId, week, quests\[{id, progress, done}\]                                                               |
| achievements     | userId, achievementId, unlockedAt                                                                          |
| friends          | userId, friendId, status                                                                                   |
| reports          | reporterId, matchId, reason, status                                                                        |
| telemetry        | event, userId (anónimo), payload, ts (TTL 90 días)                                                         |

### 18.3 API REST (/api/v1)

| Método y ruta                                                              | Función                                                                       |
|----------------------------------------------------------------------------|-------------------------------------------------------------------------------|
| POST /auth/register, /auth/login, /auth/guest, /auth/refresh, /auth/logout | Autenticación                                                                 |
| GET /me, PATCH /me/settings                                                | Perfil                                                                        |
| GET /leaderboard?queue=&season=                                            | Tablas                                                                        |
| GET /matches?user=, GET /matches/:id                                       | Historial                                                                     |
| GET /replays/:matchId                                                      | Descarga de repetición                                                        |
| GET /daily, POST /daily/result                                             | Desafío diario (resultado validado re-simulando la repetición en el servidor) |
| GET/POST /campaign/progress                                                | Progreso                                                                      |
| GET /quests, GET /achievements                                             | Progresión                                                                    |
| POST /reports                                                              | Denuncias                                                                     |

### 18.4 Protocolo WebSocket del relay (mensajes JSON, luego binario con MessagePack)

hello{token} → lobby.create/join/leave/ready/config → queue.join/leave → match.found{matchId, seed, players} → match.loaded → turn{n, cmds\[\]} (cliente→relay) → turn.exec{n, cmds\[\], turnMs} (relay→todos) → hash{n, h} → chat → match.end{result}.

## 19. Legal, riesgos y glosario

### 19.1 Propiedad intelectual (no es asesoría legal)

- Las reglas y mecánicas de juego (fórmulas, tasas, estructura de eras) en general no se protegen por copyright; los assets, textos, música, sonidos, logotipos y el nombre "Age of Empires" sí (son de Microsoft). Por eso Reinos de Ceniza usa nombres, arte, audio y textos propios.

- No se copian descripciones, frases de unidades, ni el sonido "Wololo"; no se usa ningún asset extraído de AoE2.

- Cada asset de terceros se registra en ASSETS_LICENSES.md con fuente, licencia y atribución. Se evita material CC BY-SA en assets mezclados para no contagiar la licencia.

- Antes de monetizar o hacer marketing, conviene una revisión con un abogado de propiedad intelectual.

### 19.2 Riesgos

| Riesgo                          | Impacto | Mitigación                                                                           |
|---------------------------------|---------|--------------------------------------------------------------------------------------|
| Calidad de arte por debajo de 8 | Alto    | Presupuesto para packs comprados; pipeline único de render; revisión visual por fase |
| Desyncs entre navegadores       | Alto    | Punto fijo, tests de hash cross-browser en CI, dump de estado                        |
| Rendimiento con 1000+ unidades  | Alto    | SoA, worker, flow fields, culling, calidades gráficas                                |
| Alcance enorme                  | Alto    | Fases con entregables jugables; contenido como datos                                 |
| Costos de Render y Atlas        | Medio   | Static Site gratis; relay liviano; escalar con demanda                               |
| Safari / WebGL dispar           | Medio   | WebGL2 como base, tests en WebKit con Playwright                                     |
| Trampas (maphack)               | Medio   | Ofuscación, reportes, revisión de repeticiones                                       |
| Comunidad pequeña para ranked   | Medio   | IA de relleno, modos rápidos, desafío diario                                         |

### 19.3 Glosario rápido

**Lockstep:** todos los clientes ejecutan la misma simulación con los mismos comandos. **Relay:** servidor que solo reenvía comandos. **Desync:** dos clientes con estados distintos. **Punto fijo:** números enteros escalados para evitar diferencias de floats. **Flow field:** campo de direcciones que guía a muchas unidades hacia un destino. **SoA:** estructura de arrays tipados por componente. **Splatting:** mezcla de texturas de terreno por shader.
