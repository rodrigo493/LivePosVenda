import { useState, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Trash2, FileText, Download, Eye, Minus, Plus, Save, Wrench, Package, Pencil, Shield } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { notifySquad } from "@/lib/squadNotify";
import { useQueryClient } from "@tanstack/react-query";
import { quoteStatusLabels as statusLabels, itemTypeLabels } from "@/constants/statusLabels";

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

const QuoteDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromTicketId = searchParams.get("from_ticket");
  const { data: quote, isLoading } = useQuote(id);
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
  const [editMode, setEditMode] = useState(false);

  // Sync local state from quote
  const currentNotes = notes ?? quote?.notes ?? "";
  const currentValidUntil = validUntil ?? quote?.valid_until ?? "";

  const totals = useMemo(() => {
    if (!quote?.quote_items) return { subtotalPecas: 0, subtotalServicos: 0, warranty: 0, charged: 0, internalCost: 0, margin: 0, frete: 0, desconto: 0 };
    let warranty = 0, charged = 0, internalCost = 0, subtotalPecas = 0, subtotalServicos = 0, frete = 0, desconto = 0;
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
        warranty += lineCost;
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
    return { subtotalPecas, subtotalServicos, warranty, charged: totalFinal, internalCost, margin, frete, desconto };
  }, [quote]);

  const handleProductSelect = async (product: any, itemType: string) => {
    const tax = (Number(product.ipi_percent || 0) + Number(product.icms_percent || 0) + Number(product.pis_percent || 0) + Number(product.cofins_percent || 0) + Number(product.csll_percent || 0) + Number(product.irpj_percent || 0)) / 100;
    const cost = Number(product.base_cost) * (1 + tax);
    const price = itemType.includes("garantia") ? 0 : cost * (1 + Number(product.margin_percent || 30) / 100);

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
    await updateQuote.mutateAsync({
      id: id!,
      notes: currentNotes,
      valid_until: currentValidUntil || null,
    });
    toast.success("Detalhes salvos com sucesso");
  };

  const buildPdfPayload = () => ({
    quoteNumber: quote!.quote_number,
    date: new Date(quote!.created_at).toLocaleDateString("pt-BR"),
    validUntil: currentValidUntil ? new Date(currentValidUntil + "T12:00:00").toLocaleDateString("pt-BR") : undefined,
    company: { name: "Live Care Pilates", phone: "(11) 99999-9999", email: "contato@livecare.com.br" },
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
    })),
    subtotal: totals.subtotalPecas + totals.subtotalServicos,
    freight: totals.frete,
    discount: totals.desconto,
    totalCharged: totals.charged,
    warrantyTotal: totals.warranty,
    notes: currentNotes || undefined,
    docType: "quote" as const,
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
  if (!quote) return <div className="p-8 text-center text-muted-foreground">Orçamento não encontrado.</div>;

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

      {/* Add items buttons */}
      {isEditable && (
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
      {isEditable && searchMode && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 space-y-3">
          <ProductSearch
            modelFilter={modelName}
            onSelect={handleProductSelect}
            itemTypes={searchMode === "peca" ? partTypes : serviceTypes}
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
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => handleQuantityChange(item.id, item.quantity - 1)} disabled={item.quantity <= 1}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="text-xs font-mono w-6 text-center">{item.quantity}</span>
                            <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => handleQuantityChange(item.id, item.quantity + 1)}>
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs font-mono">{item.quantity}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono">
                        {isWarranty ? (
                          <span className="text-success">Garantia</span>
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
                      <td className="px-3 py-2.5 text-xs font-mono font-medium">{isWarranty ? <span className="text-success">Coberto</span> : `R$ ${(item.quantity * Number(item.unit_price)).toFixed(2)}`}</td>
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
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Validade do Orçamento</label>
          <Input
            type="date"
            value={currentValidUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            disabled={!isEditable}
          />
          {isEditable && (
            <Button size="sm" variant="outline" className="mt-2 gap-1.5 w-full" onClick={handleSaveDetails}>
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

      {/* Approval Prompt: PA or PG */}
      <Dialog open={approvalPrompt} onOpenChange={setApprovalPrompt}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Orçamento Aprovado</DialogTitle>
            <DialogDescription>O que deseja criar a partir deste orçamento?</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <Button
              className="w-full gap-2"
              onClick={async () => {
                const { data: paNumData } = await supabase.rpc("generate_pa_number");
                const paNumber = paNumData || quote.quote_number.replace(/^OC\./, "PA.");
                const { data: paData, error } = await supabase.from("service_requests").insert({
                  ticket_id: quote.ticket_id!,
                  request_type: "troca_peca" as any,
                  notes: "Gerado a partir de orçamento aprovado",
                  request_number: paNumber,
                }).select().single();
                if (error) { toast.error(error.message || "Erro ao criar PA"); return; }
                await supabase.from("quotes").update({ service_request_id: paData.id } as any).eq("id", id!);
                void notifySquad({ recordType: "pa", recordId: paData.id, reference: paNumber });
                toast.success(`Pedido de Acessório ${paNumber} criado!`);
                qc.invalidateQueries({ queryKey: ["quotes"] });
                qc.invalidateQueries({ queryKey: ["service_requests_pa"] });
                setApprovalPrompt(false);
              }}
            >
              <Package className="h-4 w-4" /> Pedido de Acessório (PA)
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={async () => {
                const { data: pgNumData } = await supabase.rpc("generate_pg_number");
                const pgNumber = pgNumData || quote.quote_number.replace(/^OC\./, "PG.");
                const { data: pgData, error } = await supabase.from("warranty_claims").insert({
                  ticket_id: quote.ticket_id!,
                  defect_description: "Gerado a partir de orçamento aprovado",
                  claim_number: pgNumber,
                }).select().single();
                if (error) { toast.error(error.message || "Erro ao criar PG"); return; }
                await supabase.from("quotes").update({ warranty_claim_id: pgData.id } as any).eq("id", id!);
                void notifySquad({ recordType: "pg", recordId: pgData.id, reference: pgNumber });
                toast.success(`Pedido de Garantia ${pgNumber} criado!`);
                qc.invalidateQueries({ queryKey: ["quotes"] });
                qc.invalidateQueries({ queryKey: ["warranty_claims_pg"] });
                setApprovalPrompt(false);
              }}
            >
              <Shield className="h-4 w-4" /> Pedido de Garantia (PG)
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setApprovalPrompt(false)}>
              Apenas aprovar, sem criar pedido
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QuoteDetailPage;
