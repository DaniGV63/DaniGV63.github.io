---
description: Create a new case-study page from verified facts
argument-hint: <project or experience id, e.g. endesa>
---

Create a case-study page for: $ARGUMENTS

1. Read CLAUDE.md, docs/CONTENT.md and src/data/profile.json.
2. Collect only the facts that exist there for this item. List any missing facts and ASK me before writing.
3. Propose a short plan (route, sections, components) and wait for my OK.
4. Use this structure: Question/Problem → Data → Approach → Result → Limitations → What I'd do next.
5. English copy, plain and specific, no sales language (CLAUDE.md §4). No client data or screenshots.
6. Link it from the home page, run `npm run build`, and report what you changed.
