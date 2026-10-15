# F1 Race Analysis — especificación

> Estado: **primera iteración implementada** con la carrera final del GP de Abu Dabi 2021 (`src/data/f1/2021-abu-dhabi-grand-prix-r/`). La forma de la Vista A es provisional y se afinará por iteraciones con Dani (ver "Pendiente de confirmar").

## 1. Objetivo del proyecto

Mostrar en una sola página el ciclo completo de datos:

1. **Ingeniería de datos:** pipeline en Python (FastF1 + pandas) que descarga, limpia, reduce y exporta los datos a JSON.
2. **Programación:** visualización interactiva propia en D3, con dos vistas enlazadas.
3. **Análisis estadístico:** una pregunta concreta con respuesta cuantitativa (ver §5).
4. **Comunicación:** texto breve en inglés que explica qué se ve y qué se concluye, con limitaciones.

## 2. Vistas (layout escritorio: dos columnas; móvil: apiladas)

### Vista A — izquierda: tiempos por vuelta y sector (interpretación provisional)

- Cada **línea** representa **una vuelta** de la carrera (≈ 50–70 vueltas).
- Eje X: los **sectores** (S1, S2, S3) o el tiempo acumulado dentro de la vuelta, por piloto.
- Eje Y: tiempo de sector / piloto (a confirmar).
- Interacción: hover resalta la vuelta y muestra tooltip (vuelta, piloto, S1/S2/S3, tiempo total, compuesto de neumático). **Click selecciona la vuelta** y actualiza la Vista B.
- Filtro: selector de piloto(s) (por defecto: los 3 primeros clasificados).

### Vista B — derecha: mapa del circuito

- Trazado del circuito dibujado con las coordenadas X/Y de la telemetría (así es interactivo y exacto).
- Al seleccionar una vuelta: dibuja la trayectoria del piloto seleccionado en esa vuelta, **coloreada por sector** (o por velocidad, a decidir), y marca los límites de sector.
- Si hay varios pilotos seleccionados: indicar qué piloto fue más rápido en cada sector de esa vuelta.

### Enlace entre vistas

- Estado compartido mínimo: `{ selectedLap, selectedDrivers[] }`.
- Teclado: flechas izquierda/derecha cambian de vuelta (accesibilidad).

## 3. Contrato de datos (salida del pipeline)

Ruta: `src/data/f1/<year>-<event-slug>-<session>/`

```
meta.json            # carrera, circuito, pilotos, colores neutrales, nº vueltas, fecha de generación
laps.json            # tiempos por vuelta y sector (carga inicial, pequeño)
track.json           # contorno del circuito + límites de sector + rotación
pos/<DRIVER>.json    # trayectoria por vuelta de un piloto (se carga bajo demanda)
```

### meta.json
```json
{
  "year": 2025, "event": "TODO", "session": "R",
  "circuit": "TODO", "totalLaps": 0,
  "drivers": [{ "code": "VER", "name": "Max Verstappen", "team": "Red Bull Racing", "teamColor": "#3671C6", "finish": 1 }],
  "source": "FastF1 3.8.x", "generatedAt": "ISO-8601"
}
```

### laps.json  (array plano, una fila por piloto y vuelta)
```json
[{ "driver": "VER", "lap": 1, "s1": 31.234, "s2": 40.112, "s3": 22.901,
   "lapTime": 94.247, "compound": "MEDIUM", "tyreLife": 1, "pitIn": false, "pitOut": false,
   "isAccurate": true, "position": 1, "trackStatus": "1" }]
```
- Tiempos en **segundos** (float, 3 decimales). `null` si falta el dato.
- Mantener `isAccurate` de FastF1 para poder filtrar vueltas no representativas (safety car, boxes).

### track.json
```json
{ "outline": [[x, y], ...], "sectorBoundaries": [[x, y], [x, y]], "rotationDeg": 0,
  "corners": [{ "number": "1", "x": 0, "y": 0 }] }
```

### pos/<DRIVER>.json
```json
{ "driver": "VER", "laps": { "1": { "p": [x0, y0, x1, y1, ...], "s": [i2, i3] } } }
```
- `p` es una lista plana de pares x,y; `s` son los índices de punto (no de valor) donde empiezan S2 y S3.
- Los límites de sector se calculan como fracción de distancia recorrida en la vuelta más rápida y se reutilizan en todas las vueltas.
- **Downsampling** obligatorio (p. ej. un punto cada ~20 m de distancia, o ~150–250 puntos por vuelta).
- Coordenadas redondeadas a enteros.

**Límites de tamaño:** `laps.json` < 300 KB; cada `pos/<DRIVER>.json` < 150 KB; total por carrera < 2 MB.

## 4. Pipeline (`pipeline/f1/build_f1_data.py`)

- CLI: `--year`, `--event`, `--session` (por defecto `R`), `--out` (por defecto `src/data/f1/`).
- Caché de FastF1 en `pipeline/.fastf1-cache/` (ignorada en git).
- Pasos: cargar sesión → validar → limpiar (tipos, segundos, nulos) → downsampling → exportar JSON → imprimir resumen (filas, tamaños, vueltas descartadas).
- **Validaciones** que hacen fallar el script: pilotos sin vueltas, sectores negativos, `s1+s2+s3` muy distinto de `lapTime` en vueltas `isAccurate`, archivos por encima del límite de tamaño.
- Tests mínimos con `pytest` sobre las funciones puras (conversión de tiempos, downsampling, validaciones).
- Se ejecuta **en local**; los JSON se commitean. No hace falta ejecutarlo en GitHub Actions.

## 5. Análisis y texto (comunicación)

- Una pregunta concreta, p. ej.: *"Where did the winner gain time over P2: in which sector and in which stint?"* o *"How much did lap times degrade per lap of tyre age, by compound?"* (Dani elige).
- Método sencillo y explicado (p. ej. diferencias medias por sector en vueltas `isAccurate`; regresión lineal de tiempo de vuelta sobre edad del neumático por compuesto, con intervalo de confianza).
- Resultado en 2–3 frases para no técnicos + limitaciones (safety car, tráfico, combustible).

## 6. Pendiente de confirmar con Dani

- [ ] Forma exacta de la Vista A (ejes) — Dani comparte la visualización de referencia.
- [x] Carrera y año: GP de Abu Dabi 2021, carrera (Dani, 15-oct-2026).
- [ ] Color de la trayectoria: por sector o por velocidad.
- [ ] Pregunta de análisis del §5.

## 7. Branding y aviso legal

- Branding de F1 permitido: logo de F1, logos de equipo, colores de equipo y estilo tipo retransmisión (ver CLAUDE.md §4).
- Assets oficiales en `public/f1/` (los aporta Dani). Colores de equipo: `teamColor` en `meta.json`, obtenido de `fastf1.plotting`.
- Aviso obligatorio en el pie de la página:

> Data via the open-source FastF1 library. This is an unofficial, non-commercial project and is not associated with Formula 1. F1 and related marks are trademarks of Formula One Licensing B.V.
