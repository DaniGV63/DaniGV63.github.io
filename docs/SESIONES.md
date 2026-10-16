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
