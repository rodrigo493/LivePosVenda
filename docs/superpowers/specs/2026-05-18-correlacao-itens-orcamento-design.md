# Correlação de itens de orçamento — Design

**Data:** 2026-05-18
**Módulo:** Pedido de Compras (PC) — leitura de orçamento por IA
**Arquivos-base:** `extract-supplier-quote`, `SupplierQuoteReviewDialog.tsx`, `quoteExtraction.ts`, `PCDetailPage.tsx`

## Contexto e problema

Ao importar um PDF/imagem de orçamento no Pedido de Compras, a IA devolve dois grupos:
`items` (linhas do orçamento que ela conseguiu correlacionar com itens do pedido) e
`extra_items` (linhas cotadas que ela **não** correlacionou com nenhum item do pedido).

Hoje os `extra_items` só podem ser **incluídos como itens novos** (checkbox). Mas muitas vezes
um `extra_item` é, na verdade, um item que **já está no pedido** — a IA não correlacionou
porque o fornecedor usa um **código ou nome diferente** do nosso.

O comprador precisa de uma forma de dizer manualmente "esse item do fornecedor é o nosso
item X". E, uma vez feita essa correlação, o sistema deve **lembrar** para o mesmo
fornecedor nas próximas cotações.

## Objetivos

- Em cada `extra_item`, oferecer um seletor para **correlacionar** com um item do pedido.
- Ao correlacionar: os valores cotados (valor unitário, % desconto, valor desconto, data de
  entrega) vão para o item do pedido correspondente. O item do pedido **mantém o nome
  original**; ganha uma observação com o nome do item no orçamento do fornecedor.
- O `extra_item` correlacionado deixa de ser tratado como item novo.
- Persistir a correlação por fornecedor (`supplier_product_aliases`) para auto-correlacionar
  nas próximas cotações.
- Numa próxima cotação do mesmo fornecedor, o item já aparece pré-correlacionado no diálogo,
  com selo "aprendido", e o usuário ainda pode revisar/desfazer antes de aplicar.

## Não-objetivos

- Alterar a `extract-supplier-quote` (a edge function continua só extraindo).
- Tela de gerenciamento (listar/editar/excluir) dos aliases aprendidos.
- Apagar um alias quando o usuário desfaz uma correlação pré-preenchida (o alias salvo
  permanece; apenas não é aplicado naquela cotação).

## Modelo de dados (1 migration nova)

### Tabela `public.supplier_product_aliases`

O "aprendizado" — vincula o jeito que um fornecedor nomeia um item ao nosso produto.

| Campo | Tipo | Uso |
|---|---|---|
| `id` | uuid PK | — |
| `nomus_fornecedor_id` | integer NOT NULL | de qual fornecedor é o alias |
| `match_key` | text NOT NULL | chave de busca normalizada (ver regra abaixo) |
| `alias_codigo` | text | código do item no orçamento do fornecedor |
| `alias_descricao` | text | descrição do item no orçamento do fornecedor |
| `nomus_produto_id` | integer | id do nosso produto |
| `produto_codigo` | text | nosso código |
| `produto_descricao` | text | nosso nome (referência/exibição) |
| `created_by` | uuid REFERENCES auth.users(id) | quem ensinou |
| `created_at` / `updated_at` | timestamptz NOT NULL DEFAULT now() | — |

- Restrição `UNIQUE (nomus_fornecedor_id, match_key)`. Recorrelacionar o mesmo
  `match_key` faz **upsert** (atualiza o produto vinculado + `updated_at`).
- Índice em `nomus_fornecedor_id` para o carregamento por fornecedor.
- RLS: `ENABLE ROW LEVEL SECURITY` + policy `FOR ALL TO authenticated USING (true)
  WITH CHECK (true)` — mesmo padrão de `suppliers`.

### Coluna nova em `public.purchase_order_items`

```sql
ALTER TABLE public.purchase_order_items ADD COLUMN correlacao_fornecedor text;
```

Guarda o nome do item **no orçamento do fornecedor** (a "observação"). É **display-only**:
não entra no PDF de cotação nem no payload do pedido Nomus.

## Regra do `match_key`

Função pura `supplierMatchKey(codigo, descricao)`:

1. Se `codigo` (trim) não-vazio → `match_key = codigo.trim().toLowerCase()`.
2. Senão → `match_key = normalize(descricao)`: minúsculas, remove acentos
   (`NFD` + remoção de marcas combinantes), colapsa espaços, trim.
3. Se ambos vazios → sem `match_key` → o item não pode ser aprendido nem auto-correlacionado.

A mesma função é usada para gravar o alias e para procurar match numa nova cotação.

## Fluxo no diálogo de revisão

1. **Carregamento dos aliases.** `PCDetailPage` carrega `supplier_product_aliases` do
   `po.nomus_fornecedor_id` e passa ao `SupplierQuoteReviewDialog`. Se o pedido não tem
   fornecedor (`nomus_fornecedor_id` null), nenhum alias é carregado e a auto-correlação
   fica inativa (a correlação manual continua disponível).

