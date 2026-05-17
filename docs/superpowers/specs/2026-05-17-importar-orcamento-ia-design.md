# Design — Importação de orçamento do fornecedor com IA

**Data:** 2026-05-17
**Módulo:** Pedido de Compras (PC) — LivePosVenda
**Status:** Aprovado, aguardando plano de implementação

## 1. Contexto e problema

No módulo de Pedido de Compras, o comprador cria um pedido buscando os itens a
cotar e informando as quantidades, gera um PDF e envia ao fornecedor por e-mail.
O fornecedor responde com um orçamento (PDF, imagem ou TXT) contendo os preços.

Hoje o botão **"Importar orçamento"** apenas faz upload do arquivo para o bucket
`compras-orcamentos`, grava `supplier_quote_pdf_url` / `supplier_quote_uploaded_at`
e muda o status para `orcamento_recebido`. **Ele não lê o conteúdo do arquivo.**
O comprador precisa digitar manualmente, item a item, todos os preços, prazos e
descontos antes de clicar em "Criar pedido na Nomus".

Esta feature adiciona a leitura do orçamento por IA: ao importar, a IA extrai os
preços/prazos/descontos do documento do fornecedor e pré-preenche o pedido,
restando ao comprador apenas conferir e confirmar.

## 2. Objetivo

Permitir que, ao importar o orçamento do fornecedor, uma IA leia o arquivo,
extraia os valores e os apresente numa tela de revisão. Após confirmação do
comprador, os valores são aplicados aos itens do pedido.

### Requisitos definidos

- **Formatos suportados:** PDF, imagem (JPG/PNG) e TXT.
- **Campos extraídos:** valor unitário, prazo/data de entrega, desconto
  (percentual ou valor) e condição de pagamento (campo geral do pedido).
- **Etapa de revisão obrigatória:** a IA nunca aplica valores direto; o comprador
  confere e confirma numa tela de revisão.
- **Itens fora do pedido:** linhas cotadas pelo fornecedor que não correspondem a
  nenhum item do pedido são listadas à parte; o comprador decide item a item se
  adiciona ou ignora.

### Fora de escopo (YAGNI)

- Formatos Excel (.xlsx) e Word (.docx) — exigem bibliotecas de conversão; podem
  ser adicionados depois se necessário.
- Comparação automática entre orçamentos de múltiplos fornecedores.
- Histórico de versões de orçamento — re-importar substitui o anexo atual.

## 3. Fluxo geral

```
1. Comprador clica "Importar orçamento" → escolhe arquivo (PDF, imagem ou TXT)
2. Frontend faz upload p/ bucket compras-orcamentos (comportamento atual)
   → grava supplier_quote_pdf_url + supplier_quote_uploaded_at → status orcamento_recebido
3. Frontend chama a edge function `extract-supplier-quote`
4. Edge function carrega os itens do PC, lê o arquivo com a IA (Gemini)
   → devolve JSON estruturado
5. Frontend abre a tela de revisão (SupplierQuoteReviewDialog) com o resultado
6. Comprador confere/corrige/escolhe itens extras → clica "Aplicar ao pedido"
7. Valores são gravados nos itens; itens extras escolhidos são adicionados;
   condição de pagamento é gravada no PC
```

**Princípio de isolamento:** a importação (upload + anexo) e a extração por IA são
etapas independentes. Se a extração por IA falhar, o arquivo permanece anexado ao
pedido — a importação em si não se perde. O pedido nunca fica num estado quebrado.

## 4. Componentes

### 4.1 Edge function `extract-supplier-quote`

Nova função em `supabase/functions/extract-supplier-quote/index.ts`.

**Entrada (POST JSON):**

```jsonc
{
  "purchase_order_id": "uuid",
  "file_url": "https://.../compras-orcamentos/pc/<id>/<arquivo>",
  "file_type": "pdf" | "image" | "txt"
}
```

**Processamento:**

1. Cria client Supabase com `SERVICE_ROLE_KEY`.
2. Carrega o PC e seus itens (`id`, `produto_codigo`, `produto_descricao`,
   `quantidade`) da tabela `purchase_order_items`.
