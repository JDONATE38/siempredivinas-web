import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://siempredivinas.com', // Esto lo cambiaremos luego si hace falta
  integrations: [tailwind(), sitemap()],
});