// supabase/functions/send-purchase-order-email/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Garante que uma promise não trave indefinidamente. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timeout: ${label} não respondeu em ${ms / 1000}s`)),
      ms,
    );
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** Envia um e-mail via SMTP Hostinger com timeout. Lança erro descritivo em caso de falha. */
async function enviarEmail(opts: {
  to: string;
  subject: string;
  content: string;
  attachments?: { filename: string; content: string; encoding: string; contentType: string }[];
}): Promise<void> {
  const password = Deno.env.get("COMPRAS_SMTP_PASSWORD");
  if (!password) throw new Error("COMPRAS_SMTP_PASSWORD não configurado nos secrets");

  console.log(`[send-pc-email] conectando smtp.hostinger.com:465 → destino ${opts.to}`);
  const client = new SMTPClient({
    connection: {
      hostname: "smtp.hostinger.com",
      port: 465,
      tls: true,
      auth: { username: "compras@liveuniverse.com.br", password },
    },
  });

  try {
    await withTimeout(
      client.send({
        from: "Compras Live <compras@liveuniverse.com.br>",
        to: opts.to,
        // Cópia oculta para a própria caixa de Compras — registra o envio na Caixa de Entrada
        bcc: "compras@liveuniverse.com.br",
        subject: opts.subject,
        content: opts.content,
        attachments: opts.attachments ?? [],
      }),
      45000,
      "envio SMTP",
    );
    console.log("[send-pc-email] e-mail enviado com sucesso");
  } finally {
    try {
      await withTimeout(client.close(), 8000, "fechar conexão SMTP");
    } catch (closeErr) {
      console.warn("[send-pc-email] aviso ao fechar conexão:", String(closeErr));
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { purchase_order_id, pdf_base64, to } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: po } = await supabase
      .from("purchase_orders").select("*").eq("id", purchase_order_id).single();
    if (!po) throw new Error("Pedido não encontrado");

    // Resolve o destinatário: e-mail informado pelo comprador → cadastro do fornecedor
    let destino: string | null = (typeof to === "string" && to.trim()) ? to.trim() : null;
    if (!destino && po.nomus_fornecedor_id) {
      const { data: sup } = await supabase
        .from("suppliers").select("email").eq("nomus_pessoa_id", po.nomus_fornecedor_id).maybeSingle();
      destino = sup?.email ?? null;
    }
    if (!destino) {
      throw new Error("Fornecedor sem e-mail. Preencha o e-mail do fornecedor antes de enviar.");
    }

    await enviarEmail({
      to: destino,
      subject: `Solicitação de cotação — ${po.order_number}`,
      content: `Olá,\n\nSegue em anexo a solicitação de cotação ${po.order_number}.\n` +
               `Por favor, retorne com os valores.\n\nObrigado.\nSetor de Compras — Live`,
      attachments: pdf_base64
        ? [{ filename: `${po.order_number}.pdf`, content: pdf_base64, encoding: "base64", contentType: "application/pdf" }]
        : [],
    });

    // Persiste o e-mail usado no cadastro interno do fornecedor
    if (po.nomus_fornecedor_id) {
      await supabase.from("suppliers").upsert({
        nomus_pessoa_id: po.nomus_fornecedor_id,
        nome: po.nomus_fornecedor_nome ?? "Fornecedor",
        email: destino,
        updated_at: new Date().toISOString(),
      }, { onConflict: "nomus_pessoa_id" });
    }

    await supabase.from("purchase_orders").update({
      email_sent_at: new Date().toISOString(),
      email_to: destino,
      status: "enviado_fornecedor",
      updated_at: new Date().toISOString(),
    }).eq("id", purchase_order_id);

    return new Response(JSON.stringify({ ok: true, to: destino }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[send-pc-email] ERRO:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
