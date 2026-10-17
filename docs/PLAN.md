# PLAN.md — fases del proyecto

Marcar con [x] al terminar. Cada fase acaba con `npm run build` sin errores y un push que despliega.

## Fase 0 — Puesta en marcha
- [x] Crear en GitHub el repo público **`DaniGV63.github.io`** y hacer el primer push de este esqueleto.
- [x] GitHub → Settings → Pages → Source: **GitHub Actions**.
- [x] Comprobar que `https://danigv63.github.io` muestra la página provisional.

## Fase 1 — Home y diseño base
- [x] Decidir dirección visual: **C — Engineering grid** (Inter + JetBrains Mono, acento teal).
- [x] `BaseLayout`: cabecera, navegación, pie con enlaces, modo claro/oscuro, metadatos SEO y Open Graph.
- [x] Home: titular + 3 tarjetas de proyecto + experiencia resumida + enlaces (CV PDF, GitHub, LinkedIn, email).
- [x] CV en PDF en `public/cv/` (versión pública sin teléfono, dirección ni edad).

## Fase 2 — Proyecto estrella: F1
- [x] Spec confirmada por iteraciones con Dani: Abu Dabi 2021, pregunta general sobre todos los pilotos (`docs/F1_SPEC.md`).
- [x] Pipeline Python + tests + JSON generados y commiteados (Abu Dabi 2021, 1.4 MB).
- [x] Vistas enlazadas en D3: explorador de sectores y comparación vuelta a vuelta con circuito 2D/3D.
- [x] Texto del análisis (pregunta, método, resultado, limitaciones) + aviso legal.
- [x] Revisión a 375 px y escritorio, teclado y alternativa textual (Lighthouse queda para la Fase 4).

## Fase 3 — Experiencia y resto de proyectos
- [ ] Caso de estudio Mática Partners.
- [ ] Caso de estudio Endesa.
- [ ] Tarjeta/página BotLLM (enlace al repo).
- [ ] Tarjeta/página publicación MDPI.

## Fase 4 — Pulido y lanzamiento
- [x] Lighthouse ≥ 90 en Performance, Accessibility, Best Practices y SEO (móvil: home 99/100/100/100, F1 96/100/100/100, Energinet 97/100/100/100).
- [x] Revisar todos los enlaces (internos contra el build, externos con petición real).
- [x] Imagen Open Graph (`public/og.png`), `robots.txt`, `sitemap.xml`, JSON-LD y 404 con noindex.
- [ ] Añadir el enlace al CV, a LinkedIn (Featured) y al perfil de GitHub.

## Más adelante
- [x] Proyecto "Danish Power System" (Energinet, con Aarhus): pipeline programado, clusters y modelo, página interactiva (ver docs/SESIONES.md).
- [ ] Dominio propio (opcional, ~10 €/año).

## Decisiones abiertas (preguntar a Dani)
- Dirección visual: colores, tipografía, ¿foto en la home?
- Carrera de F1 y pregunta de análisis.
- Assets de F1 para `public/f1/` (logo de F1 y logos de equipo).
- Texto exacto del titular de la home.
