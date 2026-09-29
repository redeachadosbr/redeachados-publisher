// REDE ACHADOS BR Publisher V5.5.6
// Arquitetura: Meta -> Cloudflare Worker -> Render -> Supabase Edge Function.
// Motivo: evitar o erro Cloudflare 530 / 1016 observado no acesso direto
// do Worker ao hostname *.supabase.co.

const RENDER_WEBHOOK =
  "https://redeachados-publisher.onrender.com/api/instagram/webhook";

const VERIFY_TOKEN = "RedeAchadosWebhook2026";

export default {
  async fetch(request) {
    const incomingUrl = new URL(request.url);

    // A Meta valida o callback diretamente no Worker.
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

    // POST real/teste: preserva os bytes originais e assinaturas da Meta.
    if (request.method === "POST") {
      try {
        const body = await request.arrayBuffer();
        const headers = new Headers();
        headers.set(
          "Content-Type",
          request.headers.get("Content-Type") || "application/json"
        );

        const sig = request.headers.get("X-Hub-Signature");
        const sig256 = request.headers.get("X-Hub-Signature-256");
        if (sig) headers.set("X-Hub-Signature", sig);
        if (sig256) headers.set("X-Hub-Signature-256", sig256);

        const target = new URL(RENDER_WEBHOOK);
        target.search = incomingUrl.search;

        console.log("Encaminhando webhook para Render:", target.toString());

        const response = await fetch(target.toString(), {
          method: "POST",
          headers,
          body,
          redirect: "follow",
        });

        const responseText = await response.text();
        console.log("Resposta Render:", response.status, responseText);

        return new Response(responseText || "OK", {
          status: response.status,
          headers: {
            "Content-Type":
              response.headers.get("Content-Type") ||
              "text/plain; charset=UTF-8",
          },
        });
      } catch (error) {
        console.error(
          "Erro ao encaminhar webhook para Render:",
          error?.message || String(error)
        );
        return new Response("Proxy error", { status: 502 });
      }
    }

    return new Response("Method not allowed", { status: 405 });
  },
};
