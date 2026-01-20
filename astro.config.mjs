import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://siempredivinas.com',
  integrations: [tailwind(), sitemap()],
  
  // ESTA ES LA PARTE QUE SOLUCIONA EL ERROR:
  build: {
    inlineStylesheets: 'always' // Pega el CSS directamente en el HTML
  }
  }
});