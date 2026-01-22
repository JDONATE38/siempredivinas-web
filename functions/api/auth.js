export async function onRequestGet(context) {
  const client_id = context.env.GITHUB_CLIENT_ID;
  const redirect_uri = new URL(context.request.url).origin + "/api/callback";
  
  // Generamos un estado aleatorio para seguridad
  const state = crypto.randomUUID();
  
  const params = new URLSearchParams({
    client_id,
    redirect_uri,
    scope: "repo user", // Permisos para escribir en el repo
    state,
  });

  return Response.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`,
    302
  );
}