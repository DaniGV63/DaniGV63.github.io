---
description: Pre-publish check (build, facts, links, mobile)
---

Run a pre-publish check and report problems as a list, most important first. Do not fix anything until I confirm.

1. `npm run build` must pass with no errors or warnings.
2. Every claim about me on the site must be traceable to docs/CONTENT.md or src/data/profile.json. Flag anything that is not.
3. No phone number, home address or age anywhere in src/ or public/.
4. No `TODO(` strings in rendered pages.
5. All internal links resolve; external links use https.
6. Pages render without horizontal scroll at 375 px width.
7. F1 page shows the unofficial, non-commercial notice in the footer, and every F1/team logo used comes from public/f1/.
8. Data files in src/data/f1/ respect the size limits in docs/F1_SPEC.md.
