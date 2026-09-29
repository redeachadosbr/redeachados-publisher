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

}



export default {

  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {

    const url = new URL(req.url);



    const verifyToken = Deno.env.get("META_VERIFY_TOKEN") || "";

    const appSecret = Deno.env.get("META_APP_SECRET") || "";

    const pageAccessToken =

      Deno.env.get("META_PAGE_ACCESS_TOKEN") || "";

    const igUserId = Deno.env.get("META_IG_USER_ID") || "";

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

            .select("\*")

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



        const keyword = String(reel.keyword || "QUERO")

          .trim()

          .toUpperCase();



        const normalizedComment = commentText

          .trim()

          .toUpperCase();



        // Só dispara quando encontrar a palavra configurada

        if (!normalizedComment.includes(keyword)) {

          await ctx.supabaseAdmin.from("dm_log").insert({

            comment_id: commentId,

            instagram_media_id: mediaId,

            instagram_user_id: instagramUserId || null,

            instagram_username: instagramUsername || null,

            comment_text: commentText,

            product_url: reel.product_url,

            status: "ignored",

          });



          results.push({

            comment_id: commentId,

            status: "keyword_not_found",

          });



          continue;

        }



        // =================================================

        // 4. DIRECT AUTOMÁTICO

        // =================================================

        const dmText = String(

          reel.dm_message_template ||

            "Oi! 👋 Aqui está o link do produto que você viu no nosso Reel: {link}"

        ).replaceAll("{link}", reel.product_url);



        if (

          !reel.auto_dm_enabled ||

          !pageAccessToken ||

          !igUserId

        ) {

          await ctx.supabaseAdmin.from("dm_log").insert({

            comment_id: commentId,

            instagram_media_id: mediaId,

            instagram_user_id: instagramUserId || null,

            instagram_username: instagramUsername || null,

            comment_text: commentText,

            product_url: reel.product_url,

            status: "error",

            error_message:

              "Direct desativado ou credenciais Meta ausentes",

          });



          continue;

        }



        const privateReplyUrl =

          `https\://graph.facebook.com/${apiVersion}/${igUserId}/messages`;



        const privateReply = await graphPost(

          privateReplyUrl,

          pageAccessToken,

          {

            recipient: {

              comment_id: commentId,

            },

            message: {

              text: dmText,

            },

          }

        );



        if (!privateReply.ok) {

          await ctx.supabaseAdmin.from("dm_log").insert({

            comment_id: commentId,

            instagram_media_id: mediaId,

            instagram_user_id: instagramUserId || null,

            instagram_username: instagramUsername || null,

            comment_text: commentText,

            product_url: reel.product_url,

            status: "error",

            meta_response: privateReply.data,

            error_message: JSON.stringify(privateReply.data),

          });



          results.push({

            comment_id: commentId,

            status: "dm_error",

          });



          continue;

        }



        // =================================================

        // 5. RESPOSTA PÚBLICA OPCIONAL

        // =================================================

        let publicReply: any = null;



        if (reel.public_reply_enabled) {

          const publicReplyUrl =

            `https\://graph.facebook.com/${apiVersion}/${commentId}/replies`;



          publicReply = await graphPost(

            publicReplyUrl,

            pageAccessToken,

            {

              message:

                reel.public_reply_text ||

                "Enviei o link no seu Direct ✅",

            }

          );

        }



        // =================================================

        // 6. REGISTRAR SUCESSO

        // =================================================

        await ctx.supabaseAdmin.from("dm_log").insert({

          comment_id: commentId,

          instagram_media_id: mediaId,

          instagram_user_id: instagramUserId || null,

          instagram_username: instagramUsername || null,

          comment_text: commentText,

          product_url: reel.product_url,

          status: "sent",

          meta_response: {

            private_reply: privateReply.data,

            public_reply: publicReply?.data || null,

          },

          sent_at: new Date().toISOString(),

        });



        results.push({

          comment_id: commentId,

          status: "sent",

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