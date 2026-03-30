import { useState, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Trash2, ClipboardList, Minus, Plus, Package, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkOrder, useUpdateWorkOrder, useAddWorkOrderItem, useUpdateWorkOrderItem } from "@/hooks/useWorkOrders";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ProductSearch } from "@/components/products/ProductSearch";
import { SuggestedParts } from "@/components/products/SuggestedParts";
import { TechnicalTimeline } from "@/components/tickets/TechnicalTimeline";
import { logTechnicalEvent } from "@/hooks/useTechnicalHistory";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { workOrderStatusLabels as statusLabels, itemTypeLabels } from "@/constants/statusLabels";

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

const WorkOrderDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromTicketId = searchParams.get("from_ticket");
  const { data: wo, isLoading } = useWorkOrder(id);
  const updateWo = useUpdateWorkOrder();
  const addItem = useAddWorkOrderItem();
  const updateItem = useUpdateWorkOrderItem();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [searchMode, setSearchMode] = useState<"peca" | "servico" | null>(null);

  const totals = useMemo(() => {
    if (!wo?.work_order_items) return { internalCost: 0, warranty: 0, charged: 0, margin: 0, subtotalPecas: 0, subtotalServicos: 0, frete: 0, desconto: 0 };
    let internalCost = 0, warranty = 0, charged = 0, subtotalPecas = 0, subtotalServicos = 0, frete = 0, desconto = 0;
    for (const item of wo.work_order_items) {
      const lineCost = item.quantity * Number(item.unit_cost);
      const linePrice = item.quantity * Number(item.unit_price);
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
    return { internalCost, warranty, charged: totalFinal, margin, subtotalPecas, subtotalServicos, frete, desconto };
  }, [wo]);

  const handleProductSelect = async (product: any, itemType: string) => {
    const tax = (Number(product.ipi_percent || 0) + Number(product.icms_percent || 0) + Number(product.pis_percent || 0) + Number(product.cofins_percent || 0) + Number(product.csll_percent || 0) + Number(product.irpj_percent || 0)) / 100;
    const cost = Number(product.base_cost) * (1 + tax);
    const price = itemType.includes("garantia") ? 0 : cost * (1 + Number(product.margin_percent || 30) / 100);

    await addItem.mutateAsync({
      work_order_id: id!,
      product_id: product.id,
      item_type: itemType,
      quantity: 1,
      unit_cost: cost,
      unit_price: price,
    } as any);

    if (wo?.equipment_id) {
      await logTechnicalEvent({
        equipment_id: wo.equipment_id,
        event_type: "troca_peca",
        description: `${product.name} adicionada à OS ${wo.order_number}`,
        reference_type: "work_order",
        reference_id: id,
        performed_by: user?.id,
      });
    }
    toast.success(`${product.name} adicionado à OS`);
  };

  const handleQuantityChange = async (itemId: string, newQty: number) => {
    if (newQty < 1) return;
    await updateItem.mutateAsync({ id: itemId, quantity: newQty });
  };

  const handleDeleteItem = async (itemId: string) => {
    await supabase.from("work_order_items").delete().eq("id", itemId);
    qc.invalidateQueries({ queryKey: ["work_orders"] });
  };

  const handleComplete = async () => {
    await updateWo.mutateAsync({ id: id!, status: "concluida", completed_at: new Date().toISOString() } as any);
    if (wo?.equipment_id) {
      await logTechnicalEvent({
        equipment_id: wo.equipment_id,
        event_type: "os_concluida",
        description: `OS ${wo.order_number} concluída. Custo: R$ ${totals.internalCost.toFixed(2)}, Cobrado: R$ ${totals.charged.toFixed(2)}`,
        reference_type: "work_order",
        reference_id: id,
        performed_by: user?.id,
      });
    }
    if (wo?.ticket_id) {
      await supabase.from("tickets").update({ status: "resolvido", resolved_at: new Date().toISOString() }).eq("id", wo.ticket_id);
      qc.invalidateQueries({ queryKey: ["tickets"] });
    }
    toast.success("OS concluída com sucesso!");
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;
  if (!wo) return <div className="p-8 text-center text-muted-foreground">OS não encontrada.</div>;

  const modelName = wo.equipments?.equipment_models?.name || "";
  const equipModelId = (wo.equipments as any)?.model_id || undefined;
  const isEditable = wo.status !== "concluida" && wo.status !== "cancelada";

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => {
          if (fromTicketId) navigate(`/crm?open_ticket=${fromTicketId}`);
          else navigate("/ordens-servico");
        }}><ArrowLeft className="h-4 w-4 mr-1" /> {fromTicketId ? "Voltar ao Card" : "Voltar"}</Button>
        <div className="flex-1">
          <h1 className="font-display font-bold text-lg flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" /> {wo.order_number}
          </h1>
          <p className="text-xs text-muted-foreground">{wo.clients?.name} • {modelName} - {wo.equipments?.serial_number}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={statusLabels[wo.status] || wo.status} />
          {isEditable && (
            <select className="text-xs border rounded px-2 py-1 bg-background" value={wo.status} onChange={(e) => updateWo.mutateAsync({ id: id!, status: e.target.value } as any)}>
              {Object.entries(statusLabels).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Client & Equipment + OS Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-card rounded-xl border p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">Cliente & Equipamento</p>
          <p className="text-sm font-medium">{wo.clients?.name}</p>
          <p className="text-xs text-muted-foreground mt-1">{modelName} • S/N: {wo.equipments?.serial_number || "—"}</p>
        </div>
        <div className="bg-card rounded-xl border p-4 grid grid-cols-2 gap-2">
          {[
            { label: "Diagnóstico", value: wo.diagnosis },
            { label: "Causa", value: wo.cause },
            { label: "Solução", value: wo.solution },
            { label: "Tempo", value: wo.service_time_hours ? `${wo.service_time_hours}h` : null },
          ].map((c) => (
            <div key={c.label}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
              <p className="text-xs mt-0.5">{c.value || "—"}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Financial summary */}
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

      <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-6 flex items-center justify-between">
        <span className="text-sm font-semibold">Total Cobrado do Cliente</span>
        <span className="text-2xl font-bold font-mono text-primary">R$ {totals.charged.toFixed(2)}</span>
      </div>

      {/* Add items buttons */}
      {isEditable && (
        <div className="flex gap-2 mb-4">
          <Button size="sm" className="gap-1.5" variant={searchMode === "peca" ? "default" : "outline"} onClick={() => setSearchMode(searchMode === "peca" ? null : "peca")}>
            <Package className="h-3.5 w-3.5" /> Adicionar Peça
          </Button>
          <Button size="sm" className="gap-1.5" variant={searchMode === "servico" ? "default" : "outline"} onClick={() => setSearchMode(searchMode === "servico" ? null : "servico")}>
            <Wrench className="h-3.5 w-3.5" /> Adicionar Serviço
          </Button>
        </div>
      )}

      {isEditable && searchMode && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
          <ProductSearch
            modelFilter={modelName}
            onSelect={handleProductSelect}
            itemTypes={searchMode === "peca" ? partTypes : serviceTypes}
            productTypeFilter={searchMode === "peca" ? "peca" : "servico"}
          />
        </motion.div>
      )}

      {/* Suggested parts */}
      {isEditable && (
        <SuggestedParts modelId={equipModelId} modelName={modelName} onSelect={handleProductSelect} />
      )}

      {/* Items table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-sm overflow-hidden mb-6">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/50">
          <h3 className="font-display font-semibold text-sm">Itens e Peças ({wo.work_order_items?.length || 0})</h3>
        </div>
        {!wo.work_order_items?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Nenhum item adicionado. Use os botões acima.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  {["Código", "Produto", "Tipo", "Qtd", "Preço Unit.", "Subtotal", ""].map((h) => (
                    <th key={h} className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-3 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {wo.work_order_items.map((item: any) => {
                  const isWarranty = String(item.item_type).includes("garantia");
                  return (
                    <tr key={item.id} className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${isWarranty ? "bg-success/5" : ""}`}>
                      <td className="px-3 py-2.5 text-xs font-mono">{item.products?.code || "—"}</td>
                      <td className="px-3 py-2.5 text-xs">{item.products?.name || "—"}</td>
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
                      <td className="px-3 py-2.5 text-xs font-mono">{isWarranty ? <span className="text-success">Garantia</span> : `R$ ${Number(item.unit_price).toFixed(2)}`}</td>
                      <td className="px-3 py-2.5 text-xs font-mono font-medium">{isWarranty ? <span className="text-success">Coberto</span> : `R$ ${(item.quantity * Number(item.unit_price)).toFixed(2)}`}</td>
                      <td className="px-3 py-2.5">
                        {isEditable && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => handleDeleteItem(item.id)}>
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

      {/* Technical History */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border shadow-sm p-4 mb-6">
        <h3 className="font-display font-semibold text-sm mb-4">Histórico Técnico do Equipamento</h3>
        <TechnicalTimeline equipmentId={wo.equipment_id} />
      </motion.div>

      {/* Actions */}
      {isEditable && (
        <div className="flex gap-2 border-t pt-4">
          <div className="flex-1" />
          <Button onClick={handleComplete}>Concluir OS</Button>
        </div>
      )}
    </div>
  );
};

export default WorkOrderDetailPage;
