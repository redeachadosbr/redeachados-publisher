// Rede Achados BR - Instagram Commerce Webhook
// Comentário "QUERO" -> Direct com link do produto

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

const encoder = new TextEncoder();

async function verifyMetaSignature(
  rawBody: string,
  signature: string | null,
  appSecret: string
) {
  if (!signature || !signature.startsWith("sha256=")) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawBody)
  );

  const expected =
    "sha256=" +
    Array.from(new Uint8Array(signed))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  if (expected.length !== signature.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }

  return diff === 0;
}

async function graphPost(
  url: string,
  token: string,
  body: Record<string, unknown>
) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));

    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: {
        error: {
          message: error instanceof Error ? error.message : "Falha de conexão com a Meta",
        },
      },
    };
  }
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    const url = new URL(req.url);

    const verifyToken = Deno.env.get("META_VERIFY_TOKEN") || "";
    const appSecret = Deno.env.get("META_APP_SECRET") || "";
    const pageAccessToken =
      Deno.env.get("META_PAGE_ACCESS_TOKEN") || "";
    // Token de Página (Facebook Login): usar o ID da Página na Send API.
    const pageId = Deno.env.get("META_PAGE_ID") || "1028013573722953";
    const apiVersion =
      Deno.env.get("META_API_VERSION") || "v25.0";

    // =====================================================
    // 1. VERIFICAÇÃO INICIAL DO WEBHOOK PELA META
    // =====================================================
    if (req.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (
        mode === "subscribe" &&
        token &&
        token === verifyToken &&
        challenge
      ) {
        return new Response(challenge, {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      }

      return new Response("Webhook verification failed", {
        status: 403,
      });
    }

    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // =====================================================
    // 2. VALIDAR ASSINATURA DA META
    // =====================================================
    const rawBody = await req.text();

    if (!appSecret) {
      console.error("META_APP_SECRET não configurado");
      return Response.json(
        { error: "Webhook not configured" },
        { status: 500 }
      );
    }

    const validSignature = await verifyMetaSignature(
      rawBody,
      req.headers.get("x-hub-signature-256"),
      appSecret
    );

    if (!validSignature) {
      console.error("Assinatura Meta inválida");
      return new Response("Invalid signature", { status: 401 });
    }

    let payload: any;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return Response.json(
        { error: "Invalid JSON" },
        { status: 400 }
      );
    }

    // Responde somente a eventos Instagram
    if (payload.object !== "instagram") {
      return Response.json({ received: true, ignored: true });
    }

    const results: any[] = [];

    // =====================================================
    // 3. PROCESSAR COMENTÁRIOS
    // =====================================================
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "comments") continue;

        const value = change.value || {};

        const commentId = String(value.id || "");
        const commentText = String(value.text || "");
        const mediaId = String(
          value.media?.id || value.media_id || ""
        );

        const instagramUserId = String(
          value.from?.id || ""
        );

        const instagramUsername = String(
          value.from?.username || ""
        );

        if (!commentId || !mediaId) continue;

        // Evitar loop: as respostas públicas da própria loja também geram
        // eventos "comments" no webhook. Nunca enviar Direct a nós mesmos.
        const ownInstagramId = Deno.env.get("META_IG_USER_ID") || "";
        const ownInstagramUsername = (Deno.env.get("META_IG_USERNAME") || "redeachadosbr")
          .replace(/^@/, "").trim().toLowerCase();
        const authorUsername = instagramUsername.replace(/^@/, "").trim().toLowerCase();

        if (
          (ownInstagramId && instagramUserId === ownInstagramId) ||
          (authorUsername && authorUsername === ownInstagramUsername)
        ) {
          results.push({ comment_id: commentId, status: "own_comment_ignored" });
          continue;
        }

        // Evitar envio duplicado
        const { data: existing } = await ctx.supabaseAdmin
          .from("dm_log")
          .select("id,status")
          .eq("comment_id", commentId)
          .maybeSingle();

        if (existing) {
          results.push({
            comment_id: commentId,
            status: "duplicate",
          });
          continue;
        }

        // Encontrar o produto correspondente ao Reel
        const { data: reel, error: reelError } =
          await ctx.supabaseAdmin
            .from("reel_links")
            .select("*")
            .eq("instagram_media_id", mediaId)
            .eq("active", true)
            .maybeSingle();

        if (reelError || !reel) {
          results.push({
            comment_id: commentId,
            status: "reel_not_registered",
          });
          continue;
        }

        // Modo comentário universal: QUALQUER comentário de cliente gera
        // uma resposta privada com o link do Reel associado.
        // reel.keyword permanece no banco por compatibilidade com o painel,
        // mas não restringe o disparo automático.


        // =================================================
        // 4. DIRECT AUTOMÁTICO (INDEPENDENTE DA RESPOSTA PÚBLICA)
        // =================================================
        const dmText = String(
          reel.dm_message_template ||
            "Oi! 👋 Aqui está o link do produto que você viu no nosso Reel: {link}"
        ).replaceAll("{link}", reel.product_url);

        let privateReply: any = null;
        let privateReplySucceeded = false;
        let dmError: string | null = null;

        if (reel.auto_dm_enabled) {
          if (pageAccessToken && pageId) {
            const privateReplyUrl =
              `https://graph.facebook.com/${apiVersion}/${pageId}/messages`;

            privateReply = await graphPost(
              privateReplyUrl,
              pageAccessToken,
              {
                recipient: { comment_id: commentId },
                message: { text: dmText },
              }
            );

            privateReplySucceeded = privateReply.ok;
            if (!privateReplySucceeded) {
              dmError = JSON.stringify(privateReply.data);
            }
          } else {
            dmError = "Credenciais Meta ausentes para o envio do Direct";
          }
        }

        // =================================================
        // 5. RESPOSTA PÚBLICA SEM DEPENDER DO DIRECT
        // =================================================
        let publicReply: any = null;
        let publicReplySucceeded = false;
        let publicError: string | null = null;
        let publicReplyMessage: string | null = null;

        if (reel.public_reply_enabled) {
          // Nunca afirmar que o link foi entregue se o Direct falhou.
          publicReplyMessage = privateReplySucceeded
            ? String(reel.public_reply_text || "Enviei o link no seu Direct ✅")
            : "Oi! 👋 Obrigado pelo interesse! 💛 O link não pôde ser enviado automaticamente. Chame nosso perfil no Direct e informe o produto deste Reel, por favor.";

          if (pageAccessToken) {
            const publicReplyUrl =
              `https://graph.facebook.com/${apiVersion}/${commentId}/replies`;

            publicReply = await graphPost(
              publicReplyUrl,
              pageAccessToken,
              { message: publicReplyMessage }
            );

            publicReplySucceeded = publicReply.ok;
            if (!publicReplySucceeded) {
              publicError = JSON.stringify(publicReply.data);
            }
          } else {
            publicError = "Token da Página ausente para responder ao comentário";
          }
        }

        // =================================================
        // 6. REGISTRO SEPARADO DOS DOIS CANAIS
        // =================================================
        // Manter status='sent' apenas quando o Direct foi confirmado.
        // O sucesso público isolado fica explícito em meta_response.
        const errors = [
          dmError ? `Direct: ${dmError}` : null,
          publicError ? `Comentário público: ${publicError}` : null,
        ].filter(Boolean);

        const { error: logError } = await ctx.supabaseAdmin
          .from("dm_log")
          .insert({
            comment_id: commentId,
            instagram_media_id: mediaId,
            instagram_user_id: instagramUserId || null,
            instagram_username: instagramUsername || null,
            comment_text: commentText,
            product_url: reel.product_url,
            status: privateReplySucceeded ? "sent" : "error",
            meta_response: {
              private_reply_ok: privateReplySucceeded,
              public_reply_ok: publicReplySucceeded,
              private_reply: privateReply?.data || null,
              public_reply: publicReply?.data || null,
              public_reply_message: publicReplyMessage,
            },
            error_message: errors.length ? errors.join(" | ") : null,
            sent_at: (privateReplySucceeded || publicReplySucceeded)
              ? new Date().toISOString()
              : null,
          });

        if (logError) {
          console.error("Falha ao registrar processamento do comentário", logError.message);
        }

        results.push({
          comment_id: commentId,
          status: privateReplySucceeded
            ? "sent"
            : publicReplySucceeded
              ? "public_only"
              : "error",
          direct_sent: privateReplySucceeded,
          public_reply_sent: publicReplySucceeded,
          product: reel.product_name,
        });
      }
    }

    return Response.json({
      received: true,
      processed: results.length,
      results,
    });
  }),
};