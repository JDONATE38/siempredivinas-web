export async function onRequestGet(context) {
  const client_id = context.env.GITHUB_CLIENT_ID;
  const client_secret = context.env.GITHUB_CLIENT_SECRET;
  
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response("No code found", { status: 400 });
  }

  // Intercambiar el código por un token de acceso
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "SiempreDivinas-CMS",
    },
    body: JSON.stringify({
      client_id,
      client_secret,
      code,
    }),
  });

  const result = await response.json();

  if (result.error) {
    return new Response(JSON.stringify(result), { status: 401 });
  }

  const token = result.access_token;
  const provider = "github";

  // Este HTML le dice a la ventana del CMS que el login fue exitoso
  const html = `
    <html>
      <body>
        <script>
          const receiveMessage = (message) => {
            window.opener.postMessage(
              'authorization:${provider}:success:${JSON.stringify({ token })}',
              message.origin
            );
            window.removeEventListener("message", receiveMessage, false);
            window.close();
          }
          window.addEventListener("message", receiveMessage, false);
          window.opener.postMessage("authorizing:${provider}", "*");
        </script>
      </body>
    </html>
  `;

  return new Response(html, {
    headers: { "Content-Type": "text/html;charset=UTF-8" },
  });
}