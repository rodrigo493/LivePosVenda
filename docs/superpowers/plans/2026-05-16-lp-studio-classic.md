# Landing Page Combo Studio Live Classic — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar uma landing page de captura de leads em `lp.liveuni.com.br` que cadastra o lead automaticamente como card no CRM LivePosVenda (funil "Landing Page" / etapa "Novo Lead").

**Architecture:** Landing page HTML estática standalone (Premium Dark, padrão da apresentação Pure) servida por nginx+Traefik na VPS Live. O formulário faz POST para uma edge function pública nova (`lp-studio-lead`) no Supabase do CRM, que cria cliente + card. Analytics via Google Tag Manager.

**Tech Stack:** HTML/CSS/JS vanilla · Supabase Edge Functions (Deno/TypeScript) · Docker Swarm + Traefik · Google Tag Manager.

**Spec de referência:** `docs/superpowers/specs/2026-05-16-lp-studio-classic-design.md`

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/functions/lp-studio-lead/index.ts` | Edge function pública: recebe o lead, cria cliente + card no CRM |
| `supabase/config.toml` (modificar) | Registrar `lp-studio-lead` com `verify_jwt = false` |
| `lp-studio-classic.html` | Landing page completa (HTML + CSS + JS inline) — vira `index.html` na VPS |
| `lp-studio-compose.yml` | Docker Compose stack do deploy na VPS |
| `logo-live.png` (reusar existente) | Logo Live — copiada para a VPS junto da LP |
| `combo-live.jpg` | **Asset pendente** — foto do combo montado, fornecida pelo Rodrigo |

**Constantes conhecidas:**
- Supabase project ref: `ehqkggiuouczmafmlzls` — URL `https://ehqkggiuouczmafmlzls.supabase.co`
- Edge function URL: `https://ehqkggiuouczmafmlzls.supabase.co/functions/v1/lp-studio-lead`
- VPS: `103.199.187.99` — chave SSH `~/.ssh/squad_vps`, user `root`
- GTM: `GTM-KJPPQKXV`
- Rede Docker overlay: `Rodrigo` · Traefik certresolver: `letsencryptresolver` · entrypoint: `websecure`

---

## Task 1: Confirmar dados do funil no CRM e ler a função de referência

**Files:**
- Read-only: `supabase/functions/site-lead-webhook/index.ts`

- [ ] **Step 1: Ler a edge function de referência**

Abrir e ler `supabase/functions/site-lead-webhook/index.ts` por completo. Essa função pública já cria cards no CRM e está em produção — a nova função `lp-studio-lead` deve espelhar a estrutura dela (CORS, normalização de telefone, criação de `clients`, insert em `tickets`, campos exatos). Anotar:
- Como o telefone é normalizado
- Quais campos são passados no insert de `clients`
- Quais campos são passados no insert de `tickets` (confirmar se `equipment_id` é omitido)
- Quais headers de CORS são usados

- [ ] **Step 2: Confirmar o funil "Landing Page" no banco**

Pegar a `SERVICE_ROLE_KEY` do arquivo `.env` (variável `SUPABASE_SERVICE_ROLE_KEY` ou similar). Rodar:

```bash
curl -s "https://ehqkggiuouczmafmlzls.supabase.co/rest/v1/pipelines?select=id,name,slug,is_active" \
  -H "apikey: <SERVICE_ROLE_KEY>" -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

Expected: lista de funis em JSON. Localizar o funil cujo `name` contém "Landing" (ex: "Landing Page"). Anotar o `id` e o `slug`.

- [ ] **Step 3: Confirmar a etapa "Novo Lead" desse funil**

Com o `id` do funil obtido no passo anterior:

```bash
curl -s "https://ehqkggiuouczmafmlzls.supabase.co/rest/v1/pipeline_stages?select=key,label,position&pipeline_id=eq.<PIPELINE_ID>&order=position" \
  -H "apikey: <SERVICE_ROLE_KEY>" -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

Expected: lista de etapas. Localizar a etapa cujo `label` é "Novo Lead" (ou equivalente). Anotar a `key`.

Se o funil "Landing Page" ou a etapa "Novo Lead" **não** existirem, parar e avisar o usuário — o spec assume que já existem.

---

## Task 2: Criar a edge function `lp-studio-lead`

