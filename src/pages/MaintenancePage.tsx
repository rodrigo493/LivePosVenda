import { CalendarClock, AlertTriangle, CheckCircle, Clock, Plus, ChevronDown, ChevronUp, Trash2, Settings2, FileText, Package, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEquipments, useEquipmentModels } from "@/hooks/useEquipments";
import { useClients } from "@/hooks/useClients";
import { useProducts } from "@/hooks/useProducts";
import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTemplateParts, useAddTemplatePart, useRemoveTemplatePart } from "@/hooks/useMaintenanceTemplateParts";
import { COMPACT_LIST_LIMIT } from "@/constants/limits";
import { generateMaintenancePdf } from "@/lib/generateMaintenancePdf";

function useMaintenancePlans() {
  return useQuery({
    queryKey: ["maintenance_plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_plans")
        .select("*, equipments(serial_number, equipment_models(name), clients(name, whatsapp))")
        .order("next_maintenance_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

function useModelTemplates() {
  return useQuery({
    queryKey: ["model_maintenance_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_maintenance_templates")
        .select("*, equipment_models(name)")
        .order("component");
      if (error) throw error;
      return data;
    },
  });
}

function useCreateMaintenancePlans() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plans: any[]) => {
      const { data, error } = await supabase.from("maintenance_plans").insert(plans).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance_plans"] }),
  });
}

function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: any) => {
      const { data, error } = await supabase.from("model_maintenance_templates").insert(t).select("*, equipment_models(name)").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["model_maintenance_templates"] }),
  });
}

function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; procedure_text?: string; recommendation?: string; interval_months?: number; component?: string }) => {
      const { error } = await supabase.from("model_maintenance_templates").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["model_maintenance_templates"] }),
  });
}

function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("model_maintenance_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["model_maintenance_templates"] }),
  });
}

interface MaintenanceItem {
  component: string;
  interval_months: number;
  recommendation: string;
}

