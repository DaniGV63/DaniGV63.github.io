# SESIONES.md — registro de trabajo

## Sesiones del 9 al 16 de octubre de 2026

### Qué se hizo

**Puesta en marcha (Fase 0)**
- Node 24 LTS en `.nvmrc` y en CI; entorno conda `portfolio-f1` (`pipeline/environment.yml`).
- Repo público `DaniGV63/DaniGV63.github.io`, GitHub Pages con Actions, despliegue en cada push a `main`.

**Diseño base y home (Fase 1)**
- Dirección visual C ("Engineering grid"): Inter + JetBrains Mono, acento teal, modo claro/oscuro con `light-dark()`.
- Home completa: hero con foto, cuatro pruebas, trabajos, experiencia, toolbox, formación, idiomas y contacto.
- CV público sin teléfono, dirección ni edad en `public/cv/`; los originales viven en `cv_dani/` (ignorada por git).
- Titular y botones (CV, LinkedIn, Mail); idiomas con francés básico.

**Proyecto F1 (Fase 2, Abu Dabi 2021, carrera)**
- Pipeline FastF1 → JSON estático (`pipeline/f1/`), con tests y límites de tamaño (1.4 MB en total).
- Tiempos por parte de vuelta integrando la velocidad de telemetría (las posiciones X/Y tenían ruido).
- Página `/projects/f1-race-analysis/`:
  - selector compartido de pilotos con colores asignados para que se distingan;
  - comparación vuelta a vuelta con 25 partes por vuelta, marcas S1/S2/S3 y circuito 2D con barrido y coche;
  - vista 3D con todas las vueltas apiladas (órbita, zoom y desplazamiento);
  - gráfica "Race pace" (tiempo por vuelta o diferencia acumulada, con safety car y cambios de neumáticos);
  - texto "Reading the race" con Question / Approach / Result / Limitations / Next, con cifras calculadas en el build.
- Logos de F1 y de los equipos de 2021 (fuentes en `docs/F1_LOGOS.md`).
- Tarjeta de F1 en la home como banner, con el resultado en una frase.

### Resultado del análisis
Entre los 14 pilotos que terminaron, Hamilton ganó el 22 % de las partes que disputó, Verstappen el 19 % y Bottas el 11 %. Las diferencias son mayores cerca de T14, T6 y T5. Sin vueltas de boxes ni de safety car el podio de partes es el mismo.

### Decisiones tomadas
- Solo inglés en la web; tono modesto y sin datos personales.
- Se comparan solo los pilotos que terminaron; cuentan todas las vueltas.
- La fuente oficial de F1 es propietaria: se usa Saira (OFL) como la más parecida.
- Los commits y el push solo se hacen cuando Dani los pide.

## Qué falta

**Fase 2 (cierre)**
- Revisar la Vista A/B con la referencia final de Dani si cambia.
- Decidir si se mantiene el logo duplicado (título de la página y cabecera bajo el selector).

**Fase 3 — experiencia y proyectos**
- Casos de estudio de Mática Partners y Endesa. Falta una entrevista corta con Dani: Data, Approach, Limitations y Next de cada uno.
- BotLLM y MDPI son por ahora tarjetas con enlace externo; decidir si llevan página propia.

**Fase 4 — pulido y lanzamiento**
- Lighthouse ≥ 90 en las cuatro categorías (home y F1).
- Imagen Open Graph, `robots.txt` y sitemap.
- Revisar enlaces en ventana privada y en móvil.
- Enlazar la web desde el CV, LinkedIn (Featured) y el perfil de GitHub.

**Pendientes menores**
- El CV público todavía menciona "Danish" (Dani pidió dejarlo así por ahora).
- Certificaciones y Private Tutor no están en la home.
- Revisar el aviso sobre marcas registradas (logos de F1 y equipos) en el repo público.
- Más adelante: proyecto "Danish electricity" (Energinet) y dominio propio.

## Sesión del 16 de octubre de 2026 (tarde): Danish Power System

### Qué se hizo
- Banners para las tarjetas de BotLLM y del paper EMG (`BotBanner`, `EmgBanner`), publicados.
- Nuevo proyecto **Danish Power System** (datos abiertos de Energinet + Aarhus), que aplica a datos públicos el método de Endesa:
  - `pipeline/energinet/`: descarga con reintentos (la API limita el ritmo), tabla horaria de DK2, clustering (PCA + K-Means con silhouette), horas atípicas y un modelo que detecta horas de inercia baja respecto a los 30 días previos. 22 tests en `pipeline/tests/`.
  - `src/data/energinet/`: `meta.json` y `hours.json` generados.
  - Página `/projects/danish-grid/` con gráfico interactivo (canvas + D3), tabla de tipos de hora, gráficos de Aarhus, informe del último día completo y sección sobre Endesa.
  - Tarjeta con banner en la home y entrada en `profile.json`.
  - Workflow `.github/workflows/refresh-energinet.yml`: actualización diaria gratuita y despliegue explícito.
- `FUSE/` (trabajo interno de Endesa) añadida a `.gitignore`; no se ha copiado nada de ahí.

### Resultados (cifras reales)
- 13 841 horas; 3 tipos de hora, separación débil (silhouette 0,22).
- Inercia de DK2 un 20 % menor en horas de mucho viento y sol (5,6 vs 6,9 GWs).
- Modelo de inercia baja: AUC 0,757 → 0,776 al añadir viento y sol (precisión media +11 %; azar 0,12).
- Aarhus: mediana de cobertura renovable local del 11 %, sin relación con el viento nacional (r ≈ −0,07).

### Decisiones y límites
- Aarhus está en DK1; la inercia y las reservas son del sistema nórdico (DK2). Se explica en la página.
- Los tramos de ≥ 24 h en cero de Aarhus se excluyen (1 435 h); causa desconocida.
- Primer modelo con umbral fijo falló (AUC 0,45) por un cambio de nivel de la inercia en 2026; se rehízo con umbral relativo.

### Qué falta
- Probar el workflow diario en GitHub (no se puede probar en local) y revisar el primer commit automático.
- Fase 3: caso de estudio de Mática; Fase 4: Lighthouse, Open Graph, sitemap.


## Fase 4 (17 de octubre de 2026)

- Retoque "menos plantilla" publicado en `main`: Schibsted Grotesk en lugar de Inter, etiquetas en frase normal, tecnologías en texto corrido, cifras sin fuente monoespaciada. Ramas `design-original`, `design-original-tweaks` y `design-circuit` guardadas.
- Lighthouse móvil (antes → después): home 98 → 99; F1 93/99 → 96/100; Energinet 94 → 97. CLS de F1 de 0,129 a 0,001 reservando el espacio de los chips y del gráfico; logos de F1 de 316 KB a 26 KB; CSS en línea; encabezados de F1 en orden.
- SEO: imagen Open Graph 1200x630 (curva real de inercia), `twitter:card` grande, JSON-LD de persona, `robots.txt`, `sitemap.xml`, 404 con noindex.
- Enlaces comprobados: 0 rotos.
- Pendiente (de Dani): poner el enlace de la web en el CV, en LinkedIn (Destacados) y en el perfil de GitHub.