**Files:**
- Create: `supabase/functions/lp-studio-lead/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Criar o arquivo da edge function**

Criar `supabase/functions/lp-studio-lead/index.ts` com o conteúdo abaixo. A função resolve o funil/etapa dinamicamente (por nome/label), espelhando o padrão do `site-lead-webhook`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Normaliza telefone BR para o formato com DDI 55 (somente dígitos)
function normalizePhone(raw: string): string {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  return digits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: "Método não permitido" }, 405);
  }

  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const whatsappRaw = String(body.whatsapp ?? "").trim();
    const hasStudio = body.has_studio === true;

    if (!name || !email || !whatsappRaw) {
      return json(
        { success: false, error: "Nome, e-mail e WhatsApp são obrigatórios" },
        400,
      );
    }

    const phone = normalizePhone(whatsappRaw);
    if (phone.length < 12) {
      return json({ success: false, error: "WhatsApp inválido" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolver funil "Landing Page"
    const { data: pipeline, error: pErr } = await supabase
      .from("pipelines")
      .select("id, name")
      .ilike("name", "%landing%")
      .eq("is_active", true)
      .order("position")
      .limit(1)
      .maybeSingle();
    if (pErr || !pipeline) {
      return json(
        { success: false, error: "Funil Landing Page não encontrado" },
        500,
      );
    }

    // Resolver etapa "Novo Lead"
    const { data: stage } = await supabase
      .from("pipeline_stages")
      .select("key, label")
      .eq("pipeline_id", pipeline.id)
      .ilike("label", "%novo lead%")
      .order("position")
      .limit(1)
      .maybeSingle();
    const stageKey = stage?.key ?? "novo_lead";

    // Resolver (ou criar) a fonte de lead "Landing Page"
    let leadSourceId: string | null = null;
    const { data: source } = await supabase
      .from("pipeline_lead_sources")
      .select("id")
      .eq("pipeline_id", pipeline.id)
      .ilike("name", "landing page")
      .maybeSingle();
    if (source) {
      leadSourceId = source.id;
    } else {
      const { data: newSource } = await supabase
        .from("pipeline_lead_sources")
        .insert({
          pipeline_id: pipeline.id,
          name: "Landing Page",
          color: "#FF5722",
        })
        .select("id")
        .single();
      leadSourceId = newSource?.id ?? null;
    }

    // Resolver (ou criar) o cliente
    let clientId: string;
    const { data: existingClient } = await supabase
      .from("clients")
      .select("id")
      .eq("whatsapp", phone)
      .maybeSingle();
    if (existingClient) {
      clientId = existingClient.id;
    } else {
      const { data: newClient, error: cErr } = await supabase
        .from("clients")
        .insert({ name, email, phone, whatsapp: phone })
        .select("id")
        .single();
      if (cErr || !newClient) {
        return json(
          { success: false, error: "Falha ao criar cliente" },
          500,
        );
      }
      clientId = newClient.id;
    }

    // Criar o card (ticket)
    const studioSuffix = hasStudio ? "Tem studio" : "Sem studio";
    const description =
      `Lead da Landing Page — Combo Studio Live Classic.\n` +
      `Possui studio: ${hasStudio ? "Sim" : "Não"}\n` +
      `E-mail: ${email}\nWhatsApp: ${phone}`;

    const { data: ticket, error: tErr } = await supabase
      .from("tickets")
      .insert({
        ticket_number: "",
        client_id: clientId,
        pipeline_id: pipeline.id,
        pipeline_stage: stageKey,
        ticket_type: "negociacao",
        title: `${name} · ${studioSuffix}`,
        description,
        status: "aberto",
        origin: "landing_page",
        channel: "lp_combo_classic",
        lead_source_id: leadSourceId,
        new_lead: true,
      })
      .select("id")
      .single();
    if (tErr || !ticket) {
      return json(
        { success: false, error: "Falha ao criar card no CRM" },
        500,
      );
    }

    return json({ success: true, ticket_id: ticket.id }, 200);
  } catch (e) {
    return json({ success: false, error: String(e) }, 500);
  }
});
```

- [ ] **Step 2: Comparar com o `site-lead-webhook` e ajustar divergências**

Comparar o insert de `tickets` e `clients` acima com o que o `site-lead-webhook/index.ts` realmente faz (lido na Task 1). Se o `site-lead-webhook` passar campos obrigatórios adicionais (ex: `priority`, `created_by`) ou usar nomes diferentes, ajustar o código acima para bater. O `site-lead-webhook` funciona em produção — ele é a fonte da verdade do schema.

