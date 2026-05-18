# Salvar Manual + Aviso de Alterações Não Salvas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o auto-save dos documentos PG/PD/PA/PC por um fluxo manual (modo edição → botão "Salvar"), com diálogo de confirmação ao clicar "Voltar" com alterações pendentes.

**Architecture:** Cada página de detalhe ganha um estado `editing` e um estado de rascunho (`draft`). Fora do modo edição, campos ficam somente leitura e nada grava. O botão "Salvar" persiste tudo de uma vez. Um componente compartilhado `UnsavedChangesDialog` exibe a confirmação ao sair. A detecção de alterações (`isDirty`) compara o rascunho com um snapshot tirado ao entrar em edição.

**Tech Stack:** React 18 + TypeScript, Vite, shadcn/ui (`alert-dialog`), React Query, Supabase, vitest + @testing-library/react.

**Spec de referência:** `docs/superpowers/specs/2026-05-18-salvar-manual-documentos-design.md`

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/components/UnsavedChangesDialog.tsx` | **Novo.** Diálogo de confirmação reutilizável (3 botões) |
| `src/components/UnsavedChangesDialog.test.tsx` | **Novo.** Testes do diálogo |
| `src/pages/PCDetailPage.tsx` | Criar modo edição; remover auto-save `onBlur`/`onChange` dos campos |
| `src/pages/PGDetailPage.tsx` | Adicionar guarda no botão "Voltar" |
| `src/pages/PDDetailPage.tsx` | Remover auto-saves parciais; unificar salvar; guarda no "Voltar" |
| `src/pages/PADetailPage.tsx` | Idem PD |

---

## Task 1: Componente UnsavedChangesDialog

**Files:**
- Create: `src/components/UnsavedChangesDialog.tsx`
- Test: `src/components/UnsavedChangesDialog.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// src/components/UnsavedChangesDialog.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

