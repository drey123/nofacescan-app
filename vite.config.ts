import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages may serve the site from a repository subpath.
  // Relative asset URLs keep the build portable across Pages and local hosting.
  base: './',
});
