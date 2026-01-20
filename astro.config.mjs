import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://siempredivinas.com',
  integrations: [tailwind(), sitemap()],
  build: {
    inlineStylesheets: 'always' // Pega el CSS directamente para eliminar el archivo contacto.css de la red
  }
});