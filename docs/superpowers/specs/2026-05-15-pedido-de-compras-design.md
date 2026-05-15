# Pedido de Compras (PC) — Documento de Design

**Data:** 2026-05-15
**Projeto:** LivePosVenda CRM
**Autor:** Rodrigo Siqueira + Claude

---

## 1. Contexto e objetivo

O setor de compras precisa de um fluxo para adquirir matéria-prima:

1. Selecionar a matéria-prima através da integração com o Nomus (ERP).
2. Enviar uma lista de itens ao fornecedor (solicitação de orçamento) — por PDF e/ou e-mail.
3. Importar o PDF do orçamento que o fornecedor devolve.
4. Criar o pedido de compra dentro do Nomus.

A feature espelha o padrão **PA (Pedido de Acessórios)** já existente — aba no card + página de detalhe + página de lista — mas usa **tabelas próprias**, porque os campos de compra são diferentes dos de atendimento ao cliente. Reaproveitar `service_requests`/`quotes` (usadas pelo PA) poluiria as telas de atendimento; descartado.

Acompanha uma **agenda local de fornecedores** (e-mails de contato) e **envio de e-mail** ao fornecedor.

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
| `nomus_fornecedor_id` | integer | id da pessoa Nomus (categoria fornecedor) |
| `nomus_fornecedor_nome` | text | |
| `nomus_tipo_movimentacao_id` | integer | `codigo` do tipo de movimentação |
| `nomus_tipo_movimentacao_label` | text | |
| `data_emissao` | date | |
| `data_entrega_padrao` | date | |
| `nomus_contato_label` | text | contato (do fornecedor) |
| `nomus_comprador_id` | integer | id da pessoa Nomus (categoria comprador) |
| `nomus_comprador_nome` | text | |
| `condicao_pagamento` | text | texto livre (igual à tela do Nomus) |
| `observacoes` | text | |
| `nomus_order_id` | integer | `id` retornado pelo POST do Nomus |
| `nomus_codigo_pedido` | text | `codigoPedido` retornado |
| `nomus_sent_at` | timestamptz | quando foi criado no Nomus |
| `email_sent_at` | timestamptz | quando o e-mail ao fornecedor foi enviado |
| `email_to` | text | e-mail de destino usado no envio |
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

### 2.3 Tabela `suppliers` (agenda local de fornecedores)

Agenda de e-mails de contato, **ligada ao fornecedor do Nomus**. Não substitui o Nomus como fonte — serve para guardar/sobrescrever o e-mail de destino do envio.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `nomus_pessoa_id` | integer UNIQUE | vínculo com o fornecedor no Nomus |
| `nome` | text | nome do fornecedor |
| `email` | text | e-mail de destino (sobrescreve o do Nomus) |
| `telefone` | text | |
| `contato` | text | nome da pessoa de contato |
| `observacoes` | text | |
| `ativo` | boolean | default `true` |
| `created_by` | uuid | |
| `created_at` / `updated_at` | timestamptz | |

RLS: `authenticated`.

### 2.4 RPC `generate_pc_number()`

Idêntica a `generate_pa_number()`, prefixo `PC.` — formato `PC.<AA>.<NNN>`.

### 2.5 Storage

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

**Barra de ações** (4 botões): Gerar PDF · Enviar email PC · Importar orçamento · Criar pedido na Nomus.

### 3.3 Página de lista `/pedidos-compra` (`PedidosCompraPage`)

Lista todos os PCs, com filtro por status e busca por número/fornecedor.

### 3.4 Página de fornecedores `/fornecedores` (`FornecedoresPage`)

Tela de cadastro da agenda local de fornecedores (tabela `suppliers`):

- Lista de fornecedores cadastrados (nome, e-mail, telefone, contato, ativo).
- **Adicionar** — busca o fornecedor no Nomus (autocomplete `/rest/pessoas`, categoria `fornecedor`), o que preenche `nomus_pessoa_id` + `nome`; o usuário informa/ajusta o e-mail e demais campos.
- Editar e desativar registros.

### 3.5 Menu lateral e permissão

Conforme regra obrigatória do projeto (`CLAUDE.md` — Sincronização Sidebar ↔ crmModules):

