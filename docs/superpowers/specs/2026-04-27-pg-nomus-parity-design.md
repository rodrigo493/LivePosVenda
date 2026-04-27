# Design: PG com Paridade ao PA — Nomus ERP + Edição de Itens

**Data:** 2026-04-27  
**Projeto:** LivePosVenda  
**Status:** Aprovado pelo usuário

---

## Objetivo

Trazer `PGDetailPage.tsx` (Pedido de Garantia) à paridade funcional com `PADetailPage.tsx` (Pedido de Acessórios), adicionando:

1. Edição de itens (adicionar peça/serviço, tabela editável, exclusão)
2. Seção "Dados para Criação no ERP Nomus" com formulário completo
3. Botão "Criar Pedido no Nomus" com fluxo idêntico ao PA
4. Squad notification já existente, mas conectada ao fluxo correto

---

## Escopo

### Inclui
- Modo de edição com toggle "Editar Itens" / "Salvar Tudo" / "Cancelar" no cabeçalho
- Botões "Adicionar Peça" e "Adicionar Serviço" (abre busca inline)
- Componentes `ProductSearch` e `SuggestedParts` para buscar produtos
- Formulário inline para criar serviço manualmente
- Tabela de itens editável (qty, unit_price, description, delete button)
- Seção Nomus ERP: cliente autocomplete + campos de cabeçalho + dados por item
- `handleApprove` refatorado para chamada direta à API Nomus via fetch (igual ao PA)
- Status após criação do pedido Nomus: `warranty_status = "aprovada"`
- Squad notification fire-and-forget no início do `handleApprove`

### Não inclui
- Mudanças na `PADetailPage`
- Mudanças no schema do banco (warranty_claims já tem todos os campos necessários)
- Novos status de PG
- Modo de edição para os campos exclusivos do PG (defect_description, etc.) — esses já são editáveis inline

---

## Arquivo Modificado

**`src/pages/PGDetailPage.tsx`** — único arquivo alterado (386 → ~1000 linhas)

---

## Novos Imports

```tsx
import { useState, useMemo, useEffect, useRef } from "react";
// já existentes + adicionar:
import { format, parse, isValid } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { CalendarIcon, Pencil, X, Wrench, Plus, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { ProductSearch } from "@/components/products/ProductSearch";
import { SuggestedParts } from "@/components/products/SuggestedParts";
import { useAddQuoteItem, useDeleteQuoteItem } from "@/hooks/useQuotes";
import { useCreateProduct } from "@/hooks/useProducts";
import { formatCurrency as fmtCurrency } from "@/lib/formatters";
```

---

## Novos State Variables

```tsx
// Edit mode
const [editing, setEditing] = useState(false);
const [saving, setSaving] = useState(false);
const [editableItems, setEditableItems] = useState<Record<string, { quantity: string; unit_price: string; description: string }>>({});
const [searchMode, setSearchMode] = useState<"peca" | "servico" | null>(null);
const [showNewServiceForm, setShowNewServiceForm] = useState(false);
const [newService, setNewService] = useState({ name: "", description: "", cost: "", itemType: "servico_garantia" });

// Nomus ERP
const [nomusFields, setNomusFields] = useState({
  pedido: "",
  empresa: "TS",
  cliente: "",
  tipoMovimentacao: "VENDAS DE MERCADORIAS",
  dataEmissao: format(new Date(), "dd/MM/yyyy"),
  dataEntregaPadrao: "",
  cfop: "",
});
const [nomusClientId, setNomusClientId] = useState<number | null>(null);
const [nomusClientResults, setNomusClientResults] = useState<{ id: number; nome: string }[]>([]);
const [nomusClientLoading, setNomusClientLoading] = useState(false);
const [nomusClientOpen, setNomusClientOpen] = useState(false);
const nomusSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
const [itemErpData, setItemErpData] = useState<Record<string, { produto: string; quantidade: string; valorUnitario: string }>>({});
```

---

## Pre-fill Effect

```tsx
// Pre-fill Nomus fields from PG data
useEffect(() => {
  if (!wc) return;
  const clientName = wc.tickets?.clients?.name || "";
  const claimNum = (wc as any).claim_number || "";
  setNomusFields(prev => ({
    ...prev,
    pedido: prev.pedido || claimNum,
    cliente: prev.cliente || clientName,
  }));
}, [wc]);

// Init item ERP data from quote items
useEffect(() => {
  if (items.length === 0) return;
  setItemErpData(prev => {
    const next = { ...prev };
    for (const item of items) {
      if (!next[item.id]) {
        next[item.id] = {
          produto: item.products?.code || item.description || "",
          quantidade: String(item.quantity || 1),
          valorUnitario: Number(item.unit_price || 0).toFixed(2),
        };
      }
    }
    return next;
  });
  setEditableItems(prev => {
    const next = { ...prev };
    for (const item of items) {
      if (!next[item.id]) {
        next[item.id] = {
          quantity: String(item.quantity || 1),
          unit_price: Number(item.unit_price || 0).toFixed(2),
          description: item.description || "",
        };
      }
    }
    return next;
  });
}, [items]);
```

