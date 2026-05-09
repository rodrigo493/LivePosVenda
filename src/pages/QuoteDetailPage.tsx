import { useState, useMemo } from "react";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Trash2, FileText, Download, Eye, Plus, Save, Wrench, Package, Pencil, CreditCard, Banknote, QrCode, Truck, CalendarClock, Landmark, ExternalLink, Calculator, Loader2, CheckCircle2 } from "lucide-react";
import { ApprovalActionDialog } from "@/components/shared/ApprovalActionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQuote, useUpdateQuote, useAddQuoteItem, useUpdateQuoteItem, useDeleteQuoteItem } from "@/hooks/useQuotes";
import { useCreateProduct } from "@/hooks/useProducts";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ProductSearch } from "@/components/products/ProductSearch";
import { SuggestedParts } from "@/components/products/SuggestedParts";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { generateQuotePdf } from "@/lib/generateQuotePdf";
import { exportDocumentToExcel, printPdf, type ExportDocument } from "@/lib/exportHelpers";
import { ExportMenu } from "@/components/shared/ExportMenu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { quoteStatusLabels as statusLabels, itemTypeLabels } from "@/constants/statusLabels";
import { useAllUsers } from "@/hooks/useUserAccess";

const partTypes = [
  { value: "peca_cobrada", label: "Peça (Cobrada)" },
  { value: "peca_garantia", label: "Peça (Garantia)" },
];

const PAYMENT_OPTIONS = [
  { value: "pix",              label: "À vista — PIX",              icon: QrCode,        desc: "Pagamento instantâneo via PIX" },
  { value: "transferencia",    label: "Transferência bancária",      icon: Banknote,      desc: "TED ou DOC para conta da empresa" },
  { value: "cartao_parcelado", label: "Cartão — Parcelado c/ juros", icon: CreditCard,    desc: "Parcelamento com juros da operadora" },
  { value: "compra_programada",label: "Compra Programada",           icon: CalendarClock, desc: "Agendamento com condições especiais" },
  { value: "financiamento",    label: "Financiamento bancário",      icon: Landmark,      desc: "Mediante análise de crédito" },
];

const serviceTypes = [
  { value: "servico_cobrado", label: "Serviço (Cobrado)" },
  { value: "servico_garantia", label: "Serviço (Garantia)" },
  { value: "frete", label: "Frete" },
  { value: "desconto", label: "Desconto" },
];

