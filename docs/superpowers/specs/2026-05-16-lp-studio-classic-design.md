# Landing Page — Combo Studio Live Classic

**Data:** 2026-05-16
**Autor:** Rodrigo Siqueira (Live Universe) + Claude
**Status:** Aprovado para implementação

## 1. Objetivo

Criar uma landing page de captura de leads para a campanha do **Combo Studio Live Classic**, que roda em anúncios de Instagram e Facebook. O lead preenche um formulário e o cadastro entra automaticamente no CRM da Live (LivePosVenda), criando um card no funil "Landing Page", etapa "Novo Lead".

A landing será publicada em `lp.liveuni.com.br`.

## 2. Contexto da campanha

Promoção **Combo Studio Live Classic** — kit completo para abrir um studio de Pilates:

- **Equipamentos:** V1 Barrel · V4 Chair (com braços articulados) · V5 Reformer Mini · V8 Cadillac Plus
- **Preço:** R$ 22.650,00 à vista no PIX, ou em até 18x sem juros (Visa/Master, mediante aprovação)
- **Brindes:** alças + step/box — enquanto durar o estoque, para compra no PIX
- **Validade:** até 31 de maio
- **Público:** quem quer abrir um studio + quem já tem e quer renovar equipamentos

## 3. Princípios de design

Aplicados a partir da análise comparativa de criativos (Live × concorrência):

1. **Uma mensagem dominante por seção** — sem textos competindo
2. **Respiro** — espaço negativo generoso, layout nunca "carregado"
3. **Hierarquia clara** — o olho é guiado do topo ao formulário
4. **Tom aspiracional + oferta** — vender o studio dos sonhos, não só o preço; urgência presente mas discreta (informativa, não alarmista)
5. **Premium Dark** — mesma identidade da apresentação Pure (preto + laranja Live), usado com elegância

## 4. Arquitetura técnica

- **Frontend:** HTML/CSS/JS estático, arquivo único standalone — mesmo padrão da apresentação Pure (`apresentacao-pure-pilates.html`)
- **Hospedagem:** `lp.liveuni.com.br` — container `nginx:alpine` em Docker Swarm + Traefik, SSL automático via Let's Encrypt (mesmo padrão do deploy `pure`)
- **Analytics:** Google Tag Manager no `<head>` e `<body>` (noscript)
- **Backend:** nova edge function `lp-studio-lead` no Supabase do CRM LivePosVenda
- **Responsividade:** desktop e mobile (a maior parte do tráfego vem de anúncios mobile)

### Decisão de backend

Criar a edge function **nova e dedicada** `lp-studio-lead` em vez de reaproveitar `site-lead-webhook`. Motivo: `site-lead-webhook` está em produção atendendo o site institucional da Live — alterá-la traz risco de regressão. Uma função dedicada isola o risco e permite lógica específica da LP (campo "possui studio", título customizado do card).

## 5. Estrutura de seções

Landing curta de conversão — 5 blocos, scroll vertical.

### Bloco 1 — Hero
- Logo Live (topo esquerdo)
- Eyebrow: "COMBO STUDIO LIVE CLASSIC"
- Headline: **"Comece seu studio com a melhor estrutura."**
- Linha de apoio: "O kit completo de equipamentos para abrir o seu studio de Pilates — com a qualidade Live."
- Oferta em destaque: "R$ 22.650 à vista no PIX" · "ou 18x sem juros"
- **Formulário** ao lado (desktop) / abaixo (mobile)

### Bloco 2 — O Combo
- Título: "Tudo que vem no seu studio."
- Imagem do combo completo (foto do studio montado)
- Lista dos 4 equipamentos: V1 Barrel · V4 Chair (braços articulados) · V5 Reformer Mini · V8 Cadillac Plus

### Bloco 3 — Brindes
- Título: "E ainda: você ganha."
- Alças + step/box
- Nota discreta: "Enquanto durar o estoque · para compra no PIX"

### Bloco 4 — Condições
- "R$ 22.650 à vista no PIX, ou em até 18x sem juros (Visa/Master, mediante aprovação da operadora)."
- "Oferta válida até 31 de maio." (tom informativo, não alarmista)
- CTA: "Quero meu orçamento" — rola até o formulário do hero

### Bloco 5 — Fechamento
- Frase aspiracional: "Seu studio merece começar com a estrutura certa."
- CTA final (rola ao formulário)
- Rodapé com logo Live

## 6. Formulário