- [ ] **Step 3: Registrar a função no config.toml**

Abrir `supabase/config.toml`. Localizar o bloco de outra função pública (ex: `[functions.site-lead-webhook]` com `verify_jwt = false`). Adicionar, no mesmo padrão:

```toml
[functions.lp-studio-lead]
verify_jwt = false
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/lp-studio-lead/index.ts supabase/config.toml
git commit -m "feat: edge function lp-studio-lead para captura de leads da LP"
```

---

## Task 3: Fazer deploy e testar a edge function

**Files:** nenhum (deploy + teste)

- [ ] **Step 1: Deploy da edge function**

Rodar (na raiz do projeto):

```bash
npx supabase functions deploy lp-studio-lead --project-ref ehqkggiuouczmafmlzls
```

Expected: mensagem de deploy bem-sucedido. Se pedir login, usar `npx supabase login` antes.

- [ ] **Step 2: Testar com um lead de teste (POST)**

```bash
curl -s -X POST "https://ehqkggiuouczmafmlzls.supabase.co/functions/v1/lp-studio-lead" \
  -H "Content-Type: application/json" \
  -d '{"name":"TESTE LP Plan","email":"teste-lp@example.com","whatsapp":"19999990000","has_studio":true}'
```

Expected: `{"success":true,"ticket_id":"<uuid>"}`

- [ ] **Step 3: Verificar o card no CRM**

Abrir o CRM, ir ao funil "Landing Page", etapa "Novo Lead". Confirmar que existe um card com título **"TESTE LP Plan · Tem studio"**.

- [ ] **Step 4: Testar o caminho "Sem studio" e validação**

```bash
curl -s -X POST "https://ehqkggiuouczmafmlzls.supabase.co/functions/v1/lp-studio-lead" \
  -H "Content-Type: application/json" \
  -d '{"name":"TESTE Sem Studio","email":"teste2@example.com","whatsapp":"19999990001","has_studio":false}'
```
Expected: `{"success":true,...}` e card "TESTE Sem Studio · Sem studio" no CRM.

```bash
curl -s -X POST "https://ehqkggiuouczmafmlzls.supabase.co/functions/v1/lp-studio-lead" \
  -H "Content-Type: application/json" -d '{"name":"","email":"","whatsapp":""}'
```
Expected: `{"success":false,"error":"Nome, e-mail e WhatsApp são obrigatórios"}` com status 400.

- [ ] **Step 5: Limpar os cards de teste**

Excluir do CRM os 2 cards de teste criados ("TESTE LP Plan" e "TESTE Sem Studio").

---

## Task 4: Criar a landing page `lp-studio-classic.html`

**Files:**
- Create: `lp-studio-classic.html`

- [ ] **Step 1: Criar o arquivo HTML completo da landing page**