2. **Pré-correlação.** Para cada `extra_item`, calcula-se o `match_key` e procura-se um
   alias. Se houver alias **e** o produto do alias estiver entre os itens deste pedido
   (match por `nomus_produto_id`, ou por `produto_codigo` quando o id é null) → o seletor
   já vem preenchido com aquele item do pedido e exibe o selo **✨ aprendido**.

3. **UI por linha de `extra_item`.** Cada linha da seção "Itens cotados fora do pedido"
   ganha um seletor **"Correlacionar com →"** listando os itens do pedido (rótulo:
   `produto_descricao ?? produto_codigo`) mais a opção "— (incluir como item novo)".
   - Com correlação escolhida: o checkbox "incluir como novo" some/desabilita; aparece o
     nome do item do pedido + selo "aprendido" quando veio de alias.
   - Sem correlação: comportamento atual (checkbox para incluir como novo).

4. **Reflexo imediato.** Ao escolher/trocar a correlação, a linha do item correspondente
   na seção "Itens do pedido" é atualizada na hora com os valores cotados do extra e passa
   a exibir, ao lado do nome original, a observação `correlacao_fornecedor`.

## Comportamento ao aplicar ("Aplicar ao pedido")

`buildQuoteItemUpdates` passa a receber também os itens do pedido e o `nomus_fornecedor_id`,
e classifica cada `extra`:

- **Extra correlacionado** → vira um `QuoteItemUpdate` do item do pedido alvo:
  valor unitário, % desconto, valor desconto e data de entrega vêm do extra;
  `correlacao_fornecedor` recebe o nome (`descricao`) do extra. **Não** gera item novo.
  A `quantidade` do item do pedido é preservada (não se usa a quantidade cotada),
  consistente com como um match normal da IA já se comporta.
  Se o mesmo item do pedido também recebeu valores de um match da IA (`state.items`),
  os valores do extra correlacionado **prevalecem** nos campos que ele fornece.
- **Extra marcado, sem correlação** → item novo (comportamento atual).
- **Extra não marcado e sem correlação** → ignorado (comportamento atual).

`buildQuoteItemUpdates` passa a devolver, além de `itemUpdates`/`newItems`/
`condicao_pagamento`, uma lista `aliasesToLearn` — um registro por extra correlacionado
que tenha `match_key`, contendo `nomus_fornecedor_id`, `match_key`, `alias_codigo`,
`alias_descricao` e a identidade do nosso produto (`nomus_produto_id`, `produto_codigo`,
`produto_descricao`) do item do pedido alvo.

`PCDetailPage.handleApplyExtraction`:
- Aplica `itemUpdates` (agora incluindo `correlacao_fornecedor`) e `newItems` como hoje.
- Faz **upsert** de `aliasesToLearn` em `supplier_product_aliases`
  (`onConflict: "nomus_fornecedor_id,match_key"`). O upsert é idempotente — reaplicar uma
  correlação "aprendida" sem mudança apenas atualiza `updated_at`.

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `supabase/migrations/20260518000002_supplier_product_aliases.sql` | nova tabela + RLS + coluna `correlacao_fornecedor` |
| `src/types/purchaseOrder.ts` | `PurchaseOrderItem.correlacao_fornecedor`; novo tipo `SupplierProductAlias` |
| `src/lib/quoteExtraction.ts` | `supplierMatchKey()`; `QuoteReviewExtra.correlatedPoItemId`; `QuoteItemUpdate.correlacao_fornecedor`; `buildQuoteItemUpdates` nova assinatura + `aliasesToLearn` |
| `src/lib/quoteExtraction.test.ts` | testes do match key, da pré-correlação e do novo `buildQuoteItemUpdates` |
| `src/components/compras/SupplierQuoteReviewDialog.tsx` | seletor de correlação por extra, selo "aprendido", reflexo na seção "Itens do pedido" |
| `src/hooks/usePurchaseOrders.ts` | hook para carregar aliases por fornecedor |
| `src/pages/PCDetailPage.tsx` | carrega aliases, passa ao diálogo, upsert no apply |

A edge function `extract-supplier-quote` **não muda**.

## Casos de borda

- **Pedido sem fornecedor** (`nomus_fornecedor_id` null): sem auto-correlação e sem
  aprendizado (não há como chavear o alias); correlação manual segue funcionando só na
  sessão.
- **Extra sem código e sem descrição**: não entra em `aliasesToLearn`.
- **Alias aponta para produto que não está neste pedido**: sugestão descartada
  silenciosamente.
- **Dois itens do pedido com o mesmo produto**: sugere o primeiro.
- **Usuário desfaz uma correlação pré-preenchida**: naquela cotação o extra volta a ser
  tratado como normal; o alias salvo permanece para cotações futuras.

## Testes

- `supplierMatchKey`: prioriza código; cai para descrição normalizada; acentos/espaços;
  ambos vazios → sem chave.
- `buildQuoteItemUpdates`: extra correlacionado vira `itemUpdate` com
  `correlacao_fornecedor` e não vira `newItem`; extra correlacionado prevalece sobre match
  da IA no mesmo item; `aliasesToLearn` montado corretamente; extra sem chave fica fora de
  `aliasesToLearn`; extras marcados/normais inalterados.
