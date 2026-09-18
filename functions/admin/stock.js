// functions/admin/stock.js
//
// Panel de stock para Siempre Divinas.
// Accesible en: https://siempredivinas.com/admin/stock
// Protegido con usuario/contraseña (login básico del navegador).

function checkAuth(context) {
  const { request, env } = context;
  const authHeader = request.headers.get("Authorization");

  const unauthorizedResponse = new Response("Autenticación requerida", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Panel de Stock"' }
  });

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return unauthorizedResponse;
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = atob(base64Credentials);
  const separatorIndex = credentials.indexOf(":");
  const user = credentials.substring(0, separatorIndex);
  const pass = credentials.substring(separatorIndex + 1);

  if (user !== env.ADMIN_USER || pass !== env.ADMIN_PASSWORD) {
    return unauthorizedResponse;
  }

  return null; // Autenticación correcta
}

function renderPage(rows) {
  const rowsHtml = rows.map(r => `
    <tr>
      <td>${r.product_title}</td>
      <td>${r.size}</td>
      <td>${r.color}</td>
      <td>
        <form method="POST" style="display:flex; gap:8px; align-items:center;">
          <input type="hidden" name="product_slug" value="${r.product_slug}">
          <input type="hidden" name="product_title" value="${r.product_title}">
          <input type="hidden" name="size" value="${r.size}">
          <input type="hidden" name="color" value="${r.color}">
          <input type="number" name="quantity" value="${r.quantity}" style="width:70px;">
          <button type="submit">Guardar</button>
        </form>
      </td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="robots" content="noindex, nofollow">
    <title>Panel de Stock — Siempre Divinas</title>
    <style>
      body { font-family: sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #333; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background: #f5f5f5; }
      h1 { color: #ec4899; }
      form.add-form { margin-top: 30px; padding: 20px; background: #fafafa; border-radius: 8px; }
      form.add-form label { display: block; margin-bottom: 10px; font-weight: bold; }
      form.add-form input { padding: 6px; width: 100%; max-width: 300px; margin-top: 4px; }
      button { background: #ec4899; color: white; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; }
      button:hover { background: #db2777; }
    </style>
  </head>
  <body>
    <h1>Panel de Stock</h1>
    <p>Aquí puedes ver y corregir el stock actual de cada combinación de producto, talla y color.</p>
    <table>
      <thead>
        <tr><th>Producto</th><th>Talla</th><th>Color</th><th>Cantidad</th></tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="4">Todavía no hay stock cargado.</td></tr>'}
      </tbody>
    </table>

    <h2>Añadir producto / combinación nueva</h2>
    <form class="add-form" method="POST">
      <label>Slug del producto (el que aparece en la URL, ej: camiseta-cuello-cascada)
        <input type="text" name="product_slug" required placeholder="camiseta-cuello-cascada">
      </label>
      <label>Nombre del producto
        <input type="text" name="product_title" required placeholder="Camiseta cuello cascada">
      </label>
      <label>Talla (deja "Única" si el producto no tiene tallas distintas)
        <input type="text" name="size" value="Única">
      </label>
      <label>Color (deja "Único" si el producto no tiene colores distintos)
        <input type="text" name="color" value="Único">
      </label>
      <label>Cantidad en stock
        <input type="number" name="quantity" value="0" required>
      </label>
      <button type="submit">Guardar</button>
    </form>
  </body>
  </html>`;
}

export async function onRequestGet(context) {
  const authResponse = checkAuth(context);
  if (authResponse) return authResponse;

  const { env } = context;
  const { results } = await env.DB.prepare(
    "SELECT * FROM stock ORDER BY product_title, size, color"
  ).all();

  return new Response(renderPage(results), {
    headers: { "content-type": "text/html; charset=UTF-8" }
  });
}

export async function onRequestPost(context) {
  const authResponse = checkAuth(context);
  if (authResponse) return authResponse;

  const { env, request } = context;
  const formData = await request.formData();

  const product_slug = (formData.get("product_slug") || "").trim();
  const product_title = (formData.get("product_title") || "").trim();
  const size = (formData.get("size") || "Única").trim();
  const color = (formData.get("color") || "Único").trim();
  const quantity = parseInt(formData.get("quantity"), 10) || 0;

  if (product_slug && product_title) {
    await env.DB.prepare(`
      INSERT INTO stock (product_slug, product_title, size, color, quantity, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(product_slug, size, color)
      DO UPDATE SET quantity = ?, product_title = ?, updated_at = datetime('now')
    `).bind(product_slug, product_title, size, color, quantity, quantity, product_title).run();
  }

  return Response.redirect(new URL("/admin/stock", request.url).toString(), 302);
}