Criar `lp-studio-classic.html` com o conteúdo abaixo. É um arquivo standalone (HTML + CSS + JS inline). Usa a paleta e tipografia Premium Dark da apresentação Pure.

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-KJPPQKXV');</script>
<!-- End Google Tag Manager -->
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Combo Studio Live Classic — Monte seu studio de Pilates</title>
<meta name="description" content="Combo Studio Live Classic: kit completo de equipamentos para abrir seu studio de Pilates. R$ 22.650 à vista ou 18x sem juros.">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --bg: #0a0a0a; --bg-2: #141414; --border: #2a2a2a;
    --text: #ffffff; --text-dim: #a8a8a8; --text-mute: #6a6a6a;
    --accent: #FF5722; --accent-2: #FF1744;
    --accent-soft: rgba(255,87,34,0.10);
  }
  html, body {
    background: var(--bg); color: var(--text);
    font-family: 'Inter', system-ui, sans-serif; line-height: 1.6;
    scroll-behavior: smooth;
  }
  h1, h2, h3 { font-family: 'Manrope', sans-serif; font-weight: 800; letter-spacing: -0.02em; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 0 32px; }
  .eyebrow {
    font-size: 12px; font-weight: 700; letter-spacing: 0.22em;
    text-transform: uppercase; color: var(--accent); margin-bottom: 14px;
  }
  .accent { color: var(--accent); }
  section { padding: 88px 0; }

  /* HERO */
  .hero {
    background:
      radial-gradient(circle at 85% 12%, rgba(255,87,34,0.32) 0%, transparent 52%),
      radial-gradient(circle at 12% 92%, rgba(255,23,68,0.20) 0%, transparent 55%),
      var(--bg);
    padding: 56px 0 88px;
  }
  .hero-logo img { height: 40px; width: auto; display: block; }
  .hero-grid {
    display: grid; grid-template-columns: 1.05fr 0.95fr;
    gap: 56px; align-items: center; margin-top: 64px;
  }
  .hero h1 { font-size: 52px; font-weight: 900; line-height: 1.04; margin-bottom: 20px; }
  .hero-sub { font-size: 17px; color: var(--text-dim); max-width: 440px; margin-bottom: 28px; }
  .offer {
    display: inline-flex; align-items: baseline; gap: 12px;
    border-top: 1px solid var(--border); padding-top: 20px;
  }
  .offer .price {
    font-family: 'Manrope', sans-serif; font-size: 42px; font-weight: 900;
    color: var(--accent); letter-spacing: -0.03em;
  }
  .offer .terms { font-size: 14px; color: var(--text-dim); }

  /* FORM */
  .form-card {
    background: var(--bg-2); border: 1px solid var(--border);
    border-radius: 10px; padding: 32px;
  }
  .form-card h3 { font-size: 22px; margin-bottom: 6px; }
  .form-card .form-hint { font-size: 13px; color: var(--text-mute); margin-bottom: 22px; }
  .field { margin-bottom: 16px; }
  .field label {
    display: block; font-size: 12px; font-weight: 600;
    color: var(--text-dim); margin-bottom: 6px; letter-spacing: 0.04em;
  }
  .field input {
    width: 100%; background: var(--bg); border: 1px solid var(--border);
    border-radius: 6px; padding: 13px 14px; color: var(--text);
    font-family: inherit; font-size: 15px;
  }
  .field input:focus { outline: none; border-color: var(--accent); }
  .toggle { display: flex; gap: 10px; }
  .toggle button {
    flex: 1; background: var(--bg); border: 1px solid var(--border);
    border-radius: 6px; padding: 12px; color: var(--text-dim);
    font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
  }
  .toggle button.active {
    border-color: var(--accent); background: var(--accent-soft); color: var(--text);
  }
  .submit-btn {
    width: 100%; margin-top: 8px;
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
    border: none; border-radius: 6px; padding: 16px;
    color: #fff; font-family: 'Manrope', sans-serif; font-size: 16px;
    font-weight: 800; cursor: pointer; letter-spacing: -0.01em;
  }
  .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .form-error {
    display: none; margin-top: 12px; font-size: 13px; color: #ff6b6b;
  }
  .form-success { display: none; text-align: center; padding: 24px 0; }
  .form-success h3 { font-size: 22px; margin-bottom: 10px; }
  .form-success p { font-size: 14px; color: var(--text-dim); }

  /* COMBO */
  .combo { background: var(--bg); }
  .combo h2 { font-size: 36px; margin-bottom: 32px; }
  .combo-img {
    width: 100%; border-radius: 10px; border: 1px solid var(--border);
    display: block; margin-bottom: 28px;
  }
  .combo-list { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  .combo-item {
    background: var(--bg-2); border: 1px solid var(--border);
    border-radius: 8px; padding: 18px; position: relative;
  }
  .combo-item::before {
    content: ''; position: absolute; top: 0; left: 0;
    width: 3px; height: 100%; background: var(--accent);
  }
  .combo-item .n { font-size: 11px; color: var(--accent); font-weight: 700; }
  .combo-item .nm {
    font-family: 'Manrope', sans-serif; font-weight: 800;
    font-size: 16px; margin-top: 4px;
  }
  .combo-item .ds { font-size: 12px; color: var(--text-dim); margin-top: 4px; }

  /* BRINDES */
  .bonus { background: var(--bg-2); }
  .bonus h2 { font-size: 32px; margin-bottom: 26px; }
  .bonus-list { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .bonus-item {
    background: var(--bg); border: 1px solid var(--border);
    border-radius: 8px; padding: 22px;
  }
  .bonus-item .nm { font-family: 'Manrope', sans-serif; font-weight: 800; font-size: 17px; }
  .bonus-item .ds { font-size: 13px; color: var(--text-dim); margin-top: 6px; }
  .bonus-note { font-size: 13px; color: var(--text-mute); margin-top: 18px; }

  /* CONDIÇÕES */
  .cond { background: var(--bg); }
  .cond h2 { font-size: 30px; margin-bottom: 14px; }
  .cond p { font-size: 16px; color: var(--text-dim); max-width: 620px; }
  .cond .valid { color: var(--accent); font-weight: 600; margin-top: 8px; }
  .cta-btn {
    display: inline-block; margin-top: 26px;
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
    color: #fff; text-decoration: none; border-radius: 6px;
    padding: 15px 32px; font-family: 'Manrope', sans-serif;
    font-size: 15px; font-weight: 800;
  }

  /* FECHAMENTO */
  .close {
    text-align: center;
    background:
      radial-gradient(circle at 50% 100%, rgba(255,23,68,0.22) 0%, transparent 60%),
      var(--bg);
  }
  .close h2 { font-size: 38px; font-weight: 900; max-width: 620px; margin: 0 auto 8px; }
  .footer {
    border-top: 1px solid var(--border); padding: 28px 0;
    text-align: center;
  }
  .footer img { height: 30px; width: auto; opacity: 0.7; }
  .footer p { font-size: 11px; color: var(--text-mute); margin-top: 10px; letter-spacing: 0.1em; }

  /* MOBILE — a maior parte do tráfego vem de anúncios mobile (IG/FB) */
  @media (max-width: 820px) {
    .wrap { padding: 0 20px; }
    section { padding: 56px 0; }
    .hero { padding: 40px 0 56px; }
    .hero-grid { grid-template-columns: 1fr; gap: 32px; margin-top: 40px; }
    .hero h1 { font-size: 36px; }
    .hero-sub { font-size: 15px; }
    .offer .price { font-size: 34px; }
    .combo-list { grid-template-columns: 1fr 1fr; }
    .bonus-list { grid-template-columns: 1fr; }
    .combo h2 { font-size: 26px; }
    .bonus h2 { font-size: 24px; }
    .cond h2 { font-size: 24px; }
    .close h2 { font-size: 27px; }
    .form-card { padding: 24px; }
  }
  @media (max-width: 440px) {
    .wrap { padding: 0 16px; }
    .hero h1 { font-size: 30px; }
    .offer { flex-direction: column; gap: 4px; }
    .offer .price { font-size: 30px; }
    .combo-list { grid-template-columns: 1fr; }
    .close h2 { font-size: 23px; }
    .cta-btn { display: block; text-align: center; }
  }
</style>
</head>
<body>
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-KJPPQKXV"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->

<!-- HERO -->
<section class="hero">
  <div class="wrap">
    <div class="hero-logo"><img src="logo-live.png" alt="Live Universe"></div>
    <div class="hero-grid">
      <div>
        <div class="eyebrow">Combo Studio Live Classic</div>
        <h1>Comece seu studio com a <span class="accent">melhor estrutura.</span></h1>
        <p class="hero-sub">O kit completo de equipamentos para abrir o seu studio de Pilates — com a qualidade Live.</p>
        <div class="offer">
          <span class="price">R$ 22.650</span>
          <span class="terms">à vista no PIX<br>ou 18x sem juros</span>
        </div>
      </div>
      <div>
        <div class="form-card">
          <form id="lead-form">
            <h3>Receba seu orçamento</h3>
            <p class="form-hint">Preencha e nossa equipe entra em contato.</p>
            <div class="field">
              <label for="f-name">Nome completo</label>
              <input type="text" id="f-name" name="name" required>
            </div>
            <div class="field">
              <label for="f-email">E-mail</label>
              <input type="email" id="f-email" name="email" required>
            </div>
            <div class="field">
              <label for="f-whatsapp">WhatsApp</label>
              <input type="tel" id="f-whatsapp" name="whatsapp" placeholder="(00) 00000-0000" required>
            </div>
            <div class="field">
              <label>Você já possui um studio?</label>
              <div class="toggle" id="studio-toggle">
                <button type="button" data-value="sim">Sim</button>
                <button type="button" data-value="nao">Não</button>
              </div>
            </div>
            <button type="submit" class="submit-btn" id="submit-btn">Quero meu orçamento</button>
            <div class="form-error" id="form-error"></div>
          </form>
          <div class="form-success" id="form-success">
            <h3>Recebido! ✅</h3>
            <p>Nossa equipe entra em contato com você em breve.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- COMBO -->
<section class="combo">
  <div class="wrap">
    <div class="eyebrow">O que vem no combo</div>
    <h2>Tudo que vem no seu studio.</h2>
    <img class="combo-img" src="combo-live.jpg" alt="Combo Studio Live Classic montado">
    <div class="combo-list">
      <div class="combo-item">
        <div class="n">01</div><div class="nm">V1 Barrel</div>
        <div class="ds">Trabalho de mobilidade e extensão de coluna.</div>
      </div>
      <div class="combo-item">
        <div class="n">02</div><div class="nm">V4 Chair</div>
        <div class="ds">Com braços articulados — mais repertório e trabalho de core.</div>
      </div>
      <div class="combo-item">
        <div class="n">03</div><div class="nm">V5 Reformer Mini</div>
        <div class="ds">O reformer essencial para o seu studio.</div>
      </div>
      <div class="combo-item">
        <div class="n">04</div><div class="nm">V8 Cadillac Plus</div>
        <div class="ds">A estação completa de Pilates de alta performance.</div>
      </div>
    </div>
  </div>
</section>

<!-- BRINDES -->
<section class="bonus">
  <div class="wrap">
    <div class="eyebrow">Bônus</div>
    <h2>E ainda: você ganha.</h2>
    <div class="bonus-list">
      <div class="bonus-item">
        <div class="nm">Jogo de alças</div>
        <div class="ds">Acessório para ampliar os exercícios do seu studio.</div>
      </div>
      <div class="bonus-item">
        <div class="nm">Step / Box de Pilates</div>
        <div class="ds">Apoio versátil para variações de treino.</div>
      </div>
    </div>
    <p class="bonus-note">Enquanto durar o estoque · para compra no PIX.</p>
  </div>
</section>

<!-- CONDIÇÕES -->
<section class="cond">
  <div class="wrap">
    <div class="eyebrow">Condições</div>
    <h2>Condições da oferta.</h2>
    <p>R$ 22.650 à vista no PIX, ou em até 18x sem juros (Visa/Master, mediante aprovação da operadora do cartão).</p>
    <p class="valid">Oferta válida até 31 de maio.</p>
    <a href="#lead-form" class="cta-btn">Quero meu orçamento</a>
  </div>
</section>

<!-- FECHAMENTO -->
<section class="close">
  <div class="wrap">
    <div class="eyebrow" style="text-align:center;">Vamos começar</div>
    <h2>Seu studio merece começar com a estrutura certa.</h2>
    <a href="#lead-form" class="cta-btn">Quero meu orçamento</a>
  </div>
</section>

<footer class="footer">
  <div class="wrap">
    <img src="logo-live.png" alt="Live Universe">
    <p>LIVE UNIVERSE · 2026</p>
  </div>
</footer>

<script>
  // Toggle "Possui studio?"
  var studioValue = null;
  var toggle = document.getElementById('studio-toggle');
  toggle.querySelectorAll('button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      toggle.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      studioValue = btn.getAttribute('data-value');
    });
  });

  var form = document.getElementById('lead-form');
  var successBox = document.getElementById('form-success');
  var errorBox = document.getElementById('form-error');
  var submitBtn = document.getElementById('submit-btn');
  var ENDPOINT = 'https://ehqkggiuouczmafmlzls.supabase.co/functions/v1/lp-studio-lead';

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorBox.style.display = 'none';

    var name = document.getElementById('f-name').value.trim();
    var email = document.getElementById('f-email').value.trim();
    var whatsapp = document.getElementById('f-whatsapp').value.trim();

    if (!name || !email || !whatsapp) {
      errorBox.textContent = 'Preencha nome, e-mail e WhatsApp.';
      errorBox.style.display = 'block';
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errorBox.textContent = 'Digite um e-mail válido.';
      errorBox.style.display = 'block';
      return;
    }
    if (whatsapp.replace(/\D/g, '').length < 10) {
      errorBox.textContent = 'Digite um WhatsApp válido com DDD.';
      errorBox.style.display = 'block';
      return;
    }
    if (studioValue === null) {
      errorBox.textContent = 'Responda se você já possui um studio.';
      errorBox.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name, email: email, whatsapp: whatsapp,
        has_studio: studioValue === 'sim'
      })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.success) {
        if (window.dataLayer) {
          window.dataLayer.push({ event: 'lead_submit', has_studio: studioValue });
        }
        form.style.display = 'none';
        successBox.style.display = 'block';
        setTimeout(function () {
          window.location.href = 'https://www.liveuni.com.br';
        }, 4000);
      } else {
        throw new Error((data && data.error) || 'erro');
      }
    })
    .catch(function () {
      errorBox.textContent = 'Não foi possível enviar. Tente novamente em instantes.';
      errorBox.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Quero meu orçamento';
    });
  });