---

## Funções Novas / Modificadas

### searchNomusClients / selectNomusClient / resolveNomusProductId
Idênticas ao PA — chamam `/api/nomus/rest/pessoas` e `/api/nomus/rest/produtos`.

### handleApprove (substituir implementação atual)

```tsx
const handleApprove = async () => {
  if (!nomusFields.dataEntregaPadrao) { toast.error("Preencha a Data de Entrega Padrão."); return; }
  if (!nomusFields.cliente.trim()) { toast.error("Preencha o nome do cliente."); return; }

  setApproving(true);
  void notifySquad({ recordType: "pg", recordId: id!, reference: claimNumber });
  try {
    let idPessoaCliente = nomusClientId;
    if (!idPessoaCliente) {
      // resolve via Nomus API (same as PA)
    }
    if (!idPessoaCliente) {
      toast.error(`Cliente "${nomusFields.cliente}" não encontrado no ERP Nomus.`);
      return;
    }
    // build itensPedido (same structure as PA)
    const itensPedido = await Promise.all(items.map(async (item, idx) => { ... }));
    const payload = {
      codigoPedido: nomusFields.pedido || claimNumber,
      dataEmissao: nomusFields.dataEmissao || fallbackDate,
      idCondicaoPagamento: 28, idEmpresa: 2, idFormaPagamento: 10,
      idPessoaCliente, idTipoMovimentacao: 60, idTipoPedido: 1,
      observacoes: currentDefect || `Pedido de Garantia - ${nomusFields.cliente}`,
      observacoesInternas: `Gerado pelo Live Care - ${nomusFields.pedido || claimNumber}`,
      itensPedido,
      ...(nomusFields.cfop ? { cfop: nomusFields.cfop } : {}),
    };
    const orderRes = await fetch("/api/nomus/rest/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!orderRes.ok) throw new Error(`Erro Nomus [${orderRes.status}]: ${await orderRes.text()}`);

    await supabase.from("warranty_claims").update({ warranty_status: "aprovada" as any }).eq("id", id!);
    toast.success("Pedido de garantia criado no ERP com sucesso!");
    qc.invalidateQueries({ queryKey: ["warranty_claim_detail", id] });
  } catch (err: any) {
    toast.error(err.message || "Erro ao criar pedido no ERP");
  } finally {
    setApproving(false);
  }
};
```

### handleSaveAll (substituir handleSave em modo edição)

Igual ao PA: salva warranty_claim fields + quote_items editados + recalcula totals do linkedQuote.

---

## Novas Seções UI (ordem no return)

1. **Cabeçalho** — adicionar botões "Editar Itens" / "Salvar Tudo" / "Cancelar" (igual ao PA)
2. **Banner de modo edição** (quando editing=true)
3. **Cards cliente + equipamento** — sem mudança
4. **Orçamento de origem** — sem mudança
5. **Resumo financeiro** — sem mudança (já existe, passará a usar editableItems quando editing=true)
6. **Botões Adicionar Peça / Serviço** — novos
7. **ProductSearch** — novo, aparece quando searchMode != null
8. **SuggestedParts** — novo
9. **Tabela de itens** — tornar editável (qty, unit_price, description, delete button em editing mode)
10. **Campos específicos PG** (defect, analysis, parts, cost) — sem mudança
11. **Status PG** — sem mudança
12. **Seção Nomus ERP** — nova, idêntica ao PA
13. **Barra de ações** — sem mudança (Voltar + Salvar)

---

## Diferenças PA → PG

| Aspecto | PA | PG |
|---------|----|----|
| Tabela | `service_requests` | `warranty_claims` |
| Status final Nomus | `"resolvido"` | `"aprovada"` |
| Campo status | `status` | `warranty_status` |
| Query linked quote | `.eq("service_request_id", id)` | `.eq("warranty_claim_id", id)` |
| QueryKey detail | `["service_request_detail", id]` | `["warranty_claim_detail", id]` |
| QueryKey quote | `["pa_linked_quote", id]` | `["pg_linked_quote", id]` |
| observacoes ERP | `Pedido de Acessório - cliente` | `Pedido de Garantia - cliente` |
| itemType padrão serviço | `servico_cobrado` | `servico_garantia` |
| Navigate voltar | `/pedidos-acessorios` | `/pedidos-garantia` |
| invalidateQueries save | `["service_request_detail", id]` + `["pa_linked_quote", id]` | `["warranty_claim_detail", id]` + `["pg_linked_quote", id]` |

---

## Resultado Esperado

`PGDetailPage.tsx` com ~950 linhas, estrutura idêntica ao PA com as adaptações acima. Nenhum outro arquivo é modificado.
