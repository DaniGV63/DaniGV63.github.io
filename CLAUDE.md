# CLAUDE.md — Portfolio de Daniel Gómez Verde

Este archivo es la guía permanente para Claude Code en este repo. Léelo entero antes de cada tarea.

## 1. Qué es este proyecto

Web portfolio personal de **Daniel (Dani) Gómez Verde**, Data & AI Engineer y estudiante del MSc in Data Science (Finance & FinTech) en Aarhus University.

- **Para quién:** reclutadores y responsables técnicos de empresas en Aarhus/Dinamarca que buscan un estudiante part-time en data/IA. Se envía junto al CV.
- **Objetivo:** que en **60 segundos** alguien entienda quién es Dani, qué sabe hacer (ingeniería de datos, programación, estadística, comunicación) y pueda abrir un proyecto concreto.
- **Idea central:** el gráfico interactivo de una carrera de Fórmula 1 es el proyecto estrella y demuestra el ciclo completo: pipeline de datos en Python → datos estáticos → visualización interactiva → interpretación por escrito.

## 2. Decisiones fijadas (no cambiar sin preguntar a Dani)

| Tema | Decisión |
|---|---|
| Framework | **Astro 7**, salida 100% estática (`output: 'static'`) |
| Hosting | **GitHub Pages**, repo `DaniGV63.github.io` → `https://danigv63.github.io` (sin `base`) |
| Despliegue | GitHub Actions (`.github/workflows/deploy.yml`) en cada push a `main` |
| Idioma de la web | **Solo inglés** (todo el texto visible). Hablar con Dani en **español** |
| Gráfico F1 | **D3.js** (v7), cargado solo en la página de F1 |
| Datos F1 | **FastF1** en Python, ejecutado **en local**; el resultado se guarda como JSON en `src/data/f1/` y se commitea. Nada de Python en el servidor ni en el navegador |
| Coste | 0 € de hosting. Nada que requiera servidor, base de datos ni servicios de pago |
| Node | **24 LTS** (ver `.nvmrc`; Astro exige >= 22.12). CI usa la misma versión |

## 3. Contenido del lanzamiento (v1)

1. **Home** (una página escaneable): titular, 3 tarjetas de proyecto, experiencia resumida, enlaces (CV, GitHub, LinkedIn, email).
2. **F1 race analysis** — proyecto estrella (página propia). Spec en `docs/F1_SPEC.md`.
3. **Experiencia como casos de estudio**: Mática Partners y Endesa (página propia cada uno o una página "Experience").
4. **BotLLM** (full-stack, enlace a GitHub) y **paper MDPI** (investigación).

5. **Danish Power System** (datos abiertos de Energinet, con la región de Aarhus): pipeline en `pipeline/energinet/`, actualización diaria con GitHub Actions (`refresh-energinet.yml`). Aplica a datos públicos el método de Endesa. No se usa nada de la carpeta `FUSE/` (interna, ignorada por git).

## 4. Reglas de contenido (MUY IMPORTANTES)

- **Única fuente de verdad:** `src/data/profile.json` y `docs/CONTENT.md`. Todo texto sobre Dani sale de ahí.
- **Nunca inventes** experiencias, métricas, tecnologías, clientes, citas ni resultados. Si falta un dato, **pregunta a Dani** y deja `TODO(dani): ...` visible en el código, nunca en la web publicada.
- **Datos personales:** en la web pública solo email, LinkedIn y GitHub. **No** publicar teléfono, dirección ni edad.
- **Clientes (PepsiCo, UN Tourism, Endesa…):** describir solo a alto nivel, como en el CV. Sin datos, capturas, código ni documentos de clientes.
- **Fórmula 1 — branding permitido (decisión de Dani):** la página F1 puede usar la identidad visual de F1: logo de F1, logos de equipos, colores oficiales de equipo y estética tipo retransmisión. Los logos e imágenes oficiales se guardan en `public/f1/` y **los aporta Dani** (no los redibujes ni los generes en SVG). Para colores de equipo usa los de `fastf1.plotting` exportados en `meta.json`. Mantén siempre en el pie de la página el aviso: *"Data via the open-source FastF1 library. This is an unofficial, non-commercial project and is not associated with Formula 1. F1 and related marks are trademarks of Formula One Licensing B.V."*
- **Tono (inglés):** directo, concreto, modesto, sin lenguaje de ventas. Prohibido: "passionate", "thrilled", "leverage", "cutting-edge", "results-driven", "synergy". Frases cortas, verbos de acción, números reales.
- Cada caso de estudio sigue esta estructura: **Question / Problem → Data → Approach (pipeline/arquitectura) → Result → Limitations → What I'd do next**.

