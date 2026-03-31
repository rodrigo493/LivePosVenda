import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Package, Save, Loader2, Send, CalendarIcon, Pencil, X, Wrench, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parse, isValid } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { ProductSearch } from "@/components/products/ProductSearch";
import { SuggestedParts } from "@/components/products/SuggestedParts";
import { useAddQuoteItem, useDeleteQuoteItem } from "@/hooks/useQuotes";
import { useCreateProduct } from "@/hooks/useProducts";
import { serviceRequestStatusLabels as statusLabels, itemTypeLabels } from "@/constants/statusLabels";
import { formatCurrency as fmtCurrency } from "@/lib/formatters";

const partTypes = [
  { value: "peca_cobrada", label: "Peça (Cobrada)" },
  { value: "peca_garantia", label: "Peça (Garantia)" },
];

const serviceTypes = [
  { value: "servico_cobrado", label: "Serviço (Cobrado)" },
  { value: "servico_garantia", label: "Serviço (Garantia)" },
  { value: "frete", label: "Frete" },
  { value: "desconto", label: "Desconto" },
];

const PADetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromTicketId = searchParams.get("from_ticket");
  const addItem = useAddQuoteItem();
  const deleteItemMutation = useDeleteQuoteItem();
  const createProduct = useCreateProduct();
  const qc = useQueryClient();

  const { data: sr, isLoading } = useQuery({
    queryKey: ["service_request_detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_requests")
        .select("*, tickets(ticket_number, title, clients(name), equipments(serial_number, model_id, equipment_models(name)))")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: linkedQuote } = useQuery({
    queryKey: ["pa_linked_quote", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, quote_items(*, products(code, name))")
        .eq("service_request_id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [notes, setNotes] = useState<string | null>(null);
  const [cost, setCost] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [searchMode, setSearchMode] = useState<"peca" | "servico" | null>(null);
  const [showNewServiceForm, setShowNewServiceForm] = useState(false);
  const [newService, setNewService] = useState({ name: "", description: "", cost: "", itemType: "servico_cobrado" });

  // Editable item data (quantity, unit_price per item)
  const [editableItems, setEditableItems] = useState<Record<string, { quantity: string; unit_price: string; description: string }>>({});

  // Nomus ERP fields
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

  // Pre-fill fields from quote data when loaded
  useEffect(() => {
    if (!sr) return;
    const clientName = sr.tickets?.clients?.name || "";
    const requestNumber = (sr as any).request_number || "";
    setNomusFields(prev => ({
      ...prev,
      pedido: prev.pedido || requestNumber,
      cliente: prev.cliente || clientName,
    }));
  }, [sr]);

  const updateNomusField = (field: string, value: string) => {
    setNomusFields(prev => ({ ...prev, [field]: value }));
  };

  const searchNomusClients = async (query: string) => {
    updateNomusField("cliente", query);
    setNomusClientId(null);
    if (query.length < 2) { setNomusClientResults([]); setNomusClientOpen(false); return; }
    setNomusClientLoading(true);
    try {
      const searchTerm = query.trim().split(/\s+/)[0];
      const res = await fetch(`/api/nomus/rest/pessoas?query=nome==*${encodeURIComponent(searchTerm)}*`, {
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
      });
      if (!res.ok) { setNomusClientResults([]); setNomusClientOpen(false); setNomusClientLoading(false); return; }
      const people = await res.json();
      const results = Array.isArray(people) ? people.slice(0, 20).map((p: any) => ({ id: p.id, nome: p.nome })) : [];
      setNomusClientResults(results);
      setNomusClientOpen(results.length > 0);
    } catch (e) { if (import.meta.env.DEV) console.error("Nomus search error:", e); setNomusClientResults([]); }
    setNomusClientLoading(false);
  };

  const selectNomusClient = (client: { id: number; nome: string }) => {
    setNomusClientId(client.id);
    updateNomusField("cliente", client.nome);
    setNomusClientOpen(false);
  };

  const items = linkedQuote?.quote_items || [];

  // Editable item-level ERP data
  const [itemErpData, setItemErpData] = useState<Record<string, { produto: string; quantidade: string; valorUnitario: string }>>({});

  // Initialize item ERP data and editable items from quote items
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

  const updateItemErp = (itemId: string, field: string, value: string) => {
    setItemErpData(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const updateEditableItem = (itemId: string, field: string, value: string) => {
    setEditableItems(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const totals = useMemo(() => {
    let warranty = 0, subtotalPecas = 0, subtotalServicos = 0, frete = 0, desconto = 0, internalCost = 0;
    for (const item of items) {
      const qty = editing ? Number(editableItems[item.id]?.quantity || item.quantity) : item.quantity;
      const price = editing ? Number(editableItems[item.id]?.unit_price || item.unit_price) : Number(item.unit_price);
      const lineCost = qty * Number(item.unit_cost);
      const linePrice = qty * price;
      internalCost += lineCost;
      if (item.item_type === "desconto") desconto += linePrice;
      else if (item.item_type === "frete") { frete += linePrice; }
      else if (String(item.item_type).includes("garantia")) warranty += lineCost;
      else if (String(item.item_type).includes("peca")) subtotalPecas += linePrice;
      else subtotalServicos += linePrice;
    }
    const charged = subtotalPecas + subtotalServicos + frete - desconto;
    const margin = charged > 0 ? ((charged - (internalCost - warranty)) / charged * 100) : 0;
    return { subtotalPecas, subtotalServicos, warranty, charged, internalCost, margin, frete, desconto };
  }, [items, editing, editableItems]);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;
  if (!sr) return <div className="p-8 text-center text-muted-foreground">Pedido não encontrado.</div>;

  const currentNotes = notes ?? sr.notes ?? "";
  const currentCost = cost ?? String(sr.estimated_cost || 0);
  const currentStatus = editStatus ?? sr.status;
  const requestNumber = (sr as any).request_number || "PA";
  const clientName = sr.tickets?.clients?.name || "—";
  const modelName = sr.tickets?.equipments?.equipment_models?.name || "—";
  const serialNumber = sr.tickets?.equipments?.serial_number || "";
  const equipModelId = (sr.tickets?.equipments as any)?.model_id || undefined;

  const handleProductSelect = async (product: any, itemType: string) => {
    if (!linkedQuote) {
      toast.error("Nenhum orçamento vinculado para adicionar itens.");
      return;
    }
    const tax = (Number(product.ipi_percent || 0) + Number(product.icms_percent || 0) + Number(product.pis_percent || 0) + Number(product.cofins_percent || 0) + Number(product.csll_percent || 0) + Number(product.irpj_percent || 0)) / 100;
    const cost = Number(product.base_cost) * (1 + tax);
    const price = itemType.includes("garantia") ? 0 : cost * (1 + Number(product.margin_percent || 30) / 100);
    await addItem.mutateAsync({
      quote_id: linkedQuote.id,
      product_id: product.id,
      description: product.name,
      item_type: itemType,
      quantity: 1,
      unit_cost: cost,
      unit_price: price,
    });
    toast.success(`${product.name} adicionado ao pedido`);
    qc.invalidateQueries({ queryKey: ["pa_linked_quote", id] });
  };

  const handleDeleteItem = async (itemId: string) => {
    await deleteItemMutation.mutateAsync(itemId);
    toast.success("Item removido");
    qc.invalidateQueries({ queryKey: ["pa_linked_quote", id] });
  };

  const handleEnterEdit = () => {
    setEditing(true);
    setNotes(sr.notes ?? "");
    setCost(String(sr.estimated_cost || 0));
    setEditStatus(sr.status);
    // Re-init editable items from current data
    const next: Record<string, { quantity: string; unit_price: string; description: string }> = {};
    for (const item of items) {
      next[item.id] = {
        quantity: String(item.quantity || 1),
        unit_price: Number(item.unit_price || 0).toFixed(2),
        description: item.description || "",
      };
    }
    setEditableItems(next);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setNotes(null);
    setCost(null);
    setEditStatus(null);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // 1. Save service request fields
      const { error: srError } = await supabase.from("service_requests").update({
        notes: currentNotes,
        estimated_cost: parseFloat(currentCost) || 0,
        status: currentStatus as any,
      }).eq("id", id!);
      if (srError) throw srError;

      // 2. Save each edited item (always update to ensure persistence)
      const itemUpdates = items.map(async (item: any) => {
        const ed = editableItems[item.id];
        if (!ed) return;
        const newQty = Number(ed.quantity) || item.quantity;
        const newPrice = Number(ed.unit_price) || Number(item.unit_price);
        const newDesc = ed.description || item.description;
        const { error } = await supabase.from("quote_items").update({
          quantity: newQty,
          unit_price: newPrice,
          description: newDesc,
        }).eq("id", item.id);
        if (error) throw error;
      });
      await Promise.all(itemUpdates);

      // 3. Recalculate quote totals
      if (linkedQuote) {
        let newSubtotal = 0;
        let newDiscount = 0;
        let newFreight = 0;
        for (const item of items) {
          const ed = editableItems[item.id];
          const qty = Number(ed?.quantity || item.quantity);
          const price = Number(ed?.unit_price || item.unit_price);
          const lineTotal = qty * price;
          if (item.item_type === "desconto") newDiscount += lineTotal;
          else if (item.item_type === "frete") newFreight += lineTotal;
          else newSubtotal += lineTotal;
        }
        const newTotal = newSubtotal + newFreight - newDiscount;
        await supabase.from("quotes").update({
          subtotal: newSubtotal,
          discount: newDiscount,
          freight: newFreight,
          total: newTotal,
        }).eq("id", linkedQuote.id);
      }

      toast.success("Todas as alterações foram salvas!");
      setEditing(false);
      setNotes(null);
      setCost(null);
      setEditStatus(null);
      qc.invalidateQueries({ queryKey: ["service_request_detail", id] });
      qc.invalidateQueries({ queryKey: ["pa_linked_quote", id] });
    } catch (err: any) {
      if (import.meta.env.DEV) console.error("Save error:", err);
      toast.error(err.message || "Erro ao salvar alterações");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (val: string) => {
    if (editing) {
      setEditStatus(val);
    } else {
      const { error } = await supabase.from("service_requests").update({ status: val as any }).eq("id", id!);
      if (error) toast.error("Erro ao atualizar");
      else { toast.success("Status atualizado"); qc.invalidateQueries({ queryKey: ["service_request_detail", id] }); }
    }
  };

  const resolveNomusProductId = async (code: string): Promise<number | null> => {
    try {
      const res = await fetch(`/api/nomus/rest/produtos?query=codigo==${encodeURIComponent(code)}`, {
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
      });
      if (!res.ok) return null;
      const products = await res.json();
      return Array.isArray(products) && products.length > 0 ? products[0].id : null;
    } catch { return null; }
  };

  const handleApprove = async () => {
    if (!nomusClientId) { toast.error("Selecione um cliente do ERP Nomus antes de criar o pedido."); return; }
    if (!nomusFields.dataEntregaPadrao) { toast.error("Preencha a Data de Entrega Padrão."); return; }

    setApproving(true);
    try {
      const today = new Date();
      const fallbackDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

      const itensPedido = await Promise.all(items.map(async (item: any, idx: number) => {
        const erpData = itemErpData[item.id];
        const productCode = erpData?.produto || item.products?.code || "";
        const idProduto = await resolveNomusProductId(productCode);
        if (!idProduto) throw new Error(`Produto "${productCode}" não encontrado no ERP Nomus.`);
        return {
          idProduto,
          item: String(idx + 1),
          quantidade: String(Number(erpData?.quantidade || item.quantity || 1)),
          valorUnitario: (() => { const v = String(erpData?.valorUnitario || item.unit_price || 0); return v.includes(",") ? Number(v.replace(/\./g, "").replace(",", ".")).toFixed(2) : Number(v).toFixed(2); })(),
          observacoes: item.description || "",
          informacoesAdicionaisProduto: "",
          percentualAcrescimo: "0",
          percentualDesconto: "0",
          valorAcrescimo: "0",
          valorDesconto: "0",
          status: 1,
          idTipoMovimentacao: 60,
          dataEntrega: nomusFields.dataEntregaPadrao || fallbackDate,
        };
      }));

      const empresaMap: Record<string, number> = { "TS": 2, "LIVE": 1, "YZ": 3 };
      const nomusPayload = {
        codigoPedido: nomusFields.pedido || requestNumber,
        dataEmissao: nomusFields.dataEmissao || fallbackDate,
        idCondicaoPagamento: 28,
        idEmpresa: empresaMap[nomusFields.empresa] || 2,
        idFormaPagamento: 10,
        idPessoaCliente: nomusClientId,
        idTipoMovimentacao: 60,
        idTipoPedido: 1,
        observacoes: currentNotes || `Pedido de Acessório - ${nomusFields.cliente || clientName}`,
        observacoesInternas: `Gerado pelo Live Care - ${nomusFields.pedido || requestNumber}`,
        itensPedido,
        ...(nomusFields.cfop ? { cfop: nomusFields.cfop } : {}),
      };

      const nomusRes = await fetch("/api/nomus/rest/pedidos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(nomusPayload),
      });

      const nomusData = await nomusRes.json();

      if (nomusRes.status === 429) {
        toast.error(`API Nomus em throttling. Aguarde ${nomusData?.tempoAteLiberar || 30}s e tente novamente.`);
        return;
      }
      if (!nomusRes.ok) {
        const erros = nomusData?.erros?.map((e: any) => e.mensagem).join(", ") || nomusData?.descricao || "Erro desconhecido";
        throw new Error(`Erro Nomus: ${erros}`);
      }

      await supabase.from("service_requests").update({ status: "resolvido" as any }).eq("id", id!);
      toast.success(`Pedido ${nomusData.codigoPedido || ""} criado no ERP com sucesso!`);
      qc.invalidateQueries({ queryKey: ["service_request_detail", id] });
    } catch (err: any) {
      if (import.meta.env.DEV) console.error("Approve error:", err);
      toast.error(err.message || "Erro ao criar pedido no ERP");
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => {
          if (fromTicketId) navigate(`/crm?open_ticket=${fromTicketId}`);
          else navigate("/pedidos-acessorios");
        }}><ArrowLeft className="h-4 w-4 mr-1" /> {fromTicketId ? "Voltar ao Card" : "Voltar"}</Button>
        <div className="flex-1">
          <h1 className="font-display font-bold text-lg flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> {requestNumber}
          </h1>
          <p className="text-xs text-muted-foreground">{clientName} • {modelName}{serialNumber ? ` • S/N ${serialNumber}` : ""}</p>
        </div>
        <StatusBadge status={statusLabels[currentStatus] || currentStatus} />
        {/* Edit / Save / Cancel buttons */}
        {!editing ? (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleEnterEdit}>
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={handleCancelEdit}>
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSaveAll} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Salvar Tudo
            </Button>
          </div>
        )}
      </div>

      {editing && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-2 mb-4 text-xs text-primary font-medium flex items-center gap-2">
          <Pencil className="h-3.5 w-3.5" /> Modo de edição ativo — altere os campos e clique em "Salvar Tudo"
        </div>
      )}

      {/* Client & Equipment info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-card rounded-xl border p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">Cliente</p>
          <p className="text-sm font-medium">{clientName}</p>
          {sr.tickets && <p className="text-xs text-muted-foreground mt-1">Chamado: {sr.tickets.ticket_number} — {sr.tickets.title}</p>}
        </div>
        <div className="bg-card rounded-xl border p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">Equipamento</p>
          <p className="text-sm font-medium">{modelName}</p>
          {serialNumber && <p className="text-xs text-muted-foreground mt-1">S/N: {serialNumber}</p>}
        </div>
      </div>

      {/* Financial summary cards */}
      {items.length > 0 && (
        <>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
            {[
              { label: "Peças", value: `R$ ${totals.subtotalPecas.toFixed(2)}` },
              { label: "Serviços", value: `R$ ${totals.subtotalServicos.toFixed(2)}` },
              { label: "Frete", value: `R$ ${totals.frete.toFixed(2)}` },
              { label: "Desconto", value: `- R$ ${totals.desconto.toFixed(2)}` },
              { label: "Garantia", value: `R$ ${totals.warranty.toFixed(2)}`, accent: true },
              { label: "Margem", value: `${totals.margin.toFixed(1)}%` },
            ].map((c) => (
              <div key={c.label} className={`bg-card rounded-xl border p-3 ${c.accent ? "border-success/30 bg-success/5" : ""}`}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
                <p className="text-sm font-bold font-mono mt-1">{c.value}</p>
              </div>
            ))}
          </div>

          {/* Total final */}
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-6 flex items-center justify-between">
            <span className="text-sm font-semibold">Total Cobrado do Cliente</span>
            <span className="text-2xl font-bold font-mono text-primary">R$ {totals.charged.toFixed(2)}</span>
          </div>
        </>
      )}

      {/* Add items buttons */}
      {editing && linkedQuote && (
        <div className="flex gap-2 mb-4">
          <Button size="sm" className="gap-1.5" variant={searchMode === "peca" ? "default" : "outline"} onClick={() => { setSearchMode(searchMode === "peca" ? null : "peca"); setShowNewServiceForm(false); }}>
            <Package className="h-3.5 w-3.5" /> Adicionar Peça
          </Button>
          <Button size="sm" className="gap-1.5" variant={searchMode === "servico" ? "default" : "outline"} onClick={() => { setSearchMode(searchMode === "servico" ? null : "servico"); setShowNewServiceForm(false); }}>
            <Wrench className="h-3.5 w-3.5" /> Adicionar Serviço
          </Button>
        </div>
      )}

      {/* Product search */}
      {editing && searchMode && linkedQuote && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 space-y-3">
          <ProductSearch
            modelFilter={modelName}
            onSelect={handleProductSelect}
            itemTypes={searchMode === "peca" ? partTypes : serviceTypes}
          />
          {searchMode === "servico" && (
            <div className="space-y-3">
              {!showNewServiceForm ? (
                <Button variant="outline" size="sm" className="gap-1.5 w-full border-dashed" onClick={() => setShowNewServiceForm(true)}>
                  <Plus className="h-3.5 w-3.5" /> Criar novo serviço manualmente
                </Button>
              ) : (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold flex items-center gap-2"><Wrench className="h-4 w-4 text-primary" /> Novo Serviço</p>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowNewServiceForm(false)}>Cancelar</Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nome do serviço *</Label>
                      <Input placeholder="Ex: Mão de obra técnica..." value={newService.name} onChange={(e) => setNewService(s => ({ ...s, name: e.target.value }))} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Custo (R$) *</Label>
                      <Input type="number" step="0.01" placeholder="0.00" value={newService.cost} onChange={(e) => setNewService(s => ({ ...s, cost: e.target.value }))} className="mt-1 font-mono" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tipo</Label>
                      <Select value={newService.itemType} onValueChange={(v) => setNewService(s => ({ ...s, itemType: v }))}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {serviceTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Descrição (opcional)</Label>
                    <Input placeholder="Detalhes do serviço..." value={newService.description} onChange={(e) => setNewService(s => ({ ...s, description: e.target.value }))} className="mt-1" />
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" className="gap-1.5" disabled={!newService.name.trim() || !newService.cost || createProduct.isPending}
                      onClick={async () => {
                        const costVal = Number(newService.cost);
                        const code = `SRV-${Date.now().toString(36).toUpperCase()}`;
                        const product = await createProduct.mutateAsync({
                          name: newService.name.trim(), code, base_cost: costVal,
                          description: newService.description || null,
                          category: "servico", product_type: "servico", margin_percent: 30,
                        });
                        const isWarranty = newService.itemType.includes("garantia");
                        const price = isWarranty ? 0 : costVal * 1.3;
                        await addItem.mutateAsync({
                          quote_id: linkedQuote.id, product_id: product.id,
                          description: newService.name.trim(), item_type: newService.itemType,
                          quantity: 1, unit_cost: costVal, unit_price: price,
                        });
                        toast.success(`Serviço "${newService.name}" criado e adicionado`);
                        setNewService({ name: "", description: "", cost: "", itemType: "servico_cobrado" });
                        setShowNewServiceForm(false);
                        qc.invalidateQueries({ queryKey: ["pa_linked_quote", id] });
                      }}>
                      <Plus className="h-3.5 w-3.5" /> {createProduct.isPending ? "Criando..." : "Criar e Adicionar"}
                    </Button>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Suggested parts */}
      {editing && linkedQuote && (
        <SuggestedParts modelId={equipModelId} modelName={modelName} onSelect={handleProductSelect} />
      )}

      {/* Items table */}
      {items.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-sm overflow-hidden mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/50">
            <h3 className="font-display font-semibold text-sm">Itens do Pedido ({items.length})</h3>
            {linkedQuote && <Badge variant="outline" className="text-[10px]">Origem: {linkedQuote.quote_number}</Badge>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  {["Código", "Descrição", "Tipo", "Qtd", "Preço Unit.", "Subtotal", ...(editing ? [""] : [])].map((h) => (
                    <th key={h} className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-3 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => {
                  const isWarranty = String(item.item_type).includes("garantia");
                  const ed = editableItems[item.id];
                  const qty = editing && ed ? Number(ed.quantity) : item.quantity;
                  const price = editing && ed ? Number(ed.unit_price) : Number(item.unit_price);
                  return (
                    <tr key={item.id} className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${isWarranty ? "bg-success/5" : ""}`}>
                      <td className="px-3 py-2.5 text-xs font-mono">{item.products?.code || "—"}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {editing ? (
                          <Input
                            value={ed?.description ?? item.description}
                            onChange={e => updateEditableItem(item.id, "description", e.target.value)}
                            className="h-7 text-xs"
                          />
                        ) : item.description}
                      </td>
                      <td className="px-3 py-2.5"><StatusBadge status={itemTypeLabels[item.item_type] || item.item_type} /></td>
                      <td className="px-3 py-2.5 text-xs font-mono">
                        {editing ? (
                          <Input
                            type="number"
                            value={ed?.quantity ?? String(item.quantity)}
                            onChange={e => updateEditableItem(item.id, "quantity", e.target.value)}
                            className="h-7 text-xs font-mono w-16"
                          />
                        ) : qty}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono">
                        {isWarranty ? (
                          <span className="text-success">Garantia</span>
                        ) : editing ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={ed?.unit_price ?? Number(item.unit_price).toFixed(2)}
                            onChange={e => updateEditableItem(item.id, "unit_price", e.target.value)}
                            className="h-7 text-xs font-mono w-24"
                          />
                        ) : `R$ ${price.toFixed(2)}`}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono font-medium">
                        {isWarranty ? <span className="text-success">Coberto</span> : `R$ ${(qty * price).toFixed(2)}`}
                      </td>
                      {editing && (
                        <td className="px-3 py-2.5">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteItem(item.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Editable fields */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="md:col-span-2">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Observações</label>
          <Textarea
            value={currentNotes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observações do pedido de acessório..."
            rows={3}
            disabled={!editing}
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Custo Estimado (R$)</label>
          <input
            type="number"
            step="0.01"
            value={currentCost}
            onChange={(e) => setCost(e.target.value)}
            disabled={!editing}
            className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono disabled:opacity-50"
          />
        </div>
      </div>

      {/* Status change */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Alterar Status</label>
          <Select value={currentStatus} onValueChange={handleStatusChange} disabled={!editing}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(statusLabels).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Nomus ERP Integration Form */}
      {sr.status !== "resolvido" && sr.status !== "cancelado" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-sm overflow-hidden mb-6">
          <div className="px-4 py-3 border-b bg-muted/50">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" /> Dados para Criação no ERP Nomus
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Preencha os campos abaixo para criar o pedido de venda no Nomus</p>
          </div>
          <div className="p-4 space-y-4">
            {/* Header fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Pedido</Label>
                <Input value={nomusFields.pedido} onChange={e => updateNomusField("pedido", e.target.value)} placeholder="Número do pedido" className="mt-1 h-9 text-xs font-mono" />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Empresa</Label>
                <Select value={nomusFields.empresa} onValueChange={v => updateNomusField("empresa", v)}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TS">TS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Cliente (ERP Nomus)</Label>
                <Input
                  value={nomusFields.cliente}
                  onChange={e => searchNomusClients(e.target.value)}
                  onFocus={() => nomusClientResults.length > 0 && setNomusClientOpen(true)}
                  onBlur={() => setTimeout(() => setNomusClientOpen(false), 200)}
                  placeholder="Digite para buscar na Nomus..."
                  className={`mt-1 h-9 text-xs ${nomusClientId ? "border-green-500" : ""}`}
                />
                {nomusClientLoading && <span className="absolute right-3 top-8 text-[10px] text-muted-foreground">Buscando...</span>}
                {nomusClientId && <span className="absolute right-3 top-8 text-[10px] text-green-600">ID: {nomusClientId}</span>}
                {nomusClientOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-48 overflow-auto">
                    {nomusClientResults.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={() => selectNomusClient(c)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors"
                      >
                        <span className="font-medium">{c.nome}</span>
                        <span className="text-muted-foreground ml-2">ID: {c.id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Tipo de Movimentação</Label>
                <Select value={nomusFields.tipoMovimentacao} onValueChange={v => updateNomusField("tipoMovimentacao", v)}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VENDAS DE MERCADORIAS">VENDAS DE MERCADORIAS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Data de Emissão</Label>
                <div className="flex gap-1 mt-1">
                  <Input placeholder="dd/MM/yyyy" value={nomusFields.dataEmissao} onChange={e => updateNomusField("dataEmissao", e.target.value)} className="h-9 text-xs font-mono flex-1" />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"><CalendarIcon className="h-4 w-4" /></Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar mode="single" className={cn("p-3 pointer-events-auto")} selected={(() => { const d = parse(nomusFields.dataEmissao, "dd/MM/yyyy", new Date()); return isValid(d) ? d : undefined; })()} onSelect={(d) => d && updateNomusField("dataEmissao", format(d, "dd/MM/yyyy"))} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Data de Entrega Padrão</Label>
                <div className="flex gap-1 mt-1">
                  <Input placeholder="dd/MM/yyyy" value={nomusFields.dataEntregaPadrao} onChange={e => updateNomusField("dataEntregaPadrao", e.target.value)} className="h-9 text-xs font-mono flex-1" />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"><CalendarIcon className="h-4 w-4" /></Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar mode="single" className={cn("p-3 pointer-events-auto")} selected={(() => { const d = parse(nomusFields.dataEntregaPadrao, "dd/MM/yyyy", new Date()); return isValid(d) ? d : undefined; })()} onSelect={(d) => d && updateNomusField("dataEntregaPadrao", format(d, "dd/MM/yyyy"))} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">CFOP</Label>
                <Input placeholder="Ex: 5102" value={nomusFields.cfop} onChange={e => updateNomusField("cfop", e.target.value)} className="mt-1 h-9 text-xs font-mono" />
              </div>
            </div>

            {/* Per-item ERP fields */}
            {items.length > 0 && (
              <div className="border-t pt-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">Itens do Pedido (Dados ERP)</p>
                <div className="space-y-3">
                  {items.map((item: any, idx: number) => {
                    const erpData = itemErpData[item.id] || { produto: "", quantidade: "1", valorUnitario: "0" };
                    return (
                      <div key={item.id} className="bg-muted/30 rounded-lg p-3 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                        <div className="md:col-span-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Item {idx + 1} - Produto</Label>
                          <Input
                            value={erpData.produto}
                            onChange={e => updateItemErp(item.id, "produto", e.target.value)}
                            placeholder="Código do produto"
                            className="mt-1 h-8 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Quantidade</Label>
                          <Input
                            type="number"
                            value={erpData.quantidade}
                            onChange={e => updateItemErp(item.id, "quantidade", e.target.value)}
                            className="mt-1 h-8 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Valor Unitário (R$)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={erpData.valorUnitario}
                            onChange={e => updateItemErp(item.id, "valorUnitario", e.target.value)}
                            className="mt-1 h-8 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="px-4 pb-4">
            <Button className="gap-1.5 w-full md:w-auto" onClick={handleApprove} disabled={approving}>
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {approving ? "Criando no ERP..." : "Criar Pedido no Nomus"}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Actions bar */}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
          if (fromTicketId) navigate(`/crm?open_ticket=${fromTicketId}`);
          else navigate("/pedidos-acessorios");
        }}>
          <ArrowLeft className="h-3.5 w-3.5" /> {fromTicketId ? "Voltar ao Card" : "Voltar para Pedidos de Acessórios"}
        </Button>
      </div>
    </div>
  );
};

export default PADetailPage;
