import { defineConfig } from 'vite';

// Relative base so the game works from GitHub Pages (/City_Building/) or any folder
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
});
