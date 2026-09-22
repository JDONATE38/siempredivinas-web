// functions/api/stock-totals.js
//
// Endpoint público (solo lectura) que devuelve la lista de slugs de productos
// que se han quedado a CERO unidades en TODAS sus combinaciones de talla/color.
//
// GET https://siempredivinas.com/api/stock-totals
//
// Respuesta: ["camiseta-cuello-cascada", "vestido-largo-verano", ...]
//
// Importante: si un producto no tiene NINGUNA fila en la tabla "stock"
// (es decir, nunca se ha cargado su stock), NO aparece en esta lista.
// Se considera "no controlado" y se sigue mostrando como disponible,
// para no ocultar productos por error.

export async function onRequestGet(context) {
  const { env } = context;

  const { results } = await env.DB.prepare(
    `SELECT LOWER(TRIM(product_slug)) AS slug
     FROM stock
     GROUP BY LOWER(TRIM(product_slug))
     HAVING SUM(quantity) <= 0`
  ).all();

  const agotadoSlugs = results.map(row => row.slug);

  return new Response(JSON.stringify(agotadoSlugs), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    }
  });
}
