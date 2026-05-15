# Pedido de Compras (PC) — Documento de Design

**Data:** 2026-05-15
**Projeto:** LivePosVenda CRM
**Autor:** Rodrigo Siqueira + Claude

---

## 1. Contexto e objetivo

O setor de compras precisa de um fluxo para adquirir matéria-prima:

1. Selecionar a matéria-prima através da integração com o Nomus (ERP).
2. Gerar uma lista de itens para enviar ao fornecedor (solicitação de orçamento).
3. Importar o PDF do orçamento que o fornecedor devolve.
4. Criar o pedido de compra dentro do Nomus.

A feature espelha o padrão **PA (Pedido de Acessórios)** já existente — aba no card + página de detalhe + página de lista — mas usa **tabelas próprias**, porque os campos de compra são diferentes dos de atendimento ao cliente. Reaproveitar `service_requests`/`quotes` (usadas pelo PA) poluiria as telas de atendimento; descartado.

---

## 2. Modelo de dados

### 2.1 Tabela `purchase_orders` (cabeçalho)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `ticket_id` | uuid FK → tickets | vínculo ao card |
| `order_number` | text UNIQUE | ex. `PC.26.001`, gerado por RPC |
| `status` | text | `rascunho` \| `enviado_fornecedor` \| `orcamento_recebido` \| `criado_nomus` \| `cancelado` (default `rascunho`) |
| `nomus_empresa_id` | integer | |
| `nomus_empresa_label` | text | texto exibido na tela |
| `nomus_fornecedor_id` | integer | id da pessoa (categoria fornecedor) |
| `nomus_fornecedor_nome` | text | |
| `nomus_tipo_movimentacao_id` | integer | `codigo` do tipo de movimentação |
| `nomus_tipo_movimentacao_label` | text | |
| `data_emissao` | date | |
| `data_entrega_padrao` | date | |
| `nomus_contato_label` | text | contato (do fornecedor) |
| `nomus_comprador_id` | integer | id da pessoa (categoria comprador) |
| `nomus_comprador_nome` | text | |
| `condicao_pagamento` | text | texto livre (igual à tela do Nomus) |
| `observacoes` | text | |
| `nomus_order_id` | integer | `id` retornado pelo POST do Nomus |
| `nomus_codigo_pedido` | text | `codigoPedido` retornado |
| `nomus_sent_at` | timestamptz | quando foi criado no Nomus |
| `supplier_quote_pdf_url` | text | PDF do orçamento do fornecedor |
| `supplier_quote_uploaded_at` | timestamptz | |
| `created_by` | uuid | |
| `created_at` / `updated_at` | timestamptz | |

RLS: `authenticated` (padrão do projeto).

### 2.2 Tabela `purchase_order_items` (itens)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `purchase_order_id` | uuid FK → purchase_orders | `ON DELETE CASCADE` |
| `nomus_produto_id` | integer | `idProduto` |
| `produto_codigo` | text | |
| `produto_descricao` | text | |
| `quantidade` | numeric | |
| `valor_unitario` | numeric | preenchido após orçamento (default 0) |
| `percentual_desconto` | numeric | default 0 |
| `valor_desconto` | numeric | default 0 |
| `nomus_unidade_medida_id` | integer | |
| `unidade_medida_label` | text | |
| `nomus_classificacao_financeira_id` | integer | |
| `classificacao_financeira_label` | text | |
| `data_entrega` | date | |
| `posicao` | integer | ordem na lista |
| `created_at` | timestamptz | |

### 2.3 RPC `generate_pc_number()`

Idêntica a `generate_pa_number()`, prefixo `PC.` — formato `PC.<AA>.<NNN>`.

### 2.4 Storage

Bucket `compras-orcamentos` para os PDFs do fornecedor. Path: `pc/{purchase_order_id}/{timestamp}_{nome-arquivo}`.

---

## 3. Telas

### 3.1 Aba "Ped. Compras" no `TicketDetailDialog`

- Nova aba (ícone `ShoppingCart`), no nível do ticket.
- Lista os `purchase_orders` onde `ticket_id` = ticket atual.
- Cada linha: `order_number`, fornecedor, seletor de status, botão abrir → `/pedidos-compra/:id`.
- Botão **"Criar Pedido de Compras"** → cria um `purchase_order` em `rascunho` vinculado ao ticket e navega para a página de detalhe.

### 3.2 Página de detalhe `/pedidos-compra/:id` (`PCDetailPage`)

Espelha a `PADetailPage`. Duas seções:

**Seção "Informações gerais"** — 10 campos, na ordem da tela do Nomus:

