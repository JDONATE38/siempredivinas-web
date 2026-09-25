// functions/api/stripe-webhook.js
//
// Stripe llama a esta URL directamente (servidor a servidor) cuando un pago
// se completa. Aquí comprobamos que el aviso es auténtico, descontamos el
// stock real en D1, guardamos el pedido en la tabla "orders" y avisamos
// por email a la propietaria con el detalle del pedido.

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

// Arma el HTML del email y lo envía a través de la API de Resend.
// Si algo falla aquí, lanzamos el error para que quien nos llama decida
// qué hacer (en nuestro caso, solo lo registramos en los logs, sin que
// afecte al resto del webhook).
async function enviarEmailPedido(env, session, items) {
  const direccion = session.collected_information?.shipping_details?.address;

  const direccionTexto = direccion
    ? `${direccion.line1 || ""}${direccion.line2 ? ", " + direccion.line2 : ""}<br>
       ${direccion.postal_code || ""} ${direccion.city || ""}<br>
       ${direccion.state ? direccion.state + ", " : ""}${direccion.country || ""}`
    : "No especificada";

  const nombreCliente = session.shipping_details?.name || session.customer_details?.name || "No especificado";

  const filasProductos = items
    .map(
      (item) => `
        <tr>
          <td style="padding:6px 10px;border:1px solid #ddd;">${item.title}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${item.size || "-"}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${item.color || "-"}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;">${item.quantity}</td>
        </tr>`
    )
    .join("");

  const totalTexto = ((session.amount_total || 0) / 100).toFixed(2).replace(".", ",");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#333;">🛍️ Nuevo pedido en Siempre Divinas</h2>

      <h3 style="margin-bottom:4px;">Datos del cliente</h3>
      <p style="margin-top:0;">
        <strong>Nombre:</strong> ${nombreCliente}<br>
        <strong>Email:</strong> ${session.customer_details?.email || "No especificado"}<br>
        <strong>Teléfono:</strong> ${session.customer_details?.phone || "No especificado"}
      </p>

      <h3 style="margin-bottom:4px;">Dirección de envío</h3>
      <p style="margin-top:0;">${direccionTexto}</p>

      <h3 style="margin-bottom:4px;">Productos</h3>
      <table style="border-collapse:collapse;width:100%;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Producto</th>
            <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Talla</th>
            <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Color</th>
            <th style="padding:6px 10px;border:1px solid #ddd;text-align:center;">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          ${filasProductos}
        </tbody>
      </table>

      <p style="font-size:18px;margin-top:16px;">
        <strong>Total pagado: ${totalTexto} €</strong>
      </p>

      <p style="color:#888;font-size:12px;margin-top:24px;">
        ID de sesión de Stripe: ${session.id}
      </p>
    </div>
  `;

  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Siempre Divinas <pedidos@siempredivinas.com>",
      to: "siempredivinas.pedidos@gmail.com",
      subject: `Nuevo pedido — ${totalTexto} €`,
      html,
    }),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    throw new Error(`Resend respondió con error: ${respuesta.status} ${detalle}`);
  }
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

    // Enviar el email de aviso a la propietaria. Si falla, lo registramos
    // en los logs pero NO hacemos que el webhook falle: el pedido y el
    // stock ya están guardados correctamente en cualquier caso.
    try {
      await enviarEmailPedido(env, session, items);
    } catch (errorEmail) {
      console.log("Error enviando el email de aviso del pedido:", errorEmail);
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.log("Error procesando el webhook:", err);
    // Devolvemos 500 para que Stripe reintente enviarlo más tarde
    return new Response("Error interno", { status: 500 });
  }
}
