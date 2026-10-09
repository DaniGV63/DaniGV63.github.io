# danigv63.github.io

Personal portfolio of **Daniel Gómez Verde** — Data & AI Engineer, MSc Data Science student at Aarhus University.

Built with [Astro](https://astro.build), deployed to GitHub Pages. The F1 race-analysis project uses a local Python pipeline ([FastF1](https://docs.fastf1.dev/)) that exports static JSON, rendered with D3.js.

## Run locally

```bash
npm install
npm run dev        # http://localhost:4321
npm run build
```

## F1 data pipeline

```bash
cd pipeline && conda env create -f environment.yml && cd ..
conda activate portfolio-f1
python -m pytest pipeline/tests
python pipeline/f1/build_f1_data.py --year 2025 --event "<Grand Prix name>" --session R
```

F1 data via the open-source FastF1 library. This project is unofficial and not associated with Formula 1.
