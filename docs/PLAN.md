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
- [ ] CV en PDF en `public/cv/` (versión **sin teléfono ni dirección**). **Provisional:** el PDF actual contiene teléfono, dirección y edad; sustituir por la versión pública antes de commitearlo.

## Fase 2 — Proyecto estrella: F1
- [ ] Confirmar la spec con la visualización de referencia (`docs/F1_SPEC.md` §6).
- [ ] Pipeline Python + tests + JSON generados y commiteados.
- [ ] Vista A + Vista B enlazadas en D3.
- [ ] Texto del análisis (pregunta, método, resultado, limitaciones) + aviso legal.
- [ ] Revisión móvil y accesibilidad.

## Fase 3 — Experiencia y resto de proyectos
- [ ] Caso de estudio Mática Partners.
- [ ] Caso de estudio Endesa.
- [ ] Tarjeta/página BotLLM (enlace al repo).
- [ ] Tarjeta/página publicación MDPI.

## Fase 4 — Pulido y lanzamiento
- [ ] Lighthouse ≥ 90 en Performance, Accessibility, Best Practices y SEO.
- [ ] Revisar todos los enlaces en ventana privada y en móvil.
- [ ] Añadir el enlace al CV, a LinkedIn (Featured) y al perfil de GitHub.

## Más adelante
- [ ] Proyecto "Danish electricity" (Energinet): pipeline programado + análisis de series temporales.
- [ ] Dominio propio (opcional, ~10 €/año).

## Decisiones abiertas (preguntar a Dani)
- Dirección visual: colores, tipografía, ¿foto en la home?
- Carrera de F1 y pregunta de análisis.
- Assets de F1 para `public/f1/` (logo de F1 y logos de equipo).
- Texto exacto del titular de la home.
