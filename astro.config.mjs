// @ts-check
import { defineConfig } from 'astro/config';

// User site on GitHub Pages: repo "DaniGV63.github.io" -> no `base` needed.
export default defineConfig({
  site: 'https://danigv63.github.io',
  output: 'static',
});