const MaintenancePage = () => {
  const { data: plans, isLoading } = useMaintenancePlans();
  const { data: equipments } = useEquipments();
  const { data: clients } = useClients();
  const { data: models } = useEquipmentModels();
  const { data: templates } = useModelTemplates();
  const { data: products } = useProducts();
  const createPlans = useCreateMaintenancePlans();
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const addTemplatePart = useAddTemplatePart();
  const removeTemplatePart = useRemoveTemplatePart();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedEquipments, setSelectedEquipments] = useState<string[]>([]);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [maintenanceItems, setMaintenanceItems] = useState<MaintenanceItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Template form
  const [tplModelId, setTplModelId] = useState("");
  const [tplComponent, setTplComponent] = useState("");
  const [tplInterval, setTplInterval] = useState(6);
  const [tplRecommendation, setTplRecommendation] = useState("");
  const [tplProcedure, setTplProcedure] = useState("");

  // Template detail/edit
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editProcedure, setEditProcedure] = useState("");
  const [editRecommendation, setEditRecommendation] = useState("");
  const [editComponent, setEditComponent] = useState("");
  const [editInterval, setEditInterval] = useState(6);
  const [partSearch, setPartSearch] = useState("");
  const [partQuantity, setPartQuantity] = useState(1);

  const { data: templateParts } = useTemplateParts(editingTemplateId || undefined);

  const editingTemplate = useMemo(() => {
    if (!editingTemplateId || !templates) return null;
    return templates.find((t: any) => t.id === editingTemplateId);
  }, [editingTemplateId, templates]);

  const filteredProducts = useMemo(() => {
    if (!products || !partSearch || partSearch.length < 2) return [];
    const q = partSearch.toLowerCase();
    return products.filter((p: any) => 
      p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
    ).slice(0, COMPACT_LIST_LIMIT);
  }, [products, partSearch]);

  // Expanded equipment groups in listing
  const [expandedEquipments, setExpandedEquipments] = useState<Set<string>>(new Set());

  const today = new Date().toISOString().split("T")[0];

  // Filter equipments by selected client
  const filteredEquipments = useMemo(() => {
    if (!equipments || !selectedClient) return [];
    return equipments.filter((e: any) => e.client_id === selectedClient);
  }, [equipments, selectedClient]);

  // When equipments change, load templates for their models
  useEffect(() => {
    if (selectedEquipments.length === 0 || !templates || !equipments) {
      setMaintenanceItems([]);
      return;
    }
    const modelIds = new Set(
      selectedEquipments
        .map((eqId) => equipments.find((e: any) => e.id === eqId)?.model_id)
        .filter(Boolean)
    );
    const items: MaintenanceItem[] = [];
    const seen = new Set<string>();
    templates.forEach((t: any) => {
      if (modelIds.has(t.model_id) && !seen.has(t.component)) {
        seen.add(t.component);
        items.push({
          component: t.component,
          interval_months: t.interval_months,
          recommendation: t.recommendation || "",
        });
      }
    });
    setMaintenanceItems(items);
  }, [selectedEquipments, templates, equipments]);

  const addItem = () => {
    setMaintenanceItems((prev) => [...prev, { component: "", interval_months: 6, recommendation: "" }]);
  };

  const removeItem = (idx: number) => {
    setMaintenanceItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof MaintenanceItem, value: any) => {
    setMaintenanceItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  const calcNextDate = (deliveryDate: string, intervalMonths: number) => {
    const d = new Date(deliveryDate);
    d.setMonth(d.getMonth() + intervalMonths);
    return d.toISOString().split("T")[0];
  };

  const handleSubmit = async () => {
    if (!selectedClient || selectedEquipments.length === 0 || !deliveryDate || maintenanceItems.length === 0) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (maintenanceItems.some((i) => !i.component)) {
      toast.error("Preencha o nome de todos os componentes");
      return;
    }
    setSaving(true);
    try {
      const plansToCreate = selectedEquipments.flatMap((eqId) =>
        maintenanceItems.map((item) => ({
          equipment_id: eqId,
          client_id: selectedClient,
          component: item.component,
          interval_months: item.interval_months,
          recommendation: item.recommendation || null,
          delivery_date: deliveryDate,
          next_maintenance_date: calcNextDate(deliveryDate, item.interval_months),
        }))
      );
      await createPlans.mutateAsync(plansToCreate);
      toast.success(`${plansToCreate.length} planos criados com sucesso!`);
      setDialogOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Erro");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setSelectedClient("");
    setSelectedEquipments([]);
    setDeliveryDate("");
    setMaintenanceItems([]);
  };

  const handleSaveTemplate = async () => {
    if (!tplComponent) {
      toast.error("Preencha o componente");
      return;
    }
    try {
      const newTemplate = await createTemplate.mutateAsync({
        model_id: tplModelId || undefined,
        component: tplComponent,
        interval_months: tplInterval,
        recommendation: tplRecommendation || null,
        procedure_text: tplProcedure || null,
      });
      toast.success("Template salvo!");
      setTplComponent("");
      setTplInterval(6);
      setTplRecommendation("");
      setTplProcedure("");
      // Open the new template for editing parts
      setEditingTemplateId(newTemplate.id);
      setEditProcedure(newTemplate.procedure_text || "");
      setEditRecommendation(newTemplate.recommendation || "");
      setEditComponent(newTemplate.component || "");
      setEditInterval(newTemplate.interval_months || 6);
    } catch (err: any) {
      toast.error(err.message || "Erro");
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplateId) return;
    if (!editComponent) {
      toast.error("Preencha o componente");
      return;
    }
    try {
      await updateTemplate.mutateAsync({
        id: editingTemplateId,
        component: editComponent,
        interval_months: editInterval,
        procedure_text: editProcedure || undefined,
        recommendation: editRecommendation || undefined,
      });
      toast.success("Procedimento atualizado!");
    } catch (err: any) {
      toast.error(err.message || "Erro");
    }
  };

  const handleAddPart = async (productId: string) => {
    if (!editingTemplateId) return;
    try {
      await addTemplatePart.mutateAsync({
        template_id: editingTemplateId,
        product_id: productId,
        quantity: partQuantity,
      });
      setPartSearch("");
      setPartQuantity(1);
      toast.success("Peça adicionada!");
    } catch (err: any) {
      toast.error(err.message || "Erro");
    }
  };

  const handleGeneratePdf = (template: any, parts: any[]) => {
    const doc = generateMaintenancePdf({
      modelName: template.equipment_models?.name || "—",
      component: template.component,
      intervalMonths: template.interval_months,
      recommendation: template.recommendation || undefined,
      procedure: template.procedure_text || undefined,
      parts: parts.map((p: any) => ({
        code: p.products?.code || "—",
        name: p.products?.name || "—",
        quantity: p.quantity,
        notes: p.notes || undefined,
      })),
      company: { name: "Live Care" },
    });
    doc.save(`manutencao-${template.component.replace(/\s+/g, "-").toLowerCase()}.pdf`);
    toast.success("PDF gerado com sucesso!");
  };

  // Group plans by equipment for listing
  const groupedPlans = useMemo(() => {
    if (!plans) return [];
    const map = new Map<string, { equipment: any; plans: any[] }>();
    plans.forEach((p: any) => {
      const key = p.equipment_id;
      if (!map.has(key)) {
        map.set(key, { equipment: p.equipments, plans: [] });
      }
      map.get(key)!.plans.push(p);
    });
    return Array.from(map.values()).sort((a, b) => {
      const aOverdue = a.plans.some((p: any) => p.status === "ativo" && p.next_maintenance_date && p.next_maintenance_date < today);
      const bOverdue = b.plans.some((p: any) => p.status === "ativo" && p.next_maintenance_date && p.next_maintenance_date < today);
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      return 0;
    });
  }, [plans, today]);

  const { upcoming, overdue, completed } = useMemo(() => {
    if (!plans) return { upcoming: 0, overdue: 0, completed: 0 };
    const upcoming = plans.filter((p: any) => p.status === "ativo" && p.next_maintenance_date && p.next_maintenance_date >= today).length;
    const overdue = plans.filter((p: any) => p.status === "ativo" && p.next_maintenance_date && p.next_maintenance_date < today).length;
    const completed = plans.filter((p: any) => p.status !== "ativo").length;
    return { upcoming, overdue, completed };
  }, [plans, today]);

  const daysUntil = (date: string) => Math.ceil((new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

  const toggleEquipment = (eqId: string) => {
    setExpandedEquipments((prev) => {
      const next = new Set(prev);
      if (next.has(eqId)) next.delete(eqId);
      else next.add(eqId);
      return next;
    });
  };

  return (
    <div>
      <PageHeader
        title="Manutenção Preventiva"
        description="Planos de manutenção por aparelho e componente"
        icon={CalendarClock}
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setTemplateDialogOpen(true)}>
              <Settings2 className="h-3.5 w-3.5" /> Templates
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Novo Plano
            </Button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-5 flex items-center gap-4">
          <div className="p-2.5 rounded-lg bg-warning/10"><Clock className="h-5 w-5 text-warning" /></div>
          <div>
            <p className="text-2xl font-display font-bold">{upcoming}</p>
            <p className="text-xs text-muted-foreground">Manutenções próximas</p>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card rounded-xl border shadow-card p-5 flex items-center gap-4">
          <div className="p-2.5 rounded-lg bg-destructive/10"><AlertTriangle className="h-5 w-5 text-destructive" /></div>
          <div>
            <p className="text-2xl font-display font-bold">{overdue}</p>
            <p className="text-xs text-muted-foreground">Manutenções atrasadas</p>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border shadow-card p-5 flex items-center gap-4">
          <div className="p-2.5 rounded-lg bg-success/10"><CheckCircle className="h-5 w-5 text-success" /></div>
          <div>
            <p className="text-2xl font-display font-bold">{completed}</p>
            <p className="text-xs text-muted-foreground">Concluídas</p>
          </div>
        </motion.div>
      </div>

      {/* Equipment listing with maintenance items */}
      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
      ) : groupedPlans.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">
          <CalendarClock className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum plano de manutenção cadastrado.</p>
          <p className="text-xs mt-1">Clique em "Novo Plano" para começar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groupedPlans.map(({ equipment, plans: eqPlans }, idx) => {
            const eqId = eqPlans[0]?.equipment_id;
            const isOpen = expandedEquipments.has(eqId);
            const hasOverdue = eqPlans.some((p: any) => p.status === "ativo" && p.next_maintenance_date && p.next_maintenance_date < today);
            const nextDate = eqPlans
              .filter((p: any) => p.status === "ativo" && p.next_maintenance_date)
              .sort((a: any, b: any) => a.next_maintenance_date.localeCompare(b.next_maintenance_date))[0]?.next_maintenance_date;

            return (
              <motion.div
                key={eqId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className={`bg-card rounded-xl border shadow-card overflow-hidden ${hasOverdue ? "border-destructive/30" : ""}`}
              >
                <button
                  onClick={() => toggleEquipment(eqId)}
                  className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    {hasOverdue && <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
                    <div>
                      <p className="text-sm font-semibold">{equipment?.equipment_models?.name || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {equipment?.clients?.name || "—"} · SN: {equipment?.serial_number}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right mr-2">
                      <p className="text-xs text-muted-foreground">{eqPlans.length} itens</p>
                      {nextDate && (
                        <p className={`text-[10px] font-medium ${daysUntil(nextDate) < 0 ? "text-destructive" : daysUntil(nextDate) < 30 ? "text-warning" : "text-muted-foreground"}`}>
                          Próx: {new Date(nextDate).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                    </div>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t px-4 pb-4">
                    <div className="grid grid-cols-[1fr_100px_120px_100px] gap-2 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium border-b">
                      <span>Componente</span>
                      <span>Intervalo</span>
                      <span>Próxima Data</span>
                      <span>Status</span>
                    </div>
                    {eqPlans.map((plan: any) => {
                      const days = plan.next_maintenance_date ? daysUntil(plan.next_maintenance_date) : null;
                      const isOverdue = days !== null && days < 0;
                      const isNear = days !== null && days >= 0 && days <= 30;
                      return (
                        <div key={plan.id} className="grid grid-cols-[1fr_100px_120px_100px] gap-2 py-2.5 items-center text-sm border-b border-muted/50 last:border-0">
                          <div>
                            <p className="font-medium text-sm">{plan.component}</p>
                            {plan.recommendation && <p className="text-[11px] text-muted-foreground truncate">{plan.recommendation}</p>}
                          </div>
                          <span className="text-xs text-muted-foreground">{plan.interval_months} meses</span>
                          <span className="text-xs">
                            {plan.next_maintenance_date ? new Date(plan.next_maintenance_date).toLocaleDateString("pt-BR") : "—"}
                          </span>
                          <div>
                            {plan.status !== "ativo" ? (
                              <StatusBadge status="concluído" />
                            ) : isOverdue ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
                                {Math.abs(days!)}d atraso
                              </span>
                            ) : isNear ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warning bg-warning/10 px-2 py-0.5 rounded-full">
                                {days}d restantes
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success bg-success/10 px-2 py-0.5 rounded-full">
                                Em dia
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* New Plan Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="font-display">Novo Plano de Manutenção</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Client */}
            <div className="space-y-1.5">
              <Label className="text-xs">Cliente <span className="text-destructive">*</span></Label>
              <Select value={selectedClient} onValueChange={(v) => { setSelectedClient(v); setSelectedEquipments([]); }}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente..." /></SelectTrigger>
                <SelectContent>
                  {clients?.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Equipments multi-select */}
            {selectedClient && (
              <div className="space-y-1.5">
                <Label className="text-xs">Aparelhos <span className="text-destructive">*</span></Label>
                {filteredEquipments.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">Nenhum equipamento encontrado para este cliente.</p>
                ) : (
                  <div className="border rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                    {filteredEquipments.map((eq: any) => (
                      <label key={eq.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded p-1 transition-colors">
                        <Checkbox
                          checked={selectedEquipments.includes(eq.id)}
                          onCheckedChange={(checked) => {
                            setSelectedEquipments((prev) =>
                              checked ? [...prev, eq.id] : prev.filter((id) => id !== eq.id)
                            );
                          }}
                        />
                        <span className="text-sm">{eq.equipment_models?.name || "Equip."} — {eq.serial_number}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Delivery date */}
            <div className="space-y-1.5">
              <Label className="text-xs">Data da Entrega/Compra <span className="text-destructive">*</span></Label>
              <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </div>

            {/* Maintenance items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Itens de Manutenção <span className="text-destructive">*</span></Label>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addItem}>
                  <Plus className="h-3 w-3" /> Adicionar Item
                </Button>
              </div>
              {maintenanceItems.length === 0 && (
                <p className="text-xs text-muted-foreground py-3 text-center border rounded-lg">
                  {selectedEquipments.length > 0
                    ? "Nenhum template encontrado para os modelos selecionados. Adicione itens manualmente."
                    : "Selecione os aparelhos para carregar os itens de manutenção padrão."}
                </p>
              )}
              {maintenanceItems.map((item, idx) => (
                <div key={idx} className="border rounded-lg p-3 space-y-2 bg-muted/20">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <div className="grid grid-cols-[1fr_120px] gap-2">
                        <Select
                          value={item.component}
                          onValueChange={(v) => {
                            const tpl = templates?.find((t: any) => t.component === v);
                            updateItem(idx, "component", v);
                            if (tpl) {
                              updateItem(idx, "interval_months", tpl.interval_months);
                              updateItem(idx, "recommendation", tpl.recommendation || "");
                            }
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Selecione o componente..." /></SelectTrigger>
                          <SelectContent>
                            {(() => {
                              const seen = new Set<string>();
                              return templates?.filter((t: any) => {
                                if (seen.has(t.component)) return false;
                                seen.add(t.component);
                                return true;
                              }).map((t: any) => (
                                <SelectItem key={t.id} value={t.component}>{t.component}</SelectItem>
                              ));
                            })()}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={1}
                            value={item.interval_months}
                            onChange={(e) => updateItem(idx, "interval_months", Number(e.target.value))}
                            className="w-16"
                          />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">meses</span>
                        </div>
                      </div>
                      <Input
                        placeholder="Recomendação técnica (opcional)"
                        value={item.recommendation}
                        onChange={(e) => updateItem(idx, "recommendation", e.target.value)}
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0 mt-0.5" onClick={() => removeItem(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {deliveryDate && (
                    <p className="text-[10px] text-muted-foreground">
                      Próxima manutenção: {new Date(calcNextDate(deliveryDate, item.interval_months)).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? "Salvando..." : `Criar ${selectedEquipments.length > 0 && maintenanceItems.length > 0 ? `${selectedEquipments.length * maintenanceItems.length} planos` : "Planos"}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Templates / Gestão de Procedimentos Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={(o) => { setTemplateDialogOpen(o); if (!o) setEditingTemplateId(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingTemplateId ? "Editar Procedimento de Manutenção" : "Gestão de Procedimentos de Manutenção"}
            </DialogTitle>
          </DialogHeader>

          {!editingTemplateId ? (
            <>
              <p className="text-xs text-muted-foreground -mt-2">
                Defina procedimentos com peças, intervalos e instruções por modelo. Gere PDFs para técnicos e clientes.
              </p>

              {/* New template form */}
              <div className="space-y-3 mt-2 p-4 rounded-lg bg-muted/30 border">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Novo Procedimento</p>
                <div className="grid grid-cols-[1fr_100px] gap-2">
                  <Input placeholder="Componente (ex: Molas, Cabos...)" value={tplComponent} onChange={(e) => setTplComponent(e.target.value)} />
                  <div className="flex items-center gap-1">
                    <Input type="number" min={1} value={tplInterval} onChange={(e) => setTplInterval(Number(e.target.value))} className="w-16" />
                    <span className="text-xs text-muted-foreground">meses</span>
                  </div>
                </div>
                <Input placeholder="Recomendação técnica (opcional)" value={tplRecommendation} onChange={(e) => setTplRecommendation(e.target.value)} />
                <Textarea placeholder="Procedimento detalhado: passo a passo do que o técnico deve fazer..." value={tplProcedure} onChange={(e) => setTplProcedure(e.target.value)} rows={3} />
                <Button size="sm" onClick={handleSaveTemplate} disabled={createTemplate.isPending} className="w-full">
                  {createTemplate.isPending ? "Salvando..." : "Criar Procedimento"}
                </Button>
              </div>

              {/* Existing templates list */}
              {templates && templates.length > 0 && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Procedimentos Cadastrados</p>
                  {templates.map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-card border hover:shadow-sm transition-shadow">
                      <button
                        className="flex-1 text-left"
                        onClick={() => {
                          setEditingTemplateId(t.id);
                          setEditProcedure(t.procedure_text || "");
                          setEditRecommendation(t.recommendation || "");
                          setEditComponent(t.component || "");
                          setEditInterval(t.interval_months || 6);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{t.component}</p>
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{t.interval_months}m</span>
                          {t.procedure_text && <FileText className="h-3 w-3 text-primary" />}
                        </div>
                        <p className="text-[11px] text-muted-foreground">{t.equipment_models?.name}</p>
                        {t.recommendation && <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-md">{t.recommendation}</p>}
                      </button>
                      <div className="flex items-center gap-1 ml-2">
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          onClick={() => {
                            setEditingTemplateId(t.id);
                            setEditProcedure(t.procedure_text || "");
                            setEditRecommendation(t.recommendation || "");
                            setEditComponent(t.component || "");
                            setEditInterval(t.interval_months || 6);
                          }}
                        >
                          <Settings2 className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteTemplate.mutate(t.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Template detail editing */
            <TemplateDetail
              template={editingTemplate}
              parts={templateParts || []}
              editProcedure={editProcedure}
              setEditProcedure={setEditProcedure}
              editRecommendation={editRecommendation}
              setEditRecommendation={setEditRecommendation}
              editComponent={editComponent}
              setEditComponent={setEditComponent}
              editInterval={editInterval}
              setEditInterval={setEditInterval}
              partSearch={partSearch}
              setPartSearch={setPartSearch}
              partQuantity={partQuantity}
              setPartQuantity={setPartQuantity}
              filteredProducts={filteredProducts}
              onSave={handleUpdateTemplate}
              onAddPart={handleAddPart}
              onRemovePart={(id: string) => removeTemplatePart.mutate({ id, templateId: editingTemplateId! })}
              onGeneratePdf={() => handleGeneratePdf(editingTemplate, templateParts || [])}
              onBack={() => setEditingTemplateId(null)}
              saving={updateTemplate.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* Sub-component for template detail editing with parts and procedure */
function TemplateDetail({
  template, parts, editProcedure, setEditProcedure, editRecommendation, setEditRecommendation,
  editComponent, setEditComponent, editInterval, setEditInterval,
  partSearch, setPartSearch, partQuantity, setPartQuantity, filteredProducts,
  onSave, onAddPart, onRemovePart, onGeneratePdf, onBack, saving,
}: {
  template: any; parts: any[]; editProcedure: string; setEditProcedure: (v: string) => void;
  editRecommendation: string; setEditRecommendation: (v: string) => void;
  editComponent: string; setEditComponent: (v: string) => void;
  editInterval: number; setEditInterval: (v: number) => void;
  partSearch: string; setPartSearch: (v: string) => void;
  partQuantity: number; setPartQuantity: (v: number) => void;
  filteredProducts: any[]; onSave: () => void; onAddPart: (productId: string) => void;
  onRemovePart: (id: string) => void; onGeneratePdf: () => void; onBack: () => void; saving: boolean;
}) {
  if (!template) return null;

  return (
    <div className="space-y-4 -mt-1">
      <button onClick={onBack} className="text-xs text-primary hover:underline flex items-center gap-1">
        ← Voltar para lista
      </button>

      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">{template.equipment_models?.name}</p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={onGeneratePdf}>
          <FileText className="h-3.5 w-3.5" /> Gerar PDF
        </Button>
      </div>

      {/* Component & Interval */}
      <div className="grid grid-cols-[1fr_120px] gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Componente <span className="text-destructive">*</span></Label>
          <Input value={editComponent} onChange={(e) => setEditComponent(e.target.value)} placeholder="Ex: Molas, Cabos..." />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Intervalo</Label>
          <div className="flex items-center gap-1">
            <Input type="number" min={1} value={editInterval} onChange={(e) => setEditInterval(Number(e.target.value))} className="w-16" />
            <span className="text-xs text-muted-foreground">meses</span>
          </div>
        </div>
      </div>

      {/* Recommendation */}
      <div className="space-y-1.5">
        <Label className="text-xs">Recomendação Técnica</Label>
        <Input value={editRecommendation} onChange={(e) => setEditRecommendation(e.target.value)} placeholder="Recomendação para o técnico..." />
      </div>

      {/* Procedure */}
      <div className="space-y-1.5">
        <Label className="text-xs">Procedimento Detalhado</Label>
        <Textarea
          value={editProcedure}
          onChange={(e) => setEditProcedure(e.target.value)}
          placeholder={"1. Desligar o equipamento\n2. Remover a tampa lateral\n3. Verificar o estado das molas\n4. Substituir se necessário\n5. Remontar e testar"}
          rows={6}
        />
      </div>

      <Button size="sm" onClick={onSave} disabled={saving} className="w-full">
        {saving ? "Salvando..." : "Salvar Alterações"}
      </Button>

      {/* Parts management */}
      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" /> Peças Necessárias
          </Label>
          <span className="text-[10px] text-muted-foreground">{parts.length} peça(s)</span>
        </div>

        {/* Add part search */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar peça por nome ou código..."
                value={partSearch}
                onChange={(e) => setPartSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Input
              type="number"
              min={1}
              value={partQuantity}
              onChange={(e) => setPartQuantity(Number(e.target.value))}
              className="w-16"
              placeholder="Qtd"
            />
          </div>
          {filteredProducts.length > 0 && (
            <div className="border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
              {filteredProducts.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => onAddPart(p.id)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/50 transition-colors text-sm border-b last:border-0"
                >
                  <div>
                    <span className="font-medium text-xs">{p.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">{p.code}</span>
                  </div>
                  <Plus className="h-3.5 w-3.5 text-primary" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Parts list */}
        {parts.length > 0 ? (
          <div className="space-y-1.5">
            {parts.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">{p.products?.code}</span>
                  <span className="text-xs font-medium">{p.products?.name}</span>
                  <span className="text-[10px] text-muted-foreground">×{p.quantity}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => onRemovePart(p.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-3 border rounded-lg">
            Nenhuma peça adicionada. Busque acima para vincular peças.
          </p>
        )}
      </div>
    </div>
  );
}

export default MaintenancePage;