describe("UnsavedChangesDialog", () => {
  it("não renderiza conteúdo quando open=false", () => {
    render(
      <UnsavedChangesDialog
        open={false}
        onSaveAndExit={vi.fn()}
        onDiscardAndExit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText("Alterações não salvas")).toBeNull();
  });

  it("dispara onSaveAndExit ao clicar 'Salvar e sair'", async () => {
    const onSave = vi.fn();
    render(
      <UnsavedChangesDialog
        open
        onSaveAndExit={onSave}
        onDiscardAndExit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Salvar e sair" }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("dispara onDiscardAndExit ao clicar 'Sair sem salvar'", async () => {
    const onDiscard = vi.fn();
    render(
      <UnsavedChangesDialog
        open
        onSaveAndExit={vi.fn()}
        onDiscardAndExit={onDiscard}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Sair sem salvar" }));
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it("dispara onCancel ao clicar 'Continuar editando'", async () => {
    const onCancel = vi.fn();
    render(
      <UnsavedChangesDialog
        open
        onSaveAndExit={vi.fn()}
        onDiscardAndExit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Rodar o teste e verificar que falha**

Run: `npm test -- src/components/UnsavedChangesDialog.test.tsx`
Expected: FAIL — `Failed to resolve import "./UnsavedChangesDialog"`

> Se `@testing-library/user-event` não estiver instalado, o teste falhará na importação. Nesse caso, trocar `userEvent.click(x)` por `fireEvent.click(x)` (`import { fireEvent } from "@testing-library/react"`).

- [ ] **Step 3: Implementar o componente**

```tsx
// src/components/UnsavedChangesDialog.tsx
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface UnsavedChangesDialogProps {
  open: boolean;
  onSaveAndExit: () => void;
  onDiscardAndExit: () => void;
  onCancel: () => void;
  saving?: boolean;
}

/** Confirmação exibida ao tentar sair de um documento com alterações não salvas. */
export function UnsavedChangesDialog({
  open,
  onSaveAndExit,
  onDiscardAndExit,
  onCancel,
  saving = false,
}: UnsavedChangesDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Alterações não salvas</AlertDialogTitle>
          <AlertDialogDescription>
            Você tem alterações não salvas neste documento. Tem certeza que deseja
            sair sem salvar?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Continuar editando
          </Button>
          <Button variant="destructive" onClick={onDiscardAndExit} disabled={saving}>
            Sair sem salvar
          </Button>
          <Button onClick={onSaveAndExit} disabled={saving}>
            {saving ? "Salvando..." : "Salvar e sair"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 4: Rodar o teste e verificar que passa**

Run: `npm test -- src/components/UnsavedChangesDialog.test.tsx`
Expected: PASS — 4 testes verdes

- [ ] **Step 5: Commit**

```bash
git add src/components/UnsavedChangesDialog.tsx src/components/UnsavedChangesDialog.test.tsx
git commit -m "feat(documentos): dialogo de confirmacao de alteracoes nao salvas"
```

---

## Task 2: PCDetailPage — modo edição + remover auto-save

**Files:**
- Modify: `src/pages/PCDetailPage.tsx`

Estado atual: `FieldInput`/`FieldTextarea` gravam no `onBlur`; inputs de data gravam no `onBlur`; o `Select` de status grava no `onValueChange` — tudo via `update()`, que chama `updatePO.mutate` imediatamente. Não há modo edição nem botão "Salvar".

Campos editáveis a colocar no rascunho: `nomus_empresa_label`, `nomus_fornecedor_id`, `nomus_fornecedor_nome`, `nomus_tipo_movimentacao_id`, `nomus_tipo_movimentacao_label`, `data_emissao`, `data_entrega_padrao`, `nomus_contato_label`, `nomus_comprador_id`, `nomus_comprador_nome`, `condicao_pagamento`, `observacoes`, `status`.

> **Permanecem com gravação imediata** (são ações, não edição de campo): `handleFileChange` (importar orçamento), `handleApplyExtraction` (aplicar IA), itens via `PurchaseOrderItemsTable`/`ProductSearch`. Não mexer nesses.

- [ ] **Step 1: Adicionar tipo de rascunho e estados**

Logo após os imports, definir o tipo do rascunho:

```tsx
type PCDraft = {
  nomus_empresa_label: string | null;
  nomus_fornecedor_id: number | null;
  nomus_fornecedor_nome: string | null;
  nomus_tipo_movimentacao_id: number | null;
  nomus_tipo_movimentacao_label: string | null;
  data_emissao: string | null;
  data_entrega_padrao: string | null;
  nomus_contato_label: string | null;
  nomus_comprador_id: number | null;
  nomus_comprador_nome: string | null;
  condicao_pagamento: string | null;
  observacoes: string | null;
  status: PurchaseOrderStatus;
};
```

Dentro do componente, junto aos outros `useState`:

```tsx
const [editing, setEditing] = useState(false);
const [draft, setDraft] = useState<PCDraft | null>(null);
const [showExitDialog, setShowExitDialog] = useState(false);
const [savingExit, setSavingExit] = useState(false);
```

Importar o diálogo no topo:

```tsx
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";
```

- [ ] **Step 2: Funções de edição, dirty e navegação**

Adicionar após a função `update()` existente:

```tsx
function buildDraft(): PCDraft {
  return {
    nomus_empresa_label: po!.nomus_empresa_label ?? null,
    nomus_fornecedor_id: po!.nomus_fornecedor_id ?? null,
    nomus_fornecedor_nome: po!.nomus_fornecedor_nome ?? null,
    nomus_tipo_movimentacao_id: po!.nomus_tipo_movimentacao_id ?? null,
    nomus_tipo_movimentacao_label: po!.nomus_tipo_movimentacao_label ?? null,
    data_emissao: po!.data_emissao ?? null,
    data_entrega_padrao: po!.data_entrega_padrao ?? null,
    nomus_contato_label: po!.nomus_contato_label ?? null,
    nomus_comprador_id: po!.nomus_comprador_id ?? null,
    nomus_comprador_nome: po!.nomus_comprador_nome ?? null,
    condicao_pagamento: po!.condicao_pagamento ?? null,
    observacoes: po!.observacoes ?? null,
    status: po!.status,
  };
}

function handleEnterEdit() {
  setDraft(buildDraft());
  setEditing(true);
}

function handleCancelEdit() {
  setDraft(null);
  setEditing(false);
}

const isDirty =
  editing && draft != null &&
  (Object.keys(draft) as (keyof PCDraft)[]).some(
    (k) => draft[k] !== buildDraft()[k],
  );

function setField<K extends keyof PCDraft>(key: K, value: PCDraft[K]) {
  setDraft((d) => (d ? { ...d, [key]: value } : d));
}

function handleSave(onDone?: () => void) {
  if (!po || !draft) return;
  updatePO.mutate(
    { id: po.id, ...draft } as any,
    {
      onSuccess: () => {
        toast.success("Pedido de compra salvo!");
        setEditing(false);
        setDraft(null);
        onDone?.();
      },
      onError: () => toast.error("Falha ao salvar o pedido de compra"),
    },
  );
}

function navigateBack() {
  if (fromTicketId) navigate(`/crm?open_ticket=${fromTicketId}`);
  else navigate("/pedidos-compras");
}

function handleBackClick() {
  if (editing && isDirty) {
    setShowExitDialog(true);
  } else {
    navigateBack();
  }
}
```

> Nota: `buildDraft()` é chamada também dentro de `isDirty` para comparar com o estado original do `po`. Como `po` vem do React Query e é estável entre renders, isso é barato.

- [ ] **Step 3: Trocar o `onClick` do botão Voltar**

Substituir o `onClick` inline do botão "Voltar" (atualmente faz `navigate` direto) por:

```tsx
onClick={handleBackClick}
```

- [ ] **Step 4: Botões Editar / Salvar / Cancelar no header**

No header, ao lado do `Select` de status, adicionar:

```tsx
{editing ? (
  <div className="flex gap-2">
    <Button variant="outline" size="sm" onClick={handleCancelEdit}>
      Cancelar
    </Button>
    <Button size="sm" onClick={() => handleSave()} disabled={updatePO.isPending}>
      {updatePO.isPending ? "Salvando..." : "Salvar"}
    </Button>
  </div>
) : (
  <Button variant="outline" size="sm" onClick={handleEnterEdit}>
    Editar
  </Button>
)}
```

- [ ] **Step 5: Campos lêem do `po` (leitura) ou do `draft` (edição)**

Para cada campo da seção "Informações gerais", trocar o padrão atual.

`FieldInput`/`FieldTextarea` deixam de gravar no blur. Substituir cada uso por um `Input`/`Textarea` controlado:
- Empresa, Contato, Condição de pagamento, Observações:

```tsx
<Input
  value={editing ? (draft!.nomus_empresa_label ?? "") : (po.nomus_empresa_label ?? "")}
  onChange={(e) => setField("nomus_empresa_label", e.target.value || null)}
  readOnly={!editing}
  placeholder="Ex: TS"
  className={`h-9 text-xs ${!editing ? "bg-muted/40 cursor-default" : ""}`}
/>
```

(análogo para `nomus_contato_label`, `condicao_pagamento`; usar `Textarea` para `observacoes`).

- Datas (`data_emissao`, `data_entrega_padrao`): trocar `defaultValue` + `onBlur` por `value` controlado + `onChange`, e `disabled={!editing}`:

```tsx
<input
  type="date"
  value={editing ? (draft!.data_emissao ?? "") : (po.data_emissao ?? "")}
  onChange={(e) => setField("data_emissao", e.target.value || null)}
  disabled={!editing}
  className="mt-1 w-full px-3 py-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring h-9 disabled:bg-muted/40"
/>
```

- Fornecedor / Comprador (`NomusPessoaSearch`) e Tipo de movimentação (`TipoMovimentacaoSearch`): quando `!editing`, renderizar um `Input` read-only com o nome. Quando `editing`, manter o componente de busca mas com `onSelect` gravando no `draft`:

```tsx
{editing ? (
  <NomusPessoaSearch
    categoria="fornecedor"
    value={draft!.nomus_fornecedor_nome}
    onSelect={(p) => {
      setField("nomus_fornecedor_id", p.id);
      setField("nomus_fornecedor_nome", p.nome);
    }}
    placeholder="Buscar fornecedor..."
  />
) : (
  <Input value={po.nomus_fornecedor_nome ?? ""} readOnly
    className="h-9 text-xs bg-muted/40 cursor-default" />
)}
```

(análogo para Comprador e Tipo de movimentação).

- Status `Select`: `value` lê de `draft`/`po`, `onValueChange` grava no `draft`, `disabled={!editing}`:

```tsx
<Select
  value={editing ? draft!.status : po.status}
  onValueChange={(val) => setField("status", val as PurchaseOrderStatus)}
  disabled={!editing}
>
```

- [ ] **Step 6: Remover componentes/código mortos**

As funções `FieldInput` e `FieldTextarea` (linhas ~84-129) deixam de ser usadas — removê-las. Verificar que nada mais as referencia.

- [ ] **Step 7: Adicionar o diálogo ao JSX**

Antes do fechamento do `</div>` raiz, junto ao `reviewData &&`:

```tsx
<UnsavedChangesDialog
  open={showExitDialog}
  saving={savingExit}
  onCancel={() => setShowExitDialog(false)}
  onDiscardAndExit={() => { setShowExitDialog(false); handleCancelEdit(); navigateBack(); }}
  onSaveAndExit={() => {
    setSavingExit(true);
    handleSave(() => { setSavingExit(false); setShowExitDialog(false); navigateBack(); });
  }}
/>
```

> Em caso de erro no salvar, `handleSave` chama `onError` (toast) e não executa `onDone` — o usuário permanece na página. Resetar `savingExit` no `onError` também: adicionar `setSavingExit(false)` ao `onError` de `handleSave`.

- [ ] **Step 8: Verificar build e tipos**

Run: `npm run build`
Expected: build sem erros de TypeScript.

- [ ] **Step 9: Verificação manual no navegador**

- Abrir um PC: campos aparecem somente leitura, botão "Editar" visível.
- Clicar "Editar": campos ficam editáveis, aparecem "Salvar"/"Cancelar".
- Alterar um campo e clicar "Voltar": aparece o diálogo de confirmação.
- "Continuar editando" fecha o diálogo; "Sair sem salvar" sai; "Salvar e sair" salva e sai.
- Alterar nada e "Voltar": sai direto, sem diálogo.

- [ ] **Step 10: Commit**

```bash
git add src/pages/PCDetailPage.tsx
git commit -m "feat(compras): modo edicao manual no Pedido de Compra (sem auto-save)"
```

---

## Task 3: PGDetailPage — guarda no botão Voltar

**Files:**
- Modify: `src/pages/PGDetailPage.tsx`

PG já salva manualmente (modo edição via "Editar Itens"). Só falta o aviso ao voltar.

- [ ] **Step 1: Importar o diálogo e adicionar estados**

```tsx
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";
```

Junto aos `useState` existentes:

```tsx
const [showExitDialog, setShowExitDialog] = useState(false);
const [savingExit, setSavingExit] = useState(false);
```

- [ ] **Step 2: Calcular `isDirty`**

Logo após os estados de edição (`defect`, `analysis`, `parts`, `squadNotes`, `costVal`), comparar com os valores do registro carregado. Usar os mesmos campos que `handleEnterEdit` carrega:

```tsx
const isDirty =
  editing &&
  (defect !== (claim?.defect_description ?? "") ||
   analysis !== (claim?.technical_analysis ?? "") ||
   parts !== (claim?.covered_parts ?? "") ||
   squadNotes !== (claim?.squad_notes ?? "") ||
   costVal !== String(claim?.internal_cost ?? ""));
```

> Ajustar os nomes (`claim` / variável real do warranty_claim e os tipos de `costVal`) conforme o código existente do arquivo. Conferir como `handleEnterEdit` inicializa cada estado e espelhar exatamente a comparação.

- [ ] **Step 3: Função de voltar com guarda**

Localizar o `onClick` do botão "Voltar" (faz `navigate`). Extrair a navegação para `navigateBack()` e criar `handleBackClick()`:

```tsx
function navigateBack() {
  if (fromTicketId) navigate(`/crm?open_ticket=${fromTicketId}`);
  else navigate("/pedidos-garantia");
}
function handleBackClick() {
  if (isDirty) setShowExitDialog(true);
  else navigateBack();
}
```

Trocar o `onClick` do botão "Voltar" para `onClick={handleBackClick}`.

- [ ] **Step 4: Adicionar o diálogo ao JSX**

No fim do JSX da página:

```tsx
<UnsavedChangesDialog
  open={showExitDialog}
  saving={savingExit}
  onCancel={() => setShowExitDialog(false)}
  onDiscardAndExit={() => { setShowExitDialog(false); handleCancelEdit(); navigateBack(); }}
  onSaveAndExit={async () => {
    setSavingExit(true);
    try {
      await handleSaveAll();
      setShowExitDialog(false);
      navigateBack();
    } finally {
      setSavingExit(false);
    }
  }}
/>
```

> Se `handleSaveAll` não retornar Promise / lançar erro em falha, ajustar: garantir que só navega após sucesso. Conferir a assinatura real de `handleSaveAll` e `handleCancelEdit` no arquivo.

- [ ] **Step 5: Build + verificação manual**

Run: `npm run build` — sem erros.
Manual: entrar em edição no PG, alterar um campo, clicar "Voltar" → diálogo aparece.

- [ ] **Step 6: Commit**

```bash
git add src/pages/PGDetailPage.tsx
git commit -m "feat(garantia): aviso de alteracoes nao salvas ao voltar no PG"
```

---

## Task 4: PDDetailPage — remover auto-saves, unificar salvar, guarda

**Files:**
- Modify: `src/pages/PDDetailPage.tsx`

Estado atual: três auto-saves parciais — `handlePaymentMethodChange` (grava método de pagamento no select), `handleInstallmentsBlur` (grava parcelas no blur), `handleStatusChange` (grava status no select). Há também o botão "Salvar Detalhes" (`saveQuoteDetails`) e o modo edição de itens (`handleEnterEdit`/`handleSaveAll`/`handleCancelEdit`).

Decisão (spec, opção A): os campos de "Detalhes do orçamento" entram no modo edição; o botão "Salvar Detalhes" é removido; tudo grava no "Salvar" único.

- [ ] **Step 1: Importar o diálogo e estados**

```tsx
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";
```
```tsx
const [showExitDialog, setShowExitDialog] = useState(false);
const [savingExit, setSavingExit] = useState(false);
```

- [ ] **Step 2: Remover auto-save de método de pagamento, parcelas e status**

- `handlePaymentMethodChange`: remover a chamada de gravação ao Supabase; manter apenas a atualização do estado local.
- `handleInstallmentsBlur`: idem — remover a gravação, manter só o estado local (ou remover o handler de blur se o estado já é atualizado no `onChange`).
- `handleStatusChange`: remover a gravação imediata; passar a atualizar apenas o `editStatus` local.

- [ ] **Step 3: Mover campos de "Detalhes do orçamento" para o modo edição**

Os inputs de método de pagamento, parcelas, validade e notas do orçamento passam a ter `disabled={!editing}` (ou render read-only quando `!editing`), espelhando o que será feito no PC (Task 2, Step 5).

- [ ] **Step 4: Unificar a gravação no `handleSaveAll`**

Incorporar ao `handleSaveAll` (o "Salvar" do modo edição) tudo que hoje está espalhado:
- os campos de `service_requests` de `handleSaveBasic` (notes, squad_notes, estimated_cost) — se `handleSaveBasic` ficar redundante, removê-lo;
- o `status` (`editStatus`);
- os campos de `quotes` de `saveQuoteDetails` (notes, valid_until, payment_method, installments).

Remover o botão "Salvar Detalhes" do JSX e a função `saveQuoteDetails` (após mover sua lógica para `handleSaveAll`). Remover `handleSaveBasic` e seu botão se virou redundante.

- [ ] **Step 5: Calcular `isDirty`**

Comparar todos os estados de edição (notes, squadNotes, cost, editStatus, e os campos de detalhes do orçamento: método de pagamento, parcelas, validade, notas do orçamento, mais os itens) com os valores carregados. Espelhar exatamente o que `handleEnterEdit` inicializa:

```tsx
const isDirty =
  editing &&
  (/* notes !== original, squadNotes !== original, cost !== original,
      editStatus !== original, paymentMethod !== original,
      installments !== original, ... — um termo por campo editável */);
```

> Conferir no arquivo os nomes reais de cada estado e do registro de origem (`service_requests` e `quotes`) e escrever a comparação campo a campo.

- [ ] **Step 6: Guarda no botão Voltar**

```tsx
function navigateBack() {
  if (fromTicketId) navigate(`/crm?open_ticket=${fromTicketId}`);
  else navigate("/pedidos-venda");  // conferir a rota real usada hoje
}
function handleBackClick() {
  if (isDirty) setShowExitDialog(true);
  else navigateBack();
}
```

Trocar o `onClick` do botão "Voltar" para `handleBackClick`.

- [ ] **Step 7: Adicionar o diálogo ao JSX**

```tsx
<UnsavedChangesDialog
  open={showExitDialog}
  saving={savingExit}
  onCancel={() => setShowExitDialog(false)}
  onDiscardAndExit={() => { setShowExitDialog(false); handleCancelEdit(); navigateBack(); }}
  onSaveAndExit={async () => {
    setSavingExit(true);
    try {
      await handleSaveAll();
      setShowExitDialog(false);
      navigateBack();
    } finally {
      setSavingExit(false);
    }
  }}
/>
```

- [ ] **Step 8: Build + verificação manual**

Run: `npm run build` — sem erros.
Manual: abrir PD, confirmar que método de pagamento/parcelas/status NÃO gravam ao alterar fora do "Salvar"; testar diálogo ao voltar com alteração pendente.

- [ ] **Step 9: Commit**

```bash
git add src/pages/PDDetailPage.tsx
git commit -m "feat(pedido-venda): salvar manual unico e aviso de alteracoes nao salvas (PD)"
```

---

## Task 5: PADetailPage — idem PD

**Files:**
- Modify: `src/pages/PADetailPage.tsx`

`PADetailPage` é praticamente idêntico a `PDDetailPage` (mesmas funções, labels diferentes). Aplicar exatamente as mesmas mudanças da Task 4, Steps 1-7, neste arquivo:

- [ ] **Step 1:** Importar `UnsavedChangesDialog` e adicionar `showExitDialog`/`savingExit`.
- [ ] **Step 2:** Remover auto-save de `handlePaymentMethodChange`, `handleInstallmentsBlur`, `handleStatusChange`.
- [ ] **Step 3:** Mover campos de "Detalhes do orçamento" para o modo edição (`disabled={!editing}`).
- [ ] **Step 4:** Unificar gravação em `handleSaveAll`; remover botão/função "Salvar Detalhes" e `handleSaveBasic` se redundante.
- [ ] **Step 5:** Calcular `isDirty` comparando os estados de edição com os valores carregados.
- [ ] **Step 6:** `navigateBack()` (rota `"/pedidos-acessorios"`) + `handleBackClick()`; trocar `onClick` do "Voltar".
- [ ] **Step 7:** Adicionar `UnsavedChangesDialog` ao JSX (mesmo bloco da Task 4 Step 7).
- [ ] **Step 8:** `npm run build` sem erros; verificação manual.
- [ ] **Step 9: Commit**

```bash
git add src/pages/PADetailPage.tsx
git commit -m "feat(pedido-acessorios): salvar manual unico e aviso de alteracoes nao salvas (PA)"
```

---

## Self-Review

- **Cobertura do spec:** Diálogo (Task 1) ✓; PC modo edição + remover auto-save (Task 2) ✓; PD/PA remover auto-saves + unificar (Tasks 4-5) ✓; PG guarda (Task 3) ✓; `isDirty` por snapshot (Tasks 2,3,4,5) ✓; aviso só no "Voltar" (todas) ✓; sem `beforeunload` (fora de escopo) ✓.
- **Placeholders:** As Tasks 3-5 contêm instruções "conferir o nome real no arquivo" — isso é deliberado: `PG/PD/PA` são arquivos grandes e existentes; o executor deve ler o arquivo e espelhar os nomes reais dos estados. O código-modelo (diálogo, padrão de `navigateBack`/`handleBackClick`, bloco do `UnsavedChangesDialog`) é completo e literal.
- **Consistência de tipos:** `UnsavedChangesDialog` tem a mesma assinatura de props em todas as 4 páginas; `navigateBack`/`handleBackClick`/`isDirty`/`showExitDialog`/`savingExit` seguem o mesmo padrão nos 4 arquivos.

## Notas de execução

- Tarefas independentes entre si **a partir da Task 2** — Tasks 2,3,4,5 só dependem da Task 1 (o componente compartilhado). Podem ser feitas em paralelo após a Task 1.
- A Task 2 (PC) é a prioridade explícita do usuário — executar logo após a Task 1.
- Itens dos pedidos: no PC, a tabela de itens (`PurchaseOrderItemsTable`) e o `ProductSearch` mantêm gravação imediata — adicionar/editar/remover item é ação deliberada, fora do escopo do modo edição de campos.