- Item "Pedidos de Compra" em `AppSidebar.tsx` (seção Operações), `moduleKey: 'pedidos_compra'`.
- Item "Fornecedores" em `AppSidebar.tsx`, `moduleKey: 'fornecedores'`.
- Entries correspondentes em `src/lib/crmModules.ts`.
- Rotas em `src/App.tsx`: `/pedidos-compra`, `/pedidos-compra/:id`, `/fornecedores`.

---

## 4. Fluxo / status

```
rascunho ──[Enviar email PC]──▶ enviado_fornecedor ──[Importar PDF]──▶ orcamento_recebido ──[Criar na Nomus]──▶ criado_nomus
```

"Gerar PDF" é uma ação auxiliar (download) e não muda o status. O status também pode ser ajustado manualmente. `cancelado` disponível a qualquer momento.

---

## 5. Botões de ação

### 5.1 Gerar PDF da lista

- Geração client-side com `jsPDF` (mesmo padrão do contrato PDF já existente).
- Conteúdo: cabeçalho com logo Live, número do PC, data, dados do fornecedor, **tabela de itens com produto e quantidade** (sem valor unitário — é uma solicitação de cotação; o preço vem do fornecedor depois), observações.
- Apenas baixa o arquivo; não altera status.

### 5.2 Enviar email PC

- Gera o PDF da lista (5.1), converte em base64 e chama a edge function `send-purchase-order-email`.
- **Remetente:** `compras@liveuniverse.com.br` (caixa Hostinger, via SMTP).
- **Destinatário:** resolvido nesta ordem — (1) e-mail do registro em `suppliers` com `nomus_pessoa_id` = fornecedor do PC; (2) se não houver, o `email` retornado pelo Nomus em `GET /rest/pessoas/:id`.
- **Corpo:** texto padrão (saudação + solicitação de cotação) com o PDF anexado.
- Em sucesso: grava `email_sent_at` e `email_to`; status → `enviado_fornecedor`.

### 5.3 Importar orçamento do fornecedor

- File input (`accept=".pdf"`) → upload para o bucket `compras-orcamentos` → grava `supplier_quote_pdf_url` + `supplier_quote_uploaded_at` → status → `orcamento_recebido`.
- Mostra link para abrir o PDF; permite substituir.

### 5.4 Criar pedido na Nomus

- Chama a edge function `nomus-create-purchase-order` (ver seção 6.2).
- Em sucesso: grava `nomus_order_id`, `nomus_codigo_pedido`, `nomus_sent_at`; status → `criado_nomus`.

---

## 6. Integração Nomus e e-mail

### 6.1 Edge function `nomus-search` — estender

Novos valores de `type`:

