import { defineCollection, z } from 'astro:content';

const productosCollection = defineCollection({
    schema: z.object({
        title: z.string(),
        // NUEVO: Título H1 opcional
        pageTitle: z.string().optional(),
        price: z.number(),
        
        // NUEVO: Añadido 'category' que no estaba, aceptando Texto o Lista
        category: z.union([z.string(), z.array(z.string())]).optional(),

        // MODIFICADO: Ahora acepta Texto (antiguo) O Lista (nuevo) O Nada (opcional)
        subcategory: z.union([z.string(), z.array(z.string())]).optional(),
        
        stockStatus: z.enum(['En Stock', 'Últimas Unidades', 'Agotado']).default('En Stock'),
        image: z.string(),
        gallery1: z.string().optional(),
        gallery2: z.string().optional(),
        gallery3: z.string().optional(),
        
        sizes: z.array(z.string()).optional(),
        customSizes: z.string().optional(),

        colors: z.array(z.string()).optional(),
        customColors: z.string().optional(),

        description: z.string(),

        seoTitle: z.string().optional(),
        seoDescription: z.string().optional(),

        draft: z.boolean().default(false),
    }),
});

const categoriasCollection = defineCollection({
    schema: z.object({
        title: z.string(),
        pageTitle: z.string().optional(), // Puesto opcional por seguridad
        description: z.string().optional(),
        order: z.number().default(1),
        seoTitle: z.string().optional(),
        seoDescription: z.string().optional(),
    }),
});

const subcategoriasCollection = defineCollection({
    schema: z.object({
        title: z.string(),
        pageTitle: z.string().optional(),
        description: z.string().optional(),
        order: z.number().default(1),
        seoTitle: z.string().optional(),
        seoDescription: z.string().optional(),
        
        // MODIFICADO: Acepta Texto (antiguo) O Lista (nuevo)
        parentCategory: z.union([z.string(), z.array(z.string())]).optional(),
    }),
});

export const collections = {
    'productos': productosCollection,
    'categorias': categoriasCollection,
    'subcategorias': subcategoriasCollection,
};