1. **Pedido** — `order_number`, somente leitura.
2. **Empresa** — autocomplete Nomus.
3. **Fornecedor** — autocomplete `/rest/pessoas`, categoria `fornecedor`.
4. **Tipo de movimentação** — autocomplete `/rest/tiposMovimentacao`, filtrado por `natureza = 3` (Compra).
5. **Data de emissão** — date.
6. **Data de entrega padrão** — date.
7. **Contato** — select (contatos do fornecedor).
8. **Comprador** — autocomplete `/rest/pessoas`, categoria `comprador`.
9. **Condição de pagamento** — texto livre.
10. **Observações** — textarea.

**Seção "Itens do pedido de compra"**:

- Adição de itens via `ProductSearch` existente (busca produtos no Nomus).
- Tabela de itens: produto, quantidade, valor unitário, % desconto, valor desconto, unidade de medida, classificação financeira, data de entrega, total da linha.
- Total geral ao final.

**Barra de ações** (3 botões): Gerar PDF · Importar orçamento · Criar pedido na Nomus.

### 3.3 Página de lista `/pedidos-compra` (`PedidosCompraPage`)

Lista todos os PCs, com filtro por status e busca por número/fornecedor.

### 3.4 Menu lateral e permissão

Conforme regra obrigatória do projeto (`CLAUDE.md` — Sincronização Sidebar ↔ crmModules):

- Item "Pedidos de Compra" em `AppSidebar.tsx` (seção Operações), com `moduleKey: 'pedidos_compra'`.
- Entry correspondente em `src/lib/crmModules.ts`.
- Rotas em `src/App.tsx`: `/pedidos-compra` e `/pedidos-compra/:id`.

---

## 4. Fluxo / status

```
rascunho ──[Gerar PDF]──▶ enviado_fornecedor ──[Importar PDF]──▶ orcamento_recebido ──[Criar na Nomus]──▶ criado_nomus
```

O status também pode ser ajustado manualmente. `cancelado` disponível a qualquer momento.

---

## 5. Os 3 botões de ação

### 5.1 Gerar PDF da lista (enviar ao fornecedor)

- Geração client-side com `jsPDF` (mesmo padrão do contrato PDF já existente).
- Conteúdo: cabeçalho com logo Live, número do PC, data, dados do fornecedor, **tabela de itens com produto e quantidade** (sem valor unitário — é uma solicitação de cotação; o preço vem do fornecedor depois), observações.
- Ao gerar, status → `enviado_fornecedor`.

### 5.2 Importar orçamento do fornecedor

- File input (`accept=".pdf"`) → upload para o bucket `compras-orcamentos` → grava `supplier_quote_pdf_url` + `supplier_quote_uploaded_at` → status → `orcamento_recebido`.
- Mostra link para abrir o PDF; permite substituir.

### 5.3 Criar pedido na Nomus

- Chama a edge function `nomus-create-purchase-order` (ver seção 6.2).
- Em sucesso: grava `nomus_order_id`, `nomus_codigo_pedido`, `nomus_sent_at`; status → `criado_nomus`.

---

## 6. Integração Nomus

### 6.1 Edge function `nomus-search` — estender

Novos valores de `type`:

- **`pessoas`** — `GET /rest/pessoas?query=nome="*TERMO*"`. Parâmetro extra `categoria` (`fornecedor` | `comprador`) para filtrar pelo campo `categorias.<x> = true` do retorno. Retorna `id`, `nome`, `codigo`, `cnpj`, contatos.
- **`tiposMovimentacao`** — `GET /rest/tiposMovimentacao?query=...`. Retorna `codigo` (= `idTipoMovimentacao`), `nome`, `natureza`. Filtrar `natureza = 3` (Compra).
- **`empresas`** — reutilizar o mecanismo que PA/PD já usam.

### 6.2 Edge function nova `nomus-create-purchase-order`

- Entrada: `purchase_order_id`.
- Lê `purchase_orders` + `purchase_order_items` do banco.
- Monta o corpo do `POST /rest/pedidoscompra`:

