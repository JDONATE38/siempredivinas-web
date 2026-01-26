import { defineCollection, z } from 'astro:content';

const productosCollection = defineCollection({
    schema: z.object({
        title: z.string(),
        price: z.number(),
        category: z.string(),
        stockStatus: z.enum(['En Stock', 'Últimas Unidades', 'Agotado']).default('En Stock'),
        image: z.string(),
        // Aceptamos las 3 auxiliares como texto (ruta de la imagen) y opcionales
        gallery1: z.string().optional(),
        gallery2: z.string().optional(),
        gallery3: z.string().optional(),
        
        sizes: z.array(z.string()).optional(),
        // 👇 AÑADIDO: Tallas personalizadas a mano (texto libre)
        customSizes: z.string().optional(),

        colors: z.array(z.string()).optional(),
        // 👇 AÑADIDO: Colores personalizados a mano (texto libre)
        customColors: z.string().optional(),

        description: z.string(),

        // 👇 NUEVOS CAMPOS SEO (Opcionales)
        seoTitle: z.string().optional(),
        seoDescription: z.string().optional(),

        draft: z.boolean().default(false),
    }),
});

export const collections = {
    'productos': productosCollection,
};