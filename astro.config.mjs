import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://siempredivinas.com',
  integrations: [tailwind(), sitemap()],
  build: {
    inlineStylesheets: 'always', // <-- Ojo, le hemos añadido una coma aquí al final
    format: 'file'               // <-- Y ESTA ES LA LÍNEA NUEVA
  }
});