3. Busca o arquivo pela `file_url` → converte para base64.
4. Monta a chamada ao OpenRouter (modelo `google/gemini-2.5-flash`, secret
   `AI_API_KEY` — mesmo padrão de `ai-daily-report`):
   - **PDF e imagem:** enviados como parte multimodal (a IA lê o documento).
   - **TXT:** conteúdo embutido como texto no prompt.
   - O prompt inclui a lista de itens do PC e instrui a IA a, para cada item,
     localizar a linha correspondente no orçamento e extrair preço unitário,
     prazo de entrega e desconto; listar itens cotados sem correspondência; e
     identificar a condição de pagamento.
5. Exige resposta em **JSON estrito**.
6. A chamada de IA é envolvida em `withTimeout` (mesmo helper já usado em
   `send-purchase-order-email`) — falha rápida com erro descritivo.

**Saída (JSON):**

```jsonc
{
  "items": [
    {
      "po_item_id": "uuid",
      "matched": true,
      "confidence": "alta" | "media" | "baixa",
      "valor_unitario": 12.50,        // number | null
      "data_entrega": "2026-06-10",   // "YYYY-MM-DD" | null
      "percentual_desconto": 0,        // number | null
      "valor_desconto": 0,             // number | null
      "observacao": "casado por descrição"
    }
  ],
  "extra_items": [
    {
      "descricao": "Arruela M6",
      "codigo": "...",                // string | null
      "quantidade": 100,              // number | null
      "valor_unitario": 0.10,         // number | null
      "data_entrega": null,
      "percentual_desconto": null,
      "valor_desconto": null
    }
  ],
  "condicao_pagamento": "30/60/90 dias",  // string | null
  "aviso": "Não localizei preço para Mola tração"  // string | null
}
```

**Erros:** se a IA devolver conteúdo que não é JSON válido, se o arquivo não puder
ser baixado, ou se a IA estiver indisponível, a função retorna
`{ ok: false, error: "<mensagem amigável>" }` com status 400. CORS no padrão do
projeto. Não cria novos secrets — usa o `AI_API_KEY` existente.

### 4.2 Funções puras testáveis

Extraídas para módulos isolados (testáveis sem rede):

- **`buildExtractionPayload(items, fileType, fileData)`** — monta o corpo da
  requisição ao OpenRouter (lista de itens formatada + parte de arquivo conforme
  o tipo). Sem efeitos colaterais.
- **`parseExtractionResult(rawAiResponse)`** — valida e normaliza o JSON devolvido
  pela IA contra o schema esperado; campos ausentes ou inválidos viram `null`;
  lança erro descritivo se o JSON for irrecuperável.
- **`buildItemUpdates(reviewState)`** — converte o estado revisado da tela em uma
  lista de updates de itens + itens a adicionar + condição de pagamento.

### 4.3 Diálogo de revisão `SupplierQuoteReviewDialog`

Novo componente em `src/components/compras/SupplierQuoteReviewDialog.tsx`.
Modal aberto sobre o `PCDetailPage` após a IA processar.

Layout:

```
┌─ Revisão do orçamento — IA leu "<arquivo>" ─────────────────────────┐
│                                                                      │
│  Condição de pagamento detectada:  [ 30/60/90 dias            ]      │
│                                                                      │
│  ITENS DO PEDIDO                                                     │
│  Produto │ Qtd │ Vlr unit. │ Desc. │ Entrega │ Match                │
│  (todos os campos editáveis, pré-preenchidos pela IA)                │
│  Match = ✓ alta · ~ média · ⚠ não achado                            │
│                                                                      │
│  ITENS COTADOS FORA DO PEDIDO                                        │
│  ☐ por item — só os marcados são adicionados ao PC                   │
│                                                                      │
│  ⚠ Aviso da IA: "<texto livre>" (quando houver)                     │
│                                                                      │
│                              [ Cancelar ]   [ Aplicar ao pedido ]   │
└──────────────────────────────────────────────────────────────────────┘
```

- Todos os valores são **editáveis** — a IA pré-preenche, o comprador corrige
  antes de aplicar.