## 5. Reglas de diseño y técnica

- **Mobile-first.** Debe verse bien a 375 px de ancho; sin scroll horizontal (el gráfico F1 puede tener un layout apilado en móvil).
- **Rápido:** la home sin JS de cliente salvo lo imprescindible. D3 solo se carga en la página F1 (`<script>` del componente, no global).
- **Accesible:** contraste AA, `alt` en imágenes, foco visible, el gráfico F1 con una alternativa textual (resumen de conclusiones + tabla breve).
- **Modo claro/oscuro** con variables CSS en `src/styles/global.css`.
- Estilo sobrio y profesional (ver `docs/PLAN.md` → decisiones abiertas). Nada de plantillas genéricas de "developer portfolio".
- TypeScript estricto. Componentes pequeños en `src/components/`. Sin dependencias nuevas sin justificarlo.
- Los JSON de datos F1 deben ser pequeños: downsampling de telemetría y carga por partes (ver spec). Objetivo: < 2 MB por carrera en total, < 300 KB en la carga inicial.

## 6. Comandos

```bash
npm install              # instalar dependencias
npm run dev              # servidor local en http://localhost:4321
npm run build            # build de producción en dist/ (debe pasar sin errores)
npm run preview          # previsualizar el build

# Pipeline F1 (Python 3.12, entorno conda `portfolio-f1`)
cd pipeline && conda env create -f environment.yml && cd ..   # una sola vez
conda activate portfolio-f1
python -m pytest pipeline/tests
python pipeline/f1/build_f1_data.py --year 2025 --event "TODO" --session R
```

## 7. Cómo trabajar en este repo

1. **Planifica antes de ejecutar:** para cualquier tarea de más de un archivo, presenta un plan breve y espera el OK de Dani.
2. Si una decisión de contenido o diseño no está en este archivo ni en `docs/`, **pregunta** en vez de suponer.
3. Antes de dar algo por terminado: `npm run build` sin errores y revisión a 375 px y escritorio.
4. Commits pequeños y descriptivos en inglés (`feat: ...`, `fix: ...`, `content: ...`).
5. No toques `docs/CONTENT.md` ni `src/data/profile.json` sin que Dani lo pida o lo confirme.
6. Cuando cambie una decisión, actualiza este archivo.

## 8. Estructura

```
.
├── CLAUDE.md                  ← este archivo
├── README.md
├── astro.config.mjs           ← site: https://danigv63.github.io
├── package.json / tsconfig.json / .nvmrc
├── .github/workflows/deploy.yml   ← build + deploy a GitHub Pages
├── .claude/
│   ├── settings.json          ← permisos de Claude Code
│   └── commands/              ← /new-case-study, /verify
├── docs/
│   ├── PLAN.md                ← fases y decisiones abiertas
│   ├── CONTENT.md             ← hechos verificados del CV (fuente de verdad)
│   └── F1_SPEC.md             ← especificación del gráfico F1 y del JSON
├── pipeline/
│   ├── requirements.txt
│   └── f1/build_f1_data.py    ← FastF1 → src/data/f1/*.json
├── public/                    ← favicon, CV en PDF (sin teléfono), f1/ (logos que aporta Dani)
└── src/
    ├── data/profile.json      ← datos del CV para renderizar
    ├── data/f1/               ← JSON generados por el pipeline
    ├── layouts/BaseLayout.astro
    ├── components/
    ├── pages/index.astro
    ├── pages/projects/f1-race-analysis.astro
    └── styles/global.css
```
