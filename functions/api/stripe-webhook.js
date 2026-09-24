// functions/api/stripe-webhook.js
//
// Stripe llama a esta URL directamente (servidor a servidor) cuando un pago
// se completa. Aquí comprobamos que el aviso es auténtico, descontamos el
// stock real en D1 y guardamos el pedido en la tabla "orders".

// Compara texto ignorando mayúsculas/minúsculas y espacios (igual que en crear-sesion-pago.js)
function normalize(text) {
  return (text || "").trim().toLowerCase();
}

// Comprueba que la firma que envía Stripe en la cabecera es auténtica
async function verificarFirma(payload, cabeceraFirma, secreto) {
  if (!cabeceraFirma) return false;

  const partes = cabeceraFirma.split(",").reduce((acc, parte) => {
    const [clave, valor] = parte.split("=");
    acc[clave] = valor;
    return acc;
  }, {});

  const timestamp = partes.t;
  const firmaRecibida = partes.v1;
  if (!timestamp || !firmaRecibida) return false;

  const mensajeFirmado = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();

  const clave = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const firmaBuffer = await crypto.subtle.sign("HMAC", clave, encoder.encode(mensajeFirmado));
  const firmaCalculada = Array.from(new Uint8Array(firmaBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return firmaCalculada === firmaRecibida;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // IMPORTANTE: hay que leer el cuerpo como texto plano (sin tocarlo)
  // porque la firma se calcula sobre el texto exacto que envía Stripe.
  const payload = await request.text();
  const cabeceraFirma = request.headers.get("stripe-signature");

  const firmaValida = await verificarFirma(payload, cabeceraFirma, env.STRIPE_WEBHOOK_SECRET);
  if (!firmaValida) {
    return new Response("Firma inválida", { status: 400 });
  }

  const event = JSON.parse(payload);

  // Solo nos interesa cuando un pago se completa; ignoramos el resto de eventos
  if (event.type !== "checkout.session.completed") {
    return new Response("OK (evento ignorado)", { status: 200 });
  }

  const session = event.data.object;

  try {
    // Evitar procesar el mismo pedido dos veces (Stripe puede reenviar el mismo aviso)
    const yaExiste = await env.DB.prepare(
      "SELECT id FROM orders WHERE stripe_session_id = ?"
    )
      .bind(session.id)
      .first();

    if (yaExiste) {
      return new Response("OK (ya procesado)", { status: 200 });
    }

    // Pedirle a Stripe el detalle de los artículos comprados (con sus metadatos)
    const lineItemsRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${session.id}/line_items?expand[]=data.price.product`,
      { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } }
    );
    const lineItemsData = await lineItemsRes.json();

    const items = lineItemsData.data.map((li) => {
      const meta = li.price.product.metadata || {};
      return {
        slug: meta.slug || null,
        size: meta.size || null,
        color: meta.color || null,
        title: li.price.product.name,
        quantity: li.quantity,
      };
    });

    // Descontar el stock real en D1, combinación por combinación
    for (const item of items) {
      if (!item.slug) continue; // por seguridad, si faltase el slug lo saltamos

      const { results } = await env.DB.prepare(
        "SELECT product_slug, size, color, quantity FROM stock WHERE LOWER(TRIM(product_slug)) = ?"
      )
        .bind(item.slug.toLowerCase())
        .all();

      const fila = results.find(
        (row) =>
          normalize(row.size) === normalize(item.size) &&
          normalize(row.color) === normalize(item.color)
      );

      if (fila) {
        await env.DB.prepare(
          "UPDATE stock SET quantity = quantity - ? WHERE product_slug = ? AND size = ? AND color = ? AND quantity >= ?"
        )
          .bind(item.quantity, fila.product_slug, fila.size, fila.color, item.quantity)
          .run();
      }
    }

        // Guardar el pedido en la tabla "orders"
    await env.DB.prepare(
      `INSERT INTO orders (stripe_session_id, customer_email, customer_phone, items_json, total_amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        session.id,
        session.customer_details?.email || null,
        session.customer_details?.phone || null,
        JSON.stringify(items),
        (session.amount_total || 0) / 100,
        new Date().toISOString()
      )
      .run();

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.log("Error procesando el webhook:", err);
    // Devolvemos 500 para que Stripe reintente enviarlo más tarde
    return new Response("Error interno", { status: 500 });
  }
}