- Coluna **Match** com indicador visual (✓ alta / ~ média / ⚠ não achado) para
  direcionar a conferência aos itens incertos.
- Itens fora do pedido: cada um com checkbox; só os marcados são adicionados.
- Aviso da IA em destaque quando presente.
- "Aplicar ao pedido" só age após confirmação explícita.

### 4.4 Ajustes no `PCDetailPage`

- O `accept` do file input passa de `.pdf` para `.pdf,image/*,.txt`.
- Após o upload bem-sucedido, o frontend chama `extract-supplier-quote` e abre o
  `SupplierQuoteReviewDialog` com o resultado.
- Novo botão **"Reprocessar com IA"** — visível quando já existe um orçamento
  anexado (`supplier_quote_pdf_url`); roda a extração de novo sobre o arquivo já
  anexado, sem novo upload.
- O hook/edge function de IA é chamado via `supabase.functions.invoke`.

## 5. Aplicação dos valores

Ao clicar "Aplicar ao pedido":

1. Para cada item do PC com valores revisados → `updateItem` (grava
   `valor_unitario`, `data_entrega`, `percentual_desconto`, `valor_desconto`).
2. Para cada item extra **marcado** → `addItem` no PC.
3. Se houver condição de pagamento → grava `condicao_pagamento` no PC.
4. Fecha o diálogo, exibe toast de sucesso, a tabela de itens atualiza.
5. Itens com Match "⚠ não achado" e sem valor digitado permanecem como estavam
   (em branco) — preenchidos manualmente depois, se preciso.

## 6. Tratamento de erros

| Situação | Comportamento |
|----------|---------------|
| Upload do arquivo falha | Toast de erro; nada é processado |
| Arquivo anexou mas IA falha (timeout, rede) | Arquivo permanece anexado; toast: "Não foi possível ler com IA — use 'Reprocessar' ou preencha manual" |
| IA devolve JSON inválido | Erro tratado; mesma mensagem amigável |
| IA não encontrou nenhum item | A revisão abre mesmo assim, campos em branco + aviso da IA |
| Formato de arquivo não suportado | Bloqueado no seletor (`accept` = pdf/imagem/txt) |

**Princípio:** importação (upload + anexo) e extração por IA são etapas separadas
— a falha de uma não desfaz a outra.

## 7. Testes

### Funções puras (unit tests)

- `buildExtractionPayload` — formata itens e parte de arquivo conforme o tipo.
- `parseExtractionResult` — schema correto; campos ausentes/ inválidos viram
  `null`; JSON irrecuperável lança erro.
- `buildItemUpdates` — mapeia o estado revisado para updates + adições + condição
  de pagamento.

### Edge function (verificação por invocação)

- Invocar com 3 arquivos de exemplo (PDF de orçamento, imagem/print, TXT) →
  confirmar JSON válido no schema esperado.
- Erro: arquivo inexistente, arquivo corrompido, IA indisponível → confirmar
  mensagem de erro tratada.
- Confirmar que o `withTimeout` impede travamento.

### Verificação manual ponta a ponta

- Importar um orçamento real → conferir a tela de revisão → aplicar → conferir os
  itens do PC preenchidos.
- Caso com item não casado e item extra.

### Critério de pronto

A edge function retorna JSON válido para os 3 formatos; a tela de revisão abre com
os dados; "Aplicar" grava corretamente nos itens; falhas de IA não quebram o
anexo do arquivo.

## 8. Arquivos afetados

**Novos:**
- `supabase/functions/extract-supplier-quote/index.ts`
- `supabase/functions/extract-supplier-quote/` — módulos de funções puras
- `src/components/compras/SupplierQuoteReviewDialog.tsx`
- Testes das funções puras

**Modificados:**
- `src/pages/PCDetailPage.tsx` — `accept` do input, chamada à IA, abertura do
  diálogo, botão "Reprocessar com IA"
- `deploy.sh` — adicionar `supabase functions deploy extract-supplier-quote`

**Sem mudança de schema de banco** — usa as tabelas e campos já existentes
(`purchase_orders`, `purchase_order_items`). Sem novos secrets — usa `AI_API_KEY`.
