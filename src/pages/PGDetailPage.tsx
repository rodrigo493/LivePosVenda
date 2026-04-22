import { useState, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Shield, Save, CheckCircle, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notifySquad } from "@/lib/squadNotify";
import { generateQuotePdf } from "@/lib/generateQuotePdf";
import { exportDocumentToExcel, printPdf, type ExportDocument } from "@/lib/exportHelpers";
import { ExportMenu } from "@/components/shared/ExportMenu";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { warrantyStatusLabels, itemTypeLabels } from "@/constants/statusLabels";
import { formatDate as fmtDate } from "@/lib/formatters";

const PGDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromTicketId = searchParams.get("from_ticket");
  const qc = useQueryClient();

  const { data: wc, isLoading } = useQuery({
    queryKey: ["warranty_claim_detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warranty_claims")
        .select("*, tickets(ticket_number, title, clients(name), equipments(serial_number, equipment_models(name)))")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: linkedQuote } = useQuery({
    queryKey: ["pg_linked_quote", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, quote_items(*, products(code, name))")
        .eq("warranty_claim_id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [defect, setDefect] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [parts, setParts] = useState<string | null>(null);
  const [costVal, setCostVal] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const items = linkedQuote?.quote_items || [];
  const totals = useMemo(() => {
    let warranty = 0, subtotalPecas = 0, subtotalServicos = 0, frete = 0, desconto = 0, internalCost = 0;
    for (const item of items) {
      const linePrice = item.quantity * Number(item.unit_price);
      const lineCost = item.quantity * Number(item.unit_cost);
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
  }, [items]);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;
  if (!wc) return <div className="p-8 text-center text-muted-foreground">Pedido de garantia não encontrado.</div>;

  const currentDefect = defect ?? wc.defect_description ?? "";
  const currentAnalysis = analysis ?? wc.technical_analysis ?? "";
  const currentParts = parts ?? wc.covered_parts ?? "";
  const currentCost = costVal ?? String(wc.internal_cost || 0);
  const claimNumber = (wc as any).claim_number || "PG";
  const clientName = wc.tickets?.clients?.name || "—";
  const modelName = wc.tickets?.equipments?.equipment_models?.name || "—";
  const serialNumber = wc.tickets?.equipments?.serial_number || "";

  const buildPgPdfPayload = () => ({
    quoteNumber: claimNumber,
    date: new Date(wc.created_at).toLocaleDateString("pt-BR"),
    company: { name: "Live Care Pilates", phone: "(11) 99999-9999", email: "contato@livecare.com.br" },
    client: {
      name: clientName,
      equipment: modelName !== "—" ? modelName : undefined,
      serial: serialNumber || undefined,
    },
    items: items.map((item: any) => ({
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
    notes: currentDefect || undefined,
    docType: "pg" as const,
  });

  const buildPgExcelPayload = (): ExportDocument => {
    const p = buildPgPdfPayload();
    return {
      title: "Pedido de Garantia",
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

  const handleExportPdf = () => { generateQuotePdf(buildPgPdfPayload()).save(`${claimNumber}.pdf`); };
  const handleExportExcel = () => exportDocumentToExcel(buildPgExcelPayload());
  const handlePrint = () => printPdf(generateQuotePdf(buildPgPdfPayload()));

  const handleSave = async () => {
    const { error } = await supabase.from("warranty_claims").update({
      defect_description: currentDefect,
      technical_analysis: currentAnalysis,
      covered_parts: currentParts,
      internal_cost: parseFloat(currentCost) || 0,
    }).eq("id", id!);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("Salvo com sucesso"); qc.invalidateQueries({ queryKey: ["warranty_claim_detail", id] }); }
  };

  const handleStatusChange = async (val: string) => {
    const { error } = await supabase.from("warranty_claims").update({ warranty_status: val as any }).eq("id", id!);
    if (error) toast.error("Erro ao atualizar");
    else { toast.success("Status atualizado"); qc.invalidateQueries({ queryKey: ["warranty_claim_detail", id] }); }
  };

  const handleApprove = async () => {
    setApproving(true);
    // Notifica o SquadOS logo ao aprovar, independente do resultado do ERP.
    void notifySquad({ recordType: "pg", recordId: id!, reference: claimNumber });
    try {
      const orderItems = items.map((item: any) => ({
        product_code: item.products?.code || "",
        description: item.description,
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
      }));

      const res = await supabase.functions.invoke("nomus-create-order", {
        body: {
          order_type: "garantia",
          order_code: claimNumber,
          items: orderItems,
          notes: currentDefect,
          client_name: clientName,
        },
      });

      if (res.error) throw new Error(res.error.message || "Erro ao enviar ao ERP");
      
      await supabase.from("warranty_claims").update({ warranty_status: "aprovada" as any }).eq("id", id!);
      toast.success("Pedido de garantia aprovado e enviado ao ERP!");
      qc.invalidateQueries({ queryKey: ["warranty_claim_detail", id] });
    } catch (err: any) {
      if (import.meta.env.DEV) console.error("Approve error:", err);
      toast.error(err.message || "Erro ao aprovar pedido");
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
          else navigate("/pedidos-garantia");
        }}><ArrowLeft className="h-4 w-4 mr-1" /> {fromTicketId ? "Voltar ao Card" : "Voltar"}</Button>
        <div className="flex-1">
          <h1 className="font-display font-bold text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> {claimNumber}
          </h1>
          <p className="text-xs text-muted-foreground">{clientName} • {modelName}{serialNumber ? ` • S/N ${serialNumber}` : ""}</p>
        </div>
        <StatusBadge status={warrantyStatusLabels[wc.warranty_status] || wc.warranty_status} />
        <ExportMenu onPdf={handleExportPdf} onExcel={handleExportExcel} onPrint={handlePrint} />
      </div>

      {/* Client & Equipment */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-card rounded-xl border p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">Cliente</p>
          <p className="text-sm font-medium">{clientName}</p>
          {wc.tickets && <p className="text-xs text-muted-foreground mt-1">Chamado: {wc.tickets.ticket_number} — {wc.tickets.title}</p>}
        </div>
        <div className="bg-card rounded-xl border p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">Equipamento</p>
          <p className="text-sm font-medium">{modelName}</p>
          {serialNumber && <p className="text-xs text-muted-foreground mt-1">S/N: {serialNumber}</p>}
        </div>
      </div>

      {/* Orçamento de origem */}
      {linkedQuote && (
        <div className="bg-card rounded-xl border shadow-sm p-4 mb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Orçamento de Origem</p>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => navigate(`/orcamentos/${linkedQuote.id}`)}>
              <ExternalLink className="h-3.5 w-3.5" /> {linkedQuote.quote_number}
            </Button>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Status do Orçamento</label>
              <Select
                value={linkedQuote.status}
                onValueChange={async (val) => {
                  await supabase.from("quotes").update({ status: val }).eq("id", linkedQuote.id);
                  qc.invalidateQueries({ queryKey: ["pg_linked_quote", id] });
                  qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
                }}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aguardando_aprovacao">Em Análise</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="reprovado">Reprovado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total</p>
              <p className="text-lg font-bold font-mono text-primary">R$ {Number(linkedQuote.total || 0).toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}

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
                  {["Código", "Descrição", "Tipo", "Qtd", "Preço Unit.", "Subtotal"].map((h) => (
                    <th key={h} className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-3 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => {
                  const isWarranty = String(item.item_type).includes("garantia");
                  return (
                    <tr key={item.id} className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${isWarranty ? "bg-success/5" : ""}`}>
                      <td className="px-3 py-2.5 text-xs font-mono">{item.products?.code || "—"}</td>
                      <td className="px-3 py-2.5 text-xs">{item.description}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={itemTypeLabels[item.item_type] || item.item_type} /></td>
                      <td className="px-3 py-2.5 text-xs font-mono">{item.quantity}</td>
                      <td className="px-3 py-2.5 text-xs font-mono">
                        {isWarranty ? <span className="text-success">Garantia</span> : `R$ ${Number(item.unit_price).toFixed(2)}`}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono font-medium">
                        {isWarranty ? <span className="text-success">Coberto</span> : `R$ ${(item.quantity * Number(item.unit_price)).toFixed(2)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Editable fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Descrição do Defeito</label>
          <Textarea value={currentDefect} onChange={(e) => setDefect(e.target.value)} placeholder="Descreva o defeito..." rows={3} />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Análise Técnica</label>
          <Textarea value={currentAnalysis} onChange={(e) => setAnalysis(e.target.value)} placeholder="Análise técnica..." rows={3} />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Peças Cobertas</label>
          <Textarea value={currentParts} onChange={(e) => setParts(e.target.value)} placeholder="Peças cobertas pela garantia..." rows={2} />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Custo Interno (R$)</label>
          <input
            type="number"
            step="0.01"
            value={currentCost}
            onChange={(e) => setCostVal(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
          />
        </div>
      </div>

      {/* Status change */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Status do PG</label>
          <Select value={wc.warranty_status} onValueChange={handleStatusChange}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="em_analise">Em Análise</SelectItem>
              <SelectItem value="aprovada">Aprovado</SelectItem>
              <SelectItem value="reprovada">Reprovado</SelectItem>
              <SelectItem value="convertida_os">Convertida em OS</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
          if (fromTicketId) navigate(`/crm?open_ticket=${fromTicketId}`);
          else navigate("/pedidos-garantia");
        }}>
          <ArrowLeft className="h-3.5 w-3.5" /> {fromTicketId ? "Voltar ao Card" : "Voltar para Pedidos de Garantia"}
        </Button>
        <Button size="sm" className="gap-1.5" onClick={handleSave}>
          <Save className="h-3.5 w-3.5" /> Salvar
        </Button>
      </div>
    </div>
  );
};

export default PGDetailPage;
