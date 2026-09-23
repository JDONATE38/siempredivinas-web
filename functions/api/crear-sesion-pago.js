// functions/api/crear-sesion-pago.js
//
// Recibe el carrito, comprueba stock REAL en D1 y, si todo está disponible,
// crea una sesión de pago en Stripe y devuelve la URL a la que redirigir al cliente.
//
// POST /api/crear-sesion-pago   body: { items: [...carrito] }

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const items = body.items;

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "El carrito está vacío." }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

        // Compara texto ignorando mayúsculas/minúsculas y espacios.
    // Se hace en JavaScript (no en SQL) porque SQLite no gestiona bien los acentos.
    function normalize(text) {
      return (text || "").trim().toLowerCase();
    }

    // 1. Comprobar stock real en D1, combinación por combinación
    for (const item of items) {
      const { results } = await env.DB.prepare(
        "SELECT size, color, quantity FROM stock WHERE LOWER(TRIM(product_slug)) = ?"
      )
        .bind((item.slug || "").trim().toLowerCase())
        .all();

      const fila = results.find(
        (row) =>
          normalize(row.size) === normalize(item.size) &&
          normalize(row.color) === normalize(item.color)
      );

      if (!fila || fila.quantity < item.quantity) {
        return new Response(
          JSON.stringify({
            error: `Lo sentimos, ya no queda stock suficiente de "${item.title}" (talla ${item.size}, color ${item.color}).`,
          }),
          { status: 409, headers: { "content-type": "application/json" } }
        );
      }
    }

    // 2. Construir los "line items" para Stripe (uno por artículo del carrito)
    const lineItems = items.map((item) => ({
      currency: "eur",
      name: `${item.title} - Talla ${item.size} - Color ${item.color}`,
      image: item.image || null,
      unit_amount: Math.round(item.price * 100), // Stripe trabaja en céntimos
      quantity: item.quantity,
    }));

    // 3. Montar la petición a la API de Stripe
    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append(
      "success_url",
      "https://siempredivinas.com/pedido-confirmado?session_id={CHECKOUT_SESSION_ID}"
    );
    params.append("cancel_url", "https://siempredivinas.com/");
    // Solo pedimos dirección de envío, sin dirección de facturación aparte
    params.append("shipping_address_collection[allowed_countries][]", "ES");

    lineItems.forEach((li, i) => {
      params.append(`line_items[${i}][price_data][currency]`, li.currency);
      params.append(`line_items[${i}][price_data][product_data][name]`, li.name);
      if (li.image) {
        params.append(`line_items[${i}][price_data][product_data][images][0]`, li.image);
      }
      params.append(`line_items[${i}][price_data][unit_amount]`, String(li.unit_amount));
      params.append(`line_items[${i}][quantity]`, String(li.quantity));
    });

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.log("Error de Stripe:", session);
      return new Response(
        JSON.stringify({ error: "No se pudo crear la sesión de pago." }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.log("Error interno:", err);
    return new Response(JSON.stringify({ error: "Error interno del servidor." }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