const QuoteDetailPage = () => {
  const { data: myProfile } = useMyProfile();
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromTicketId = searchParams.get("from_ticket");
  const { data: quote, isLoading, error: quoteError } = useQuote(id);
  const updateQuote = useUpdateQuote();
  const addItem = useAddQuoteItem();
  const updateItem = useUpdateQuoteItem();
  const deleteItem = useDeleteQuoteItem();
  const createProduct = useCreateProduct();
  const qc = useQueryClient();
  const [approvalPrompt, setApprovalPrompt] = useState(false);
  const [searchMode, setSearchMode] = useState<"peca" | "servico" | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [showNewServiceForm, setShowNewServiceForm] = useState(false);
  const [newService, setNewService] = useState({ name: "", description: "", cost: "", itemType: "servico_cobrado" });
  const [showFreteForm, setShowFreteForm] = useState(false);
  const [newFrete, setNewFrete] = useState({ carrier: "Correios SEDEX", custom: "", value: "" });
  const [consultorId, setConsultorId] = useState<string | null | undefined>(undefined);
  const [editMode, setEditMode] = useState(false);
  const [installments, setInstallments] = useState<string>("");
  const [installmentValue, setInstallmentValue] = useState<string | null>(null);
  const [cardBrand, setCardBrand] = useState<string | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcOptions, setCalcOptions] = useState<string[] | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<string[] | null>(null);
  const [compraProgramadaNotes, setCompraProgramadaNotes] = useState<string | null>(null);
  const [financiamentoNotes, setFinanciamentoNotes] = useState<string | null>(null);
  const { data: allUsers = [] } = useAllUsers();

  // Sync local state from quote
  const currentNotes = notes ?? quote?.notes ?? "";
  const defaultValidUntil = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; })();
  const currentValidUntil = validUntil ?? quote?.valid_until ?? defaultValidUntil;
  const currentPaymentMethods: string[] = paymentMethods ?? (
    (quote as any)?.payment_methods?.length > 0 ? (quote as any).payment_methods :
    ((quote as any)?.payment_method ? [(quote as any).payment_method] : [])
  );
  const currentInstallments = installments !== "" ? installments : String((quote as any)?.installments ?? "");
  const currentInstallmentValue = installmentValue ?? (quote as any)?.installment_value ?? "";
  const currentCardBrand = cardBrand ?? (quote as any)?.card_brand ?? "";
  const currentConsultorId = consultorId !== undefined ? consultorId : ((quote as any)?.created_by ?? null);
  const currentCompraProgramadaNotes = compraProgramadaNotes ?? (quote as any)?.payment_compra_programada_notes ?? "";
  const currentFinanciamentoNotes = financiamentoNotes ?? (quote as any)?.payment_financiamento_notes ?? "";

  const handleCalculateInstallment = async () => {
    if (!currentCardBrand) { toast.error("Selecione a bandeira do cartão primeiro"); return; }
    setCalcLoading(true);
    setCalcOptions(null);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calculate-installment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
          body: JSON.stringify({
            total: totals.charged,
            brand: currentCardBrand,
            secret: "livecare-sheets-2026",
          }),
        }
      );
      const json = await resp.json();
      if (json.options?.length) setCalcOptions(json.options);
      else toast.error(json.error || "Erro ao calcular parcelamento");
    } catch {
      toast.error("Erro ao conectar com a planilha");
    } finally {
      setCalcLoading(false);
    }
  };

  const togglePaymentMethod = (method: string) => {
    setPaymentMethods(prev => {
      const cur = prev ?? currentPaymentMethods;
      return cur.includes(method) ? cur.filter(m => m !== method) : [...cur, method];
    });
  };

  const totals = useMemo(() => {
    if (!quote?.quote_items) return { subtotalPecas: 0, subtotalServicos: 0, warranty: 0, warrantyValue: 0, charged: 0, internalCost: 0, margin: 0, frete: 0, desconto: 0 };
    let warranty = 0, warrantyValue = 0, charged = 0, internalCost = 0, subtotalPecas = 0, subtotalServicos = 0, frete = 0, desconto = 0;
    for (const item of quote.quote_items) {
      const linePrice = item.quantity * Number(item.unit_price);
      const lineCost = item.quantity * Number(item.unit_cost);
      internalCost += lineCost;
      if (item.item_type === "desconto") {
        desconto += linePrice;
      } else if (item.item_type === "frete") {
        frete += linePrice;
        charged += linePrice;
      } else if (String(item.item_type).includes("garantia")) {
        warranty += lineCost;           // custo interno (para cálculo de margem)
        warrantyValue += linePrice;     // valor declarado (unit_price × qty)
      } else if (String(item.item_type).includes("peca")) {
        subtotalPecas += linePrice;
        charged += linePrice;
      } else {
        subtotalServicos += linePrice;
        charged += linePrice;
      }
    }
    const totalFinal = charged - desconto;
    const margin = totalFinal > 0 ? ((totalFinal - (internalCost - warranty)) / totalFinal * 100) : 0;
    return { subtotalPecas, subtotalServicos, warranty, warrantyValue, charged: totalFinal, internalCost, margin, frete, desconto };
  }, [quote]);

  const handleProductSelect = async (product: any, itemType: string) => {
    const tax = (Number(product.ipi_percent || 0) + Number(product.icms_percent || 0) + Number(product.pis_percent || 0) + Number(product.cofins_percent || 0) + Number(product.csll_percent || 0) + Number(product.irpj_percent || 0)) / 100;
    const cost = Number(product.base_cost) * (1 + tax);
    const price = cost * (1 + Number(product.margin_percent || 30) / 100);

    await addItem.mutateAsync({
      quote_id: id!,
      product_id: product.id,
      description: product.name,
      item_type: itemType,
      quantity: 1,
      unit_cost: cost,
      unit_price: price,
    });
    toast.success(`${product.name} adicionado ao orçamento`);
  };

  const handleQuantityChange = async (itemId: string, newQty: number) => {
    if (newQty < 1) return;
    await updateItem.mutateAsync({ id: itemId, quantity: newQty });
  };

  const handleSaveDetails = async () => {
    const parsedInstallments = currentPaymentMethods.includes("cartao_parcelado") && currentInstallments
      ? parseInt(currentInstallments, 10) || null
      : null;
    await updateQuote.mutateAsync({
      id: id!,
      notes: currentNotes,
      valid_until: currentValidUntil || null,
      payment_method: currentPaymentMethods[0] || null,
      payment_methods: currentPaymentMethods,
      installments: parsedInstallments,
      payment_compra_programada_notes: currentCompraProgramadaNotes || null,
      payment_financiamento_notes: currentFinanciamentoNotes || null,
      installment_value: currentPaymentMethods.includes("cartao_parcelado") ? (currentInstallmentValue || null) : null,
      card_brand: currentPaymentMethods.includes("cartao_parcelado") ? (currentCardBrand || null) : null,
      created_by: currentConsultorId || null,
    } as any);
    toast.success("Detalhes salvos com sucesso");
  };

  const buildPdfPayload = () => ({
    quoteNumber: quote!.quote_number,
    date: new Date(quote!.created_at).toLocaleDateString("pt-BR"),
    validUntil: currentValidUntil ? new Date(currentValidUntil + "T12:00:00").toLocaleDateString("pt-BR") : undefined,
    company: {
      name: "Live Care — Live Universe",
      phone: allUsers.find((u: any) => u.user_id === (quote as any)?.created_by)?.phone || myProfile?.phone || "(19) 3608-4008",
      email: allUsers.find((u: any) => u.user_id === (quote as any)?.created_by)?.email || myProfile?.email || "posvenda@liveuni.com.br",
    },
    exportedBy: allUsers.find((u: any) => u.user_id === (quote as any)?.created_by)?.full_name || myProfile?.full_name || myProfile?.email || undefined,
    client: {
      name: quote!.clients?.name || "",
      equipment: quote!.equipments?.equipment_models?.name,
      serial: quote!.equipments?.serial_number,
    },
    items: (quote!.quote_items || []).map((item: any) => ({
      code: item.products?.code || "—",
      description: item.description,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      total: item.quantity * Number(item.unit_price),
      isWarranty: String(item.item_type).includes("garantia"),
      itemType: item.item_type as string,
    })),
    subtotal: totals.subtotalPecas + totals.subtotalServicos,
    freight: totals.frete,
    discount: totals.desconto,
    totalCharged: totals.charged,
    warrantyTotal: totals.warrantyValue,
    notes: currentNotes || undefined,
    docType: "quote" as const,
    paymentMethod: currentPaymentMethods[0] || null,
    paymentMethods: currentPaymentMethods,
    paymentCompraProgramadaNotes: currentCompraProgramadaNotes || undefined,
    paymentFinanciamentoNotes: currentFinanciamentoNotes || undefined,
    installments: currentPaymentMethods.includes("cartao_parcelado") && currentInstallments
      ? parseInt(currentInstallments, 10) || null
      : null,
    installmentValue: currentPaymentMethods.includes("cartao_parcelado") ? (currentInstallmentValue || null) : null,
  });

  const buildExcelPayload = (): ExportDocument => {
    const p = buildPdfPayload();
    return {
      title: "Orçamento",
      number: p.quoteNumber,
      date: p.date,
      clientName: p.client.name,
      equipment: p.client.equipment,
      serial: p.client.serial,
      items: p.items,
      subtotal: p.subtotal,
      freight: p.freight,
      discount: p.discount,
      totalCharged: p.totalCharged,
      warrantyTotal: p.warrantyTotal,
      notes: p.notes,
    };
  };

  const handleGeneratePdf = (download = false) => {
    if (!quote) return;
    const doc = generateQuotePdf(buildPdfPayload());
    if (download) doc.save(`${quote.quote_number}.pdf`);
    else {
      const pdfWindow = window.open(doc.output("bloburl"), "_blank", "noopener,noreferrer");
      if (pdfWindow) pdfWindow.opener = null;
    }
  };

  const handleExportExcel = () => {
    if (!quote) return;
    exportDocumentToExcel(buildExcelPayload());
  };

  const handlePrint = () => {
    if (!quote) return;
    printPdf(generateQuotePdf(buildPdfPayload()));
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;
  if (!quote) return (
    <div className="p-8 text-center text-muted-foreground">
      <p>Orçamento não encontrado.</p>
      <p className="mt-2 text-xs font-mono opacity-60">id={String(id)} loading={String(isLoading)}</p>
      {quoteError && <p className="mt-2 text-xs text-destructive font-mono">{String(quoteError)}</p>}
    </div>
  );

  const modelName = quote.equipments?.equipment_models?.name || "";
  const equipModelId = (quote.equipments as any)?.model_id || undefined;
  const isEditable = quote.status === "rascunho" || editMode;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => {
          if (fromTicketId) navigate(`/crm?open_ticket=${fromTicketId}`);
          else navigate("/orcamentos");
        }}><ArrowLeft className="h-4 w-4 mr-1" /> {fromTicketId ? "Voltar ao Card" : "Voltar"}</Button>
        <div className="flex-1">
          <h1 className="font-display font-bold text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> {quote.quote_number}
          </h1>
          <p className="text-xs text-muted-foreground">{quote.clients?.name} • {modelName || "Sem equipamento"}{quote.equipments?.serial_number ? ` • S/N ${quote.equipments.serial_number}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu onPdf={() => handleGeneratePdf(true)} onExcel={handleExportExcel} onPrint={handlePrint} />
          {!editMode && quote.status !== "rascunho" && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditMode(true)}>
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
          )}
          {editMode && (
            <Button size="sm" variant="outline" className="gap-1.5 text-muted-foreground" onClick={() => setEditMode(false)}>
              Cancelar Edição
            </Button>
          )}
          <StatusBadge status={statusLabels[quote.status] || quote.status} />
        </div>
      </div>

      {/* Client & Equipment info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-card rounded-xl border p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">Cliente</p>
          <p className="text-sm font-medium">{quote.clients?.name}</p>
          {quote.tickets && <p className="text-xs text-muted-foreground mt-1">Chamado: {quote.tickets.ticket_number} — {quote.tickets.title}</p>}
        </div>
        <div className="bg-card rounded-xl border p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">Equipamento</p>
          <p className="text-sm font-medium">{modelName || "—"}</p>
          {quote.equipments?.serial_number && <p className="text-xs text-muted-foreground mt-1">S/N: {quote.equipments.serial_number}</p>}
        </div>
      </div>

      {/* Financial summary cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
        {[
          { label: "Peças", value: `R$ ${totals.subtotalPecas.toFixed(2)}` },
          { label: "Serviços", value: `R$ ${totals.subtotalServicos.toFixed(2)}` },
          { label: "Frete", value: `R$ ${totals.frete.toFixed(2)}` },
          { label: "Desconto", value: `- R$ ${totals.desconto.toFixed(2)}` },
          { label: "Garantia (decl.)", value: `R$ ${totals.warrantyValue.toFixed(2)}`, accent: true },
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

      {/* Add items buttons */}
      {isEditable && (
        <div className="flex gap-2 mb-4">
          <Button size="sm" className="gap-1.5" variant={searchMode === "peca" ? "default" : "outline"} onClick={() => { setSearchMode(searchMode === "peca" ? null : "peca"); setShowNewServiceForm(false); setShowFreteForm(false); }}>
            <Package className="h-3.5 w-3.5" /> Adicionar Peça
          </Button>
          <Button size="sm" className="gap-1.5" variant={searchMode === "servico" ? "default" : "outline"} onClick={() => { setSearchMode(searchMode === "servico" ? null : "servico"); setShowNewServiceForm(false); setShowFreteForm(false); }}>
            <Wrench className="h-3.5 w-3.5" /> Adicionar Serviço
          </Button>
          <Button size="sm" className="gap-1.5" variant={showFreteForm ? "default" : "outline"} onClick={() => { setShowFreteForm(f => !f); setSearchMode(null); setShowNewServiceForm(false); }}>
            <Truck className="h-3.5 w-3.5" /> Adicionar Frete
          </Button>
        </div>
      )}

      {/* Product search */}
      {isEditable && searchMode && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 space-y-3">
          <ProductSearch
            modelFilter={modelName}
            onSelect={handleProductSelect}
            itemTypes={searchMode === "peca" ? partTypes : serviceTypes}
            showNomusStock={searchMode === "peca"}
          />

          {/* Inline new service creation */}
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
                      <Input placeholder="Ex: Mão de obra técnica, Visita técnica..." value={newService.name} onChange={(e) => setNewService(s => ({ ...s, name: e.target.value }))} className="mt-1" />
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
                        const cost = Number(newService.cost);
                        const code = `SRV-${Date.now().toString(36).toUpperCase()}`;
                        const product = await createProduct.mutateAsync({
                          name: newService.name.trim(),
                          code,
                          base_cost: cost,
                          description: newService.description || null,
                          category: "servico",
                          product_type: "servico",
                          margin_percent: 30,
                        });
                        const isWarranty = newService.itemType.includes("garantia");
                        const price = isWarranty ? 0 : cost * 1.3;
                        await addItem.mutateAsync({
                          quote_id: id!,
                          product_id: product.id,
                          description: newService.name.trim(),
                          item_type: newService.itemType,
                          quantity: 1,
                          unit_cost: cost,
                          unit_price: price,
                        });
                        toast.success(`Serviço "${newService.name}" criado e adicionado`);
                        setNewService({ name: "", description: "", cost: "", itemType: "servico_cobrado" });
                        setShowNewServiceForm(false);
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

      {/* Frete form */}
      {isEditable && showFreteForm && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 bg-card border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /> Adicionar Frete</p>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowFreteForm(false); setNewFrete({ carrier: "Correios SEDEX", custom: "", value: "" }); }}>Cancelar</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Transportadora *</Label>
              <Select value={newFrete.carrier} onValueChange={v => setNewFrete(f => ({ ...f, carrier: v, custom: "" }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Correios SEDEX">Correios SEDEX</SelectItem>
                  <SelectItem value="Correios PAC">Correios PAC</SelectItem>
                  <SelectItem value="JAD Log">JAD Log</SelectItem>
                  <SelectItem value="Outro">Outro</SelectItem>
                </SelectContent>
              </Select>
              {newFrete.carrier === "Outro" && (
                <Input placeholder="Nome da transportadora..." value={newFrete.custom} onChange={e => setNewFrete(f => ({ ...f, custom: e.target.value }))} className="mt-2" />
              )}
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor do Frete (R$) *</Label>
              <Input type="number" step="0.01" min="0" placeholder="0,00" value={newFrete.value} onChange={e => setNewFrete(f => ({ ...f, value: e.target.value }))} className="mt-1" />
            </div>
            <div className="flex items-end">
              <Button size="sm" className="gap-1.5"
                disabled={!newFrete.value || (newFrete.carrier === "Outro" && !newFrete.custom.trim()) || addItem.isPending}
                onClick={async () => {
                  const carrierName = newFrete.carrier === "Outro" ? newFrete.custom.trim() : newFrete.carrier;
                  const val = Number(newFrete.value);
                  await addItem.mutateAsync({
                    quote_id: id!,
                    description: carrierName,
                    item_type: "frete",
                    quantity: 1,
                    unit_cost: val,
                    unit_price: val,
                  });
                  toast.success(`Frete "${carrierName}" adicionado`);
                  setNewFrete({ carrier: "Correios SEDEX", custom: "", value: "" });
                  setShowFreteForm(false);
                }}>
                <Plus className="h-3.5 w-3.5" /> {addItem.isPending ? "Adicionando..." : "Adicionar"}
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Suggested parts */}
      {isEditable && (
        <SuggestedParts modelId={equipModelId} modelName={modelName} onSelect={handleProductSelect} />
      )}

      {/* Items table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-sm overflow-hidden mb-6">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/50">
          <h3 className="font-display font-semibold text-sm">Itens do Orçamento ({quote.quote_items?.length || 0})</h3>
        </div>
        {!quote.quote_items?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Nenhum item adicionado. Use os botões acima para adicionar peças ou serviços.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  {["Código", "Descrição", "Tipo", "Qtd", "Preço Unit.", "Subtotal", ""].map((h) => (
                    <th key={h} className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-3 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quote.quote_items.map((item: any) => {
                  const isWarranty = String(item.item_type).includes("garantia");
                  return (
                    <tr key={item.id} className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${isWarranty ? "bg-success/5" : ""}`}>
                      <td className="px-3 py-2.5 text-xs font-mono">{item.products?.code || "—"}</td>
                      <td className="px-3 py-2.5 text-xs">{item.description}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={itemTypeLabels[item.item_type] || item.item_type} /></td>
                      <td className="px-3 py-2.5">
                        {isEditable ? (
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            className="h-7 w-16 text-xs font-mono text-center"
                            defaultValue={item.quantity}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val) && val >= 1 && val !== item.quantity) {
                                handleQuantityChange(item.id, val);
                              } else {
                                e.target.value = String(item.quantity);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            }}
                          />
                        ) : (
                          <span className="text-xs font-mono">{item.quantity}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono">
                        {isWarranty ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-success font-medium">Garantia</span>
                            {isEditable ? (
                              <>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="h-7 w-24 text-xs font-mono"
                                  defaultValue={Number(item.unit_price).toFixed(2)}
                                  placeholder="Valor decl."
                                  onBlur={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val) && val !== Number(item.unit_price)) {
                                      updateItem.mutateAsync({ id: item.id, unit_price: val });
                                    }
                                  }}
                                />
                                <span className="text-[9px] text-muted-foreground leading-tight">valor declarado</span>
                              </>
                            ) : (
                              Number(item.unit_price) > 0 && (
                                <span className="text-[10px] text-success/80">
                                  R$ {Number(item.unit_price).toFixed(2)} decl.
                                </span>
                              )
                            )}
                          </div>
                        ) : isEditable ? (
                          <Input
                            type="number"
                            step="0.01"
                            className="h-7 w-24 text-xs font-mono"
                            defaultValue={Number(item.unit_price).toFixed(2)}
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val !== Number(item.unit_price)) {
                                updateItem.mutateAsync({ id: item.id, unit_price: val });
                              }
                            }}
                          />
                        ) : (
                          `R$ ${Number(item.unit_price).toFixed(2)}`
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono font-medium">
                        {isWarranty ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-success">Coberto</span>
                            {Number(item.unit_price) > 0 && (
                              <span className="text-[9px] text-success/70">
                                R$ {(item.quantity * Number(item.unit_price)).toFixed(2)} decl.
                              </span>
                            )}
                          </div>
                        ) : (
                          `R$ ${(item.quantity * Number(item.unit_price)).toFixed(2)}`
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {isEditable && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => deleteItem.mutateAsync(item.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Payment method */}
      <div className="bg-card rounded-xl border p-4 mb-4">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3 block">
          Formas de Pagamento <span className="normal-case font-normal">(selecione uma ou mais)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_OPTIONS.map(({ value, label, icon: Icon, desc }) => {
            const selected = currentPaymentMethods.includes(value);
            return (
              <button
                key={value}
                type="button"
                disabled={!isEditable}
                onClick={() => {
                  togglePaymentMethod(value);
                  if (value !== "cartao_parcelado") setInstallments("");
                }}
                className={[
                  "flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-all",
                  isEditable ? "cursor-pointer hover:border-primary/50" : "cursor-default opacity-70",
                  selected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border bg-muted/30",
                ].join(" ")}
              >
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <p className={`text-sm font-medium leading-tight ${selected ? "text-primary" : "text-foreground"}`}>{label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Parcelas — cartao_parcelado */}
        {currentPaymentMethods.includes("cartao_parcelado") && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-4 space-y-3"
          >
            {/* Bandeira + botão calcular */}
            <div className="flex flex-wrap items-center gap-3">
              <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select
                value={currentCardBrand}
                onValueChange={setCardBrand}
                disabled={!isEditable}
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="Bandeira do cartão..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visa_master">Visa / Mastercard</SelectItem>
                  <SelectItem value="elo">Elo</SelectItem>
                  <SelectItem value="hipercard">Hipercard / Demais</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                disabled={!currentCardBrand || calcLoading}
                onClick={handleCalculateInstallment}
              >
                {calcLoading
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Calculando...</>
                  : <><Calculator className="h-3 w-3" /> Calcular Parcelamento</>}
              </Button>
            </div>

            {/* Opções retornadas pela planilha */}
            {calcOptions && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="bg-muted/40 rounded-xl border p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Selecione uma ou mais condições:
                  </p>
                  <button
                    type="button"
                    onClick={() => setCalcOptions(null)}
                    className="text-[10px] text-primary hover:underline font-medium"
                  >
                    Pronto
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                  {calcOptions.map((opt) => {
                    const parts = currentInstallmentValue ? currentInstallmentValue.split("\n").filter(Boolean) : [];
                    const selected = parts.includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          if (selected) {
                            setInstallmentValue(parts.filter(p => p !== opt).join("\n") || null);
                          } else {
                            setInstallmentValue([...parts, opt].join("\n"));
                          }
                        }}
                        className={[
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs text-left transition-all",
                          selected
                            ? "border-primary bg-primary/5 text-primary font-medium"
                            : "border-border bg-background hover:border-primary/50 hover:bg-primary/5",
                        ].join(" ")}
                      >
                        {selected && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                        <span className="font-mono">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Condições selecionadas */}
            {currentInstallmentValue && (
              <div className="flex flex-wrap gap-1.5">
                {currentInstallmentValue.split("\n").filter(Boolean).map((opt) => (
                  <span
                    key={opt}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-mono text-primary"
                  >
                    {opt}
                    {isEditable && (
                      <button
                        type="button"
                        onClick={() => {
                          const parts = currentInstallmentValue.split("\n").filter(Boolean);
                          setInstallmentValue(parts.filter(p => p !== opt).join("\n") || null);
                        }}
                        className="hover:text-destructive transition-colors"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* Campo manual quando não há opções da planilha */}
            {!calcOptions && !currentInstallmentValue && isEditable && (
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground whitespace-nowrap">Ou digite manualmente:</label>
                <Input
                  type="text"
                  placeholder="ex: 12x de R$ 1.200,00"
                  value=""
                  onChange={(e) => setInstallmentValue(e.target.value)}
                  className="h-8 text-sm font-mono flex-1 max-w-xs"
                />
              </div>
            )}
          </motion.div>
        )}

        {/* Observações — compra_programada */}
        {currentPaymentMethods.includes("compra_programada") && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-4">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">
              Condições da Compra Programada
            </label>
            <Textarea
              value={currentCompraProgramadaNotes}
              onChange={(e) => setCompraProgramadaNotes(e.target.value)}
              placeholder="Descreva as condições: valor de entrada, parcelas mensais, prazo de entrega, cronograma de pagamento..."
              rows={3}
              disabled={!isEditable}
            />
          </motion.div>
        )}

        {/* Observações — financiamento */}
        {currentPaymentMethods.includes("financiamento") && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-4">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">
              Informações do Financiamento Bancário
            </label>
            <Textarea
              value={currentFinanciamentoNotes}
              onChange={(e) => setFinanciamentoNotes(e.target.value)}
              placeholder="Banco parceiro, prazo de análise, documentação necessária, taxa de juros estimada..."
              rows={3}
              disabled={!isEditable}
            />
          </motion.div>
        )}
      </div>

      {/* Notes and validity */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="md:col-span-2">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Observações / Condições Comerciais</label>
          <Textarea
            value={currentNotes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Condições de pagamento, prazo estimado, garantia de serviço..."
            rows={3}
            disabled={!isEditable}
          />
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Consultor / Vendedor</label>
            <Select value={currentConsultorId ?? ""} onValueChange={v => setConsultorId(v || null)} disabled={!isEditable}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecionar consultor..." /></SelectTrigger>
              <SelectContent>
                {allUsers.map(u => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    <span>{u.full_name || u.email}</span>
                    {(u.email || u.phone) && (
                      <span className="ml-1 text-muted-foreground text-[11px]">
                        {[u.email, u.phone].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Validade do Orçamento</label>
            <Input
              type="date"
              value={currentValidUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              disabled={!isEditable}
            />
          </div>
          {isEditable && (
            <Button size="sm" variant="outline" className="gap-1.5 w-full" onClick={handleSaveDetails}>
              <Save className="h-3.5 w-3.5" /> Salvar Detalhes
            </Button>
          )}
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
          if (fromTicketId) navigate(`/crm?open_ticket=${fromTicketId}`);
          else navigate("/orcamentos");
        }}>
          <ArrowLeft className="h-3.5 w-3.5" /> {fromTicketId ? "Voltar ao Card" : "Voltar para Orçamentos"}
        </Button>
        {isEditable && (
          <Button size="sm" className="gap-1.5" onClick={handleSaveDetails}>
            <Save className="h-3.5 w-3.5" /> Salvar Orçamento
          </Button>
        )}
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleGeneratePdf(false)}>
          <Eye className="h-3.5 w-3.5" /> Visualizar PDF
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleGeneratePdf(true)}>
          <Download className="h-3.5 w-3.5" /> Baixar PDF
        </Button>
        <div className="flex-1" />
        {quote.status === "rascunho" && (
          <Button onClick={() => updateQuote.mutateAsync({ id: id!, status: "aguardando_aprovacao", subtotal: totals.subtotalPecas + totals.subtotalServicos, total: totals.charged, freight: totals.frete, discount: totals.desconto })}>
            Enviar para Aprovação
          </Button>
        )}
        {quote.status === "aguardando_aprovacao" && (
          <>
            <Button onClick={async () => {
              await updateQuote.mutateAsync({ id: id!, status: "aprovado", approved_at: new Date().toISOString() });
              setApprovalPrompt(true);
            }}>Aprovar</Button>
            <Button variant="destructive" onClick={() => updateQuote.mutateAsync({ id: id!, status: "reprovado" })}>Reprovar</Button>
          </>
        )}
      </div>

      <ApprovalActionDialog
        open={approvalPrompt}
        onOpenChange={setApprovalPrompt}
        quote={{
          id: quote.id,
          quote_number: quote.quote_number,
          ticket_id: quote.ticket_id,
          client_id: quote.client_id,
          equipment_id: quote.equipment_id,
        }}
      />
    </div>
  );
};

export default QuoteDetailPage;