### Campos
| Campo | Tipo | Obrigatório | Validação |
|---|---|---|---|
| Nome completo | texto | sim | não vazio |
| E-mail | email | sim | formato de e-mail válido |
| WhatsApp | telefone | sim | DDD + número, dígitos suficientes para telefone BR |
| Possui studio? | Sim/Não | sim | uma das duas opções selecionada |

- Botão de envio: "Quero meu orçamento"
- Durante o envio: botão desabilitado, estado de carregamento (evita duplo clique)
- Erro de envio: mensagem amigável, formulário permanece preenchido para nova tentativa

### Fluxo pós-envio (sucesso)
1. Formulário é substituído por mensagem de sucesso: "Recebido! Nossa equipe entra em contato com você em breve."
2. Após ~4 segundos, redireciona automaticamente para `www.liveuni.com.br`

## 7. Integração com o CRM

### Edge function `lp-studio-lead`
- **Local:** `supabase/functions/lp-studio-lead/index.ts`
- **Autenticação:** pública (`verify_jwt = false`) — chamada direto do browser
- **CORS:** liberado para o domínio da LP (headers `apikey`, `x-client-info`, `content-type`)

**Entrada (POST JSON):**
```json
{ "name": "...", "email": "...", "whatsapp": "...", "has_studio": true }
```

**Processamento:**
1. Valida os campos recebidos
2. Normaliza o WhatsApp (formato com DDI 55)
3. Resolve o pipeline "Landing Page" pelo slug — slug exato a confirmar no banco no início da implementação
4. Resolve a etapa "Novo Lead" pela `key` desse pipeline
5. Resolve ou cria o cliente em `clients` (busca por whatsapp; se não existir, cria com nome/email/whatsapp)
6. Resolve a `lead_source` "Landing Page" do pipeline (cria se não existir)
7. Cria o card em `tickets`:
   - `client_id`: resolvido
   - `pipeline_id`: pipeline "Landing Page"
   - `pipeline_stage`: key da etapa "Novo Lead"
   - `ticket_type`: `negociacao`
   - `title`: `"{Nome} · Tem studio"` se `has_studio = true`, senão `"{Nome} · Sem studio"`
   - `status`: `aberto`
   - `origin`: `landing_page`
   - `channel`: `lp_combo_classic`
   - `lead_source_id`: resolvido
   - `new_lead`: `true`
   - `description`: resumo do lead (origem da campanha + resposta "possui studio")

**Retorno:**
```json
{ "success": true, "ticket_id": "uuid" }
```

Em caso de erro, retorna status apropriado e mensagem — a LP exibe mensagem amigável.

## 8. Google Tag Manager

- ID do container: **`GTM-KJPPQKXV`**
- O GTM cobre o pixel do Facebook/Meta e demais tags de campanha — não há pixel embutido separado

Snippet no `<head>` (o mais alto possível):
```html
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-KJPPQKXV');</script>
<!-- End Google Tag Manager -->
```

Snippet imediatamente após `<body>`:
```html
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-KJPPQKXV"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
```

## 9. Deploy

Mesmo padrão do deploy `pure` (já em produção):

1. **DNS:** registro A `lp` → `103.199.187.99` no hPanel da Hostinger
2. **Arquivos na VPS:** `/opt/lp-studio/html/` (index.html + imagem do combo)
3. **Stack Docker:** `lp` — `nginx:alpine`, bind mount, rede `Rodrigo`
4. **Traefik:** labels para `Host(lp.liveuni.com.br)`, entrypoint `websecure`, certresolver `letsencryptresolver`
5. **Edge function:** deploy de `lp-studio-lead` no Supabase do projeto LivePosVenda (`ehqkggiuouczmafmlzls`)

## 10. Assets

- **GTM ID** — `GTM-KJPPQKXV` ✅ recebido
- **Imagem do combo completo** — foto do studio com os 4 equipamentos montados (arquivo de imagem) — **pendente** (Rodrigo fornece)

A implementação pode começar com placeholder de imagem e o asset entra quando disponível.

## 11. Fora de escopo (YAGNI)

- Outras etapas no funil "Landing Page" além de "Novo Lead"
- Teste A/B de versões da landing
- Pixel do Facebook embutido separado (vai pelo GTM)
- Página de "obrigado" dedicada (o redirecionamento para `www.liveuni.com.br` cumpre esse papel)
- Envio automático de mensagem de WhatsApp ao lead (o contato é feito pela equipe via CRM)
- Múltiplas campanhas/ofertas na mesma LP — esta LP é específica do Combo Studio Live Classic