</script>
</body>
</html>
```

- [ ] **Step 2: Copiar a logo para a pasta**

A LP referencia `logo-live.png`. Confirmar que `logo-live.png` já existe na raiz do projeto (`c:\VS_CODE\LivePosVenda\logo-live.png`) — foi usada na apresentação Pure. Se existir, nada a fazer; ela será enviada para a VPS na Task 6.

- [ ] **Step 3: Placeholder da imagem do combo**

A LP referencia `combo-live.jpg` (asset pendente do Rodrigo). Até o arquivo chegar, criar um placeholder para a página não quebrar:

```bash
cp logo-live.png combo-live.jpg
```

(Quando o Rodrigo enviar a foto real do combo, substituir `combo-live.jpg` pelo arquivo dele.)

- [ ] **Step 4: Commit**

```bash
git add lp-studio-classic.html
git commit -m "feat: landing page Combo Studio Live Classic"
```

---

## Task 5: Testar a landing page localmente

**Files:** nenhum (teste)

- [ ] **Step 1: Abrir no navegador**

```bash
start "" "c:\VS_CODE\LivePosVenda\lp-studio-classic.html"
```

Verificar visualmente: hero com headline + oferta + formulário, seção do combo, brindes, condições, fechamento, rodapé. Sem elementos quebrados.

- [ ] **Step 2: Testar responsividade**

No Chrome, abrir DevTools (F12) → modo dispositivo (Ctrl+Shift+M) → escolher um celular. Confirmar: hero em coluna única, combo em 2 colunas, formulário utilizável.

- [ ] **Step 3: Testar o envio do formulário**

Preencher o formulário com dados de teste (nome "TESTE LP Local", e-mail válido, WhatsApp com DDD, escolher "Sim" ou "Não") e enviar.
Expected: o formulário some, aparece "Recebido! ✅", e após ~4 segundos o navegador vai para `www.liveuni.com.br`.

- [ ] **Step 4: Verificar o card e limpar**

No CRM, funil "Landing Page" / "Novo Lead", confirmar o card "TESTE LP Local · ...". Depois excluir esse card de teste.

- [ ] **Step 5: Testar a validação**

Recarregar a LP, tentar enviar o formulário vazio e com e-mail inválido. Expected: mensagens de erro em vermelho, sem envio.

---

## Task 6: Deploy na VPS — `lp.liveuni.com.br`

**Files:**
- Create: `lp-studio-compose.yml`

- [ ] **Step 1: Criar o DNS (ação do Rodrigo)**

Pedir ao Rodrigo criar no hPanel da Hostinger (`liveuni.com.br` → Zona DNS) um registro:
`Tipo A · Nome: lp · Aponta para: 103.199.187.99`

Aguardar e confirmar com:
```bash
nslookup lp.liveuni.com.br 8.8.8.8
```
Expected: `Address: 103.199.187.99`

- [ ] **Step 2: Criar o docker-compose**

Criar `lp-studio-compose.yml` na raiz do projeto:

```yaml
version: "3.8"

