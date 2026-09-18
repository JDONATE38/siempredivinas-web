// functions/api/stock/[slug].js
//
// Endpoint público (solo lectura) que devuelve el stock de un producto.
// GET https://siempredivinas.com/api/stock/camiseta-cuello-cascada
//
// Respuesta: [{ size: "Única", color: "Azul marino", quantity: 3 }, ...]

export async function onRequestGet(context) {
  const { env, params } = context;
  const slug = params.slug;

  if (!slug) {
    return new Response(JSON.stringify({ error: "Falta el slug del producto" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const { results } = await env.DB.prepare(
    "SELECT size, color, quantity FROM stock WHERE product_slug = ?"
  ).bind(slug).all();

  return new Response(JSON.stringify(results), {
    headers: {
      "content-type": "application/json",
      // Evita que el navegador guarde una copia vieja del stock en caché
      "cache-control": "no-store"
    }
  });
}