- **`pessoas`** — `GET /rest/pessoas?query=nome="*TERMO*"`. Parâmetro extra `categoria` (`fornecedor` | `comprador`) para filtrar pelo campo `categorias.<x> = true` do retorno. Retorna `id`, `nome`, `codigo`, `cnpj`, `email`, contatos.
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
  "dataEmissao": "dd/MM/yyyy",
  "dataEntregaPadrao": "dd/MM/yyyy",
  "itensPedidoCompra": [
    {
      "idProduto": <nomus_produto_id>,
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
- CORS: incluir `apikey, x-client-info` nos headers permitidos.

### 6.3 Edge function nova `send-purchase-order-email`

- Entrada: `purchase_order_id`, `pdf_base64` (PDF gerado no cliente).
- Resolve o e-mail de destino (regra da seção 5.2).
- Envia via **SMTP da Hostinger** (`smtp.hostinger.com`, porta 465/SSL) autenticando como `compras@liveuniverse.com.br`. Biblioteca: cliente SMTP para Deno (ex.: `denomailer`).
- Anexa o PDF; corpo de texto padrão.
- Retorna sucesso/erro; o cliente atualiza status e `email_sent_at`/`email_to`.
- **Segredo:** a senha da caixa de e-mail é armazenada como secret do Supabase (`COMPRAS_SMTP_PASSWORD`) — nunca no código nem versionada.
- CORS: incluir `apikey, x-client-info`.

### 6.4 Defaults configuráveis (`system_settings`)

Campos exigidos pela API que não têm campo na tela:

- `nomus_pc_id_forma_pagamento`.
- `nomus_pc_id_condicao_pagamento` — mapeamento, já que a tela usa condição como texto livre.

> **`idTipoPedidoCompra` e `idSetorEntrada` não serão enviados** (decisão do usuário) — campos removidos da tela e omitidos do `POST`. Risco: se a API do Nomus exigir esses campos, o `POST` falhará e será necessário revisar. A ser validado no primeiro teste real.

---

## 7. Componentes (isolamento e responsabilidade)

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/<ts>_purchase_orders.sql` | tabelas, RPC, RLS, bucket |
| `src/hooks/usePurchaseOrders.ts` | hooks React Query (lista, detalhe, create, update, itens) |
| `src/hooks/useSuppliers.ts` | CRUD da agenda de fornecedores |
| `src/hooks/useNomusLookup.ts` | busca genérica no Nomus (pessoas, tiposMovimentacao, empresas) |
| `src/components/compras/NomusPessoaSearch.tsx` | autocomplete de pessoa (fornecedor/comprador) |
| `src/components/compras/PurchaseOrderItemsTable.tsx` | tabela de itens |
| `src/pages/PCDetailPage.tsx` | página de detalhe do PC |
| `src/pages/PedidosCompraPage.tsx` | página de lista de PCs |
| `src/pages/FornecedoresPage.tsx` | agenda de fornecedores |
| `src/lib/purchaseOrderPdf.ts` | geração do PDF da lista (jsPDF) |
| `supabase/functions/nomus-search/index.ts` | estender com novos `type` |
| `supabase/functions/nomus-create-purchase-order/index.ts` | criar pedido na Nomus |
| `supabase/functions/send-purchase-order-email/index.ts` | enviar e-mail ao fornecedor |
| `src/components/tickets/TicketDetailDialog.tsx` | nova aba "Ped. Compras" |
| `src/App.tsx`, `AppSidebar.tsx`, `src/lib/crmModules.ts` | rotas + menu + permissão |

---

## 8. Testes

- Migration aplica; `generate_pc_number()` gera números sequenciais corretos.
- CRUD de `purchase_orders`, `purchase_order_items` e `suppliers`.
- `nomus-create-purchase-order` monta o corpo JSON correto (teste com payload mock).
- `send-purchase-order-email` resolve o destinatário correto (local → Nomus) e monta o e-mail.
- Geração de PDF produz arquivo válido.
- Upload do PDF do fornecedor grava URL e status.

---

## 9. Pendências / a confirmar (não bloqueiam o início)

A estrutura de banco e telas fica pronta; os itens abaixo são plugados conforme as informações chegam:

1. **Endpoint de busca de pessoas** — a documentação cobre `GET /rest/pessoas/:id` e `POST`, não a busca por `query`. Assumido o padrão `query=nome="*TERMO*"` (igual à busca de clientes existente); ajustar no primeiro teste.
2. **Contato** — assumido que vem do `contatosBean` do fornecedor selecionado. Confirmar.
3. **Condição / forma de pagamento** — tela usa condição como texto livre; API exige `idCondicaoPagamento` e `idFormaPagamento` (inteiros). Definir defaults/mapeamento.
4. **Endpoints GET ainda sem documentação:** empresas, classificações financeiras, unidades de medida.
5. **Valor default `idFormaPagamento`** — confirmar com o Nomus.
6. **Comprador/Contato/Observações** não constam no corpo `POST` documentado — gravados localmente; enviados ao Nomus apenas se a API aceitar campos extras.
7. **`idTipoPedidoCompra` / `idSetorEntrada`** — omitidos do `POST` por decisão do usuário; validar no primeiro teste se a API aceita sem eles.
8. **Senha SMTP da Hostinger** — o usuário deve fornecer a senha da caixa `compras@liveuniverse.com.br` e ela será gravada como secret do Supabase (`COMPRAS_SMTP_PASSWORD`).

---

## 10. Fora de escopo (YAGNI)

- Múltiplos PDFs de orçamento por pedido (um PDF, substituível).
- Sincronização de volta do status do pedido a partir do Nomus.
- Cadastro de fornecedores totalmente independente do Nomus (a agenda local sempre se liga a um fornecedor Nomus via `nomus_pessoa_id`).
