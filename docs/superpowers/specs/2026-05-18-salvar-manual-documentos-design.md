# Design — Salvar manual + aviso de alterações não salvas (PG/PD/PA/PC)

**Data:** 2026-05-18
**Autor:** Rodrigo Siqueira (via Claude)
**Status:** Aprovação pendente

## Problema

Os documentos de detalhe do pós-venda/compras gravam alterações automaticamente,
sem o usuário pedir:

- **PC** (Pedido de Compra): cada campo grava ao sair do campo (`onBlur`); o status
  grava ao selecionar. Não há botão "Salvar".
- **PD** (Pedido de Venda) e **PA** (Pedido de Acessórios): método de pagamento e
  status gravam imediatamente ao selecionar; parcelas gravam no `onBlur`.

Resultado: o usuário sente que "ao abrir o documento ele já salva sozinho", e não
existe nenhum aviso ao sair com alterações pendentes — mudanças são perdidas (ou
gravadas) silenciosamente.

## Objetivo

Nenhum campo grava sozinho. O usuário entra em **modo edição**, altera e grava
apenas ao apertar **"Salvar"**. Ao clicar **"Voltar"** com alterações pendentes,
o sistema pergunta o que fazer.

Decisões do usuário (brainstorming):
- Manter o padrão de **modo edição** (botão "Editar" → "Salvar").
- O aviso de alterações não salvas dispara **somente no botão "Voltar"** do
  sistema (não no fechar aba/navegador).

## Escopo

| Arquivo | Mudança |
|---|---|
| `src/pages/PCDetailPage.tsx` | Criar modo edição; remover auto-save `onBlur`/`onChange` |
| `src/pages/PDDetailPage.tsx` | Remover auto-saves parciais; aviso ao voltar |
| `src/pages/PADetailPage.tsx` | Remover auto-saves parciais; aviso ao voltar |
| `src/pages/PGDetailPage.tsx` | Aviso ao voltar (salvamento já é manual) |
| `src/components/UnsavedChangesDialog.tsx` | **Novo** — diálogo de confirmação reutilizável |

Sem mudança de schema, sem mudança em edge functions.

## Comportamento por documento

### PC — Pedido de Compra (maior mudança)

Estado atual: sem modo edição. O componente `FieldInput` grava no `onBlur` via
`update()`; campos de data gravam no `onBlur`; o `Select` de status grava no
`onValueChange`.

Novo comportamento:
- Adicionar estado `editing: boolean` (inicia `false`).
- Botão **"Editar"** ativa `editing = true` e tira um snapshot dos valores atuais.
- Em modo edição, `FieldInput`, inputs de data e o `Select` de status passam a
  guardar os valores num **estado local de rascunho** — não chamam `update()`.
- Botão **"Salvar"** aplica todos os campos do rascunho de uma só vez via a
  mutation existente (`useUpdatePurchaseOrder`), depois `editing = false`.
- Botão **"Cancelar"** descarta o rascunho e volta a `editing = false`.
- Fora do modo edição, os campos ficam somente leitura (exibem o valor).

### PD — Pedido de Venda / PA — Pedido de Acessórios

Estado atual: já possuem modo edição para itens, mas três campos gravam sozinhos:
- `handlePaymentMethodChange` — grava método de pagamento ao selecionar.
- `handleInstallmentsBlur` — grava parcelas no `onBlur`.
- `handleStatusChange` — grava status ao selecionar.

Novo comportamento:
- Remover o auto-save dessas três funções: os campos passam a alterar apenas o
  estado local.
- Os campos de **"Detalhes do orçamento"** (método de pagamento, parcelas,
  validade, notas do orçamento) deixam de ser editáveis fora do modo edição —
  passam a só ficar editáveis após o clique em **"Editar"**.
- O botão **"Salvar Detalhes"** deixa de existir. A persistência desses campos
  (`saveQuoteDetails`) é unificada no botão **"Salvar"** único do modo edição.