services:
  lp:
    image: nginx:alpine
    volumes:
      - /opt/lp-studio/html:/usr/share/nginx/html:ro
    networks:
      - Rodrigo
    deploy:
      replicas: 1
      labels:
        - traefik.enable=true
        - traefik.http.routers.lp.entrypoints=websecure
        - traefik.http.routers.lp.rule=Host(`lp.liveuni.com.br`)
        - traefik.http.routers.lp.tls.certresolver=letsencryptresolver
        - traefik.http.services.lp.loadbalancer.server.port=80

networks:
  Rodrigo:
    external: true
```

- [ ] **Step 3: Criar a pasta na VPS e enviar os arquivos**

```bash
ssh -i ~/.ssh/squad_vps root@103.199.187.99 "mkdir -p /opt/lp-studio/html"
scp -i ~/.ssh/squad_vps "/c/VS_CODE/LivePosVenda/lp-studio-classic.html" root@103.199.187.99:/opt/lp-studio/html/index.html
scp -i ~/.ssh/squad_vps "/c/VS_CODE/LivePosVenda/logo-live.png" root@103.199.187.99:/opt/lp-studio/html/logo-live.png
scp -i ~/.ssh/squad_vps "/c/VS_CODE/LivePosVenda/combo-live.jpg" root@103.199.187.99:/opt/lp-studio/html/combo-live.jpg
scp -i ~/.ssh/squad_vps "/c/VS_CODE/LivePosVenda/lp-studio-compose.yml" root@103.199.187.99:/opt/lp-studio/docker-compose.yml
```
Expected: 4 uploads sem erro.

- [ ] **Step 4: Subir o stack**

```bash
ssh -i ~/.ssh/squad_vps root@103.199.187.99 "docker stack deploy -c /opt/lp-studio/docker-compose.yml lp"
```
Expected: `Creating service lp_lp`

- [ ] **Step 5: Verificar o serviço**

```bash
ssh -i ~/.ssh/squad_vps root@103.199.187.99 "docker service ls --filter name=lp"
```
Expected: `lp_lp` com `1/1` replicas.

- [ ] **Step 6: Verificar o site e o SSL**

Aguardar ~30s o Traefik emitir o certificado, então:
```bash
curl -sk --max-time 25 https://lp.liveuni.com.br | grep -o "<title>[^<]*</title>"
```
Expected: `<title>Combo Studio Live Classic — Monte seu studio de Pilates</title>`

```bash
ssh -i ~/.ssh/squad_vps root@103.199.187.99 "echo | openssl s_client -connect lp.liveuni.com.br:443 -servername lp.liveuni.com.br 2>/dev/null | openssl x509 -noout -issuer"
```
Expected: `issuer=...Let's Encrypt...`