```json
{
  "codigoPedido": "<order_number>",
  "idEmpresa": <nomus_empresa_id>,
  "idTipoMovimentacao": <nomus_tipo_movimentacao_id>,
  "idPessoaFornecedor": <nomus_fornecedor_id>,
  "idCondicaoPagamento": <default configurável>,
  "idFormaPagamento": <default configurável>,
  "idTipoPedidoCompra": <default configurável>,
  "dataEmissao": "dd/MM/yyyy",
  "dataEntregaPadrao": "dd/MM/yyyy",
  "itensPedidoCompra": [
    {
      "idProduto": <nomus_produto_id>,
      "idSetorEntrada": <default configurável>,
      "idTipoMovimentacao": <nomus_tipo_movimentacao_id>,
      "idUnidadeMedida": <nomus_unidade_medida_id>,
      "idClassificacaoFinanceira": <nomus_classificacao_financeira_id>,
      "item": "<posicao formatada>",
      "percentualDesconto": "<percentual_desconto>",
      "quantidade": "<quantidade>",
      "status": 3,
      "valorDesconto": "<valor_desconto>",
      "valorUnitario": "<valor_unitario>",
      "dataEntrega": "dd/MM/yyyy"
    }
  ]
}
```

- `POST` para `/rest/pedidoscompra`; grava `id` e `codigoPedido` da resposta.
- CORS: incluir `apikey, x-client-info` nos headers permitidos (regra do projeto para edge functions chamadas do browser).

### 6.3 Defaults configuráveis (`system_settings`)

Campos exigidos pela API que não têm campo na tela (decisão do usuário):

- `nomus_pc_id_tipo_pedido_compra` — campo "Tipo de pedido" foi removido da tela.
- `nomus_pc_id_setor_entrada` — campo "Setor de entrada" foi removido da tela.
- `nomus_pc_id_forma_pagamento`.
- `nomus_pc_id_condicao_pagamento` — mapeamento, já que a tela usa condição como texto livre.

---

## 7. Componentes (isolamento e responsabilidade)

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/<ts>_purchase_orders.sql` | tabelas, RPC, RLS, bucket |
| `src/hooks/usePurchaseOrders.ts` | hooks React Query (lista, detalhe, create, update, itens) |
| `src/hooks/useNomusLookup.ts` | busca genérica no Nomus (pessoas, tiposMovimentacao, empresas) |
| `src/components/compras/NomusPessoaSearch.tsx` | autocomplete de pessoa (fornecedor/comprador) |
| `src/components/compras/PurchaseOrderItemsTable.tsx` | tabela de itens |
| `src/pages/PCDetailPage.tsx` | página de detalhe |
| `src/pages/PedidosCompraPage.tsx` | página de lista |
| `src/lib/purchaseOrderPdf.ts` | geração do PDF da lista (jsPDF) |
| `supabase/functions/nomus-search/index.ts` | estender com novos `type` |
| `supabase/functions/nomus-create-purchase-order/index.ts` | criar pedido na Nomus |
| `src/components/tickets/TicketDetailDialog.tsx` | nova aba "Ped. Compras" |
| `src/App.tsx`, `AppSidebar.tsx`, `src/lib/crmModules.ts` | rota + menu + permissão |

---

## 8. Testes

- Migration aplica; `generate_pc_number()` gera números sequenciais corretos.
- CRUD de `purchase_orders` e `purchase_order_items`.
- `nomus-create-purchase-order` monta o corpo JSON correto (teste com payload mock).
- Geração de PDF produz arquivo válido.
- Upload do PDF do fornecedor grava URL e status.

---

## 9. Pendências / a confirmar (não bloqueiam o início)

A estrutura de banco e telas fica pronta; os itens abaixo são plugados conforme as informações chegam:

1. **Endpoint de busca de pessoas** — a documentação fornecida cobre `GET /rest/pessoas/:id` (detalhar) e `POST` (criar), não a busca por `query`. Assumido o padrão `query=nome="*TERMO*"` (igual à busca de clientes existente); ajustar no primeiro teste.
2. **Contato** — assumido que vem do `contatosBean` do fornecedor selecionado. Confirmar.
3. **Condição / forma de pagamento** — tela usa condição como texto livre; API exige `idCondicaoPagamento` e `idFormaPagamento` (inteiros). Definir defaults/mapeamento.
4. **Endpoints GET ainda sem documentação:** empresas, classificações financeiras, unidades de medida.
5. **Valores default:** `idTipoPedidoCompra`, `idSetorEntrada`, `idFormaPagamento` — confirmar com o Nomus.
6. **Comprador/Contato/Observações** não constam no corpo `POST` documentado — gravados localmente; enviados ao Nomus apenas se a API aceitar campos extras.

---

## 10. Fora de escopo (YAGNI)

- Cadastro local de fornecedores (fornecedor vem do Nomus).
- Envio automático de e-mail ao fornecedor (o PDF é baixado e enviado manualmente).
- Múltiplos PDFs de orçamento por pedido (um PDF, substituível).
- Sincronização de volta do status do pedido a partir do Nomus.