- **Status** também é persistido nesse mesmo "Salvar".
- Resultado: PD/PA passam a ter exatamente um fluxo — "Editar" → "Salvar" /
  "Cancelar" — gravando notas, custo, status, itens e detalhes do orçamento de
  uma só vez. Comportamento idêntico a PG e PC.

### PG — Pedido de Garantia

Estado atual: salvamento já é totalmente manual (botão "Salvar" / modo edição).

Novo comportamento: nenhuma mudança no salvamento. Apenas ganha o aviso ao voltar.

## Detecção de alterações não salvas (`isDirty`)

Ao entrar em modo edição, cada página tira um **snapshot** dos valores editáveis
(objeto simples com os campos relevantes). `isDirty` é `true` quando o estado de
edição atual difere do snapshot (comparação rasa campo a campo).

- PC: snapshot dos campos do rascunho.
- PD/PA: snapshot de notas, custo, status, e dos campos de "Detalhes do orçamento"
  (método de pagamento, parcelas, validade, notas do orçamento).
- PG: snapshot de defect, analysis, parts, squad_notes, internal_cost e itens.

Quando `editing` é `false`, `isDirty` é sempre `false`.

## Diálogo de aviso ao clicar "Voltar"

Componente novo `UnsavedChangesDialog` (baseado no `Dialog`/`AlertDialog` já usado
no projeto — shadcn/ui).

Ao clicar no botão **"Voltar"**:
- Se `!editing || !isDirty` → navega normalmente (comportamento atual).
- Se `editing && isDirty` → abre o diálogo:

  - **Título:** "Alterações não salvas"
  - **Texto:** "Você tem alterações não salvas neste documento. Tem certeza que
    deseja sair sem salvar?"
  - **Botões:**
    - `Salvar e sair` — executa o "Salvar" da página e, em caso de sucesso, navega.
    - `Sair sem salvar` — descarta e navega.
    - `Continuar editando` — fecha o diálogo, permanece na página.

O diálogo é controlado por props: `open`, `onSaveAndExit`, `onDiscardAndExit`,
`onCancel`. A lógica de "salvar" e "navegar" fica em cada página; o componente é
só a UI da confirmação.

## Fluxo de dados

```
Abrir documento
  └─ modo leitura (editing = false), nada grava

Clicar "Editar"
  └─ editing = true
  └─ snapshot dos valores
  └─ campos passam a editar estado local de rascunho

Clicar "Salvar"
  └─ persiste rascunho no Supabase (uma chamada por entidade)
  └─ editing = false

Clicar "Cancelar"
  └─ descarta rascunho, editing = false

Clicar "Voltar"
  ├─ !editing || !isDirty → navega
  └─ editing && isDirty   → UnsavedChangesDialog
        ├─ Salvar e sair      → salva, depois navega
        ├─ Sair sem salvar    → navega
        └─ Continuar editando → fecha diálogo
```

## Tratamento de erros

- "Salvar" e "Salvar e sair": se a chamada ao Supabase falhar, exibir toast de
  erro e **não navegar** — o usuário permanece em modo edição com o rascunho
  intacto.
- "Sair sem salvar": navega sempre (não há chamada ao backend).

## Testes

- `isDirty` é `false` ao abrir e ao entrar em edição sem alterar nada.
- `isDirty` vira `true` ao alterar qualquer campo editável.
- "Voltar" sem alterações navega direto, sem diálogo.
- "Voltar" com alterações abre o diálogo.
- "Salvar e sair" com falha de backend mantém o usuário na página.
- PC: alterar um campo e não salvar não persiste no banco (sem auto-save).
- PD/PA: alterar método de pagamento/parcelas/status não persiste até o clique
  no botão de salvar correspondente.

## Fora de escopo (YAGNI)

- Aviso ao fechar a aba/navegador (`beforeunload`) — decisão explícita do usuário.
- Auto-save com debounce / rascunho persistido.