- [ ] **Step 7: Commit**

```bash
git add lp-studio-compose.yml
git commit -m "chore: docker-compose do deploy da LP em lp.liveuni.com.br"
```

---

## Task 7: Teste end-to-end em produção

**Files:** nenhum (teste)

- [ ] **Step 1: Abrir a LP em produção**

Abrir `https://lp.liveuni.com.br` no navegador. Confirmar carregamento completo, cadeado de segurança, logo e imagem do combo visíveis.

- [ ] **Step 2: Enviar um lead real de teste**

Preencher o formulário (nome "TESTE E2E Producao", e-mail válido, WhatsApp com DDD, "Possui studio?" = Sim) e enviar.
Expected: mensagem "Recebido! ✅" e redirecionamento para `www.liveuni.com.br` após ~4s.

- [ ] **Step 3: Confirmar o card no CRM**

No CRM, funil "Landing Page" / etapa "Novo Lead": confirmar o card **"TESTE E2E Producao · Tem studio"**, com o cliente tendo nome, e-mail e WhatsApp corretos.

- [ ] **Step 4: Verificar o GTM**

Com a LP aberta, no console do navegador digitar `dataLayer` e confirmar que o array existe (GTM carregou). Opcionalmente, usar a extensão Google Tag Assistant para confirmar o container `GTM-KJPPQKXV`.

- [ ] **Step 5: Limpar o card de teste**

Excluir do CRM o card "TESTE E2E Producao".

- [ ] **Step 6: Verificação mobile final**

Abrir `https://lp.liveuni.com.br` no celular. Confirmar layout, formulário e envio funcionando.

---

## Assets pendentes

- **`combo-live.jpg`** — foto do combo montado (Rodrigo fornece). Até lá, usar `logo-live.png` copiada como placeholder (Task 4, Step 3). Quando chegar o arquivo real: substituir `combo-live.jpg` na raiz, reenviar via `scp` para `/opt/lp-studio/html/combo-live.jpg`.

## Notas de manutenção

Para atualizar a LP depois de mudanças no HTML:
```bash
scp -i ~/.ssh/squad_vps "/c/VS_CODE/LivePosVenda/lp-studio-classic.html" root@103.199.187.99:/opt/lp-studio/html/index.html
```
O nginx usa bind mount — a mudança reflete na hora (Ctrl+F5 no browser por cache).
