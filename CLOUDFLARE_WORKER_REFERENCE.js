// Worker de referência já validado no fluxo Meta -> Cloudflare -> Supabase.
// Ajuste apenas a URL do projeto/função se criar outro projeto.
const SUPABASE_WEBHOOK =
  "https://vcpqjkxvoqswhcqtlhtz.supabase.co/functions/v1/instagram-commerce";

const VERIFY_TOKEN = "CHANGE_ME_TO_YOUR_META_VERIFY_TOKEN";

export default {
  async fetch(request) {
    const incomingUrl = new URL(request.url);

    if (request.method === "GET") {
      const mode = incomingUrl.searchParams.get("hub.mode");
      const token = incomingUrl.searchParams.get("hub.verify_token");
      const challenge = incomingUrl.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
        return new Response(challenge, {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=UTF-8" },
        });
      }

      return new Response("Webhook verification failed", { status: 403 });
    }

    if (request.method === "POST") {
      const targetUrl = new URL(SUPABASE_WEBHOOK);
      targetUrl.search = incomingUrl.search;
      const forwardedRequest = new Request(targetUrl.toString(), request);

      try {
        const response = await fetch(forwardedRequest);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch (error) {
        console.error("Erro ao encaminhar para Supabase:", error);
        return new Response("Proxy error", { status: 502 });
      }
    }

    return new Response("Method not allowed", { status: 405 });
  },
};
