import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock, User, Tag, FileText, MessageSquare, Calendar, Package,
  AlertTriangle, Send, Pencil, Check, X, Wrench, Shield, ClipboardList,
  ExternalLink, Receipt, Settings2, ArrowLeft, Cpu, Plus, ChevronDown, History, CheckSquare,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WhatsAppChat } from "@/components/whatsapp/WhatsAppChat";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ApprovalActionDialog } from "@/components/shared/ApprovalActionDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { TechnicalTimeline } from "@/components/tickets/TechnicalTimeline";
import { SuggestedParts } from "@/components/products/SuggestedParts";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { notifySquad } from "@/lib/squadNotify";
import { toast } from "sonner";
import { PIPELINE_STAGES, useMovePipelineStage } from "@/hooks/usePipeline";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate as fmtDate, formatCurrency as fmtCurrency } from "@/lib/formatters";
import { ACTIVITY_LOG_LIMIT } from "@/constants/limits";

interface Props {
  ticket: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Data Hooks (ticket-level) ─────────────────────────────────

function useTicketTasks(ticketId: string | undefined) {
  return useQuery({
    queryKey: ["ticket-tasks", ticketId], enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("ticket_id", ticketId!).order("created_at", { ascending: false });
      if (error) throw error; return data;
    },
  });
}

function useTicketActivities(ticketId: string | undefined) {
  return useQuery({
    queryKey: ["ticket-activities", ticketId], enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase.from("activity_logs").select("*").eq("entity_id", ticketId!).eq("entity_type", "ticket").order("created_at", { ascending: false }).limit(ACTIVITY_LOG_LIMIT);
      if (error) throw error; return data;
    },
  });
}

function useTicketQuotes(ticketId: string | undefined) {
  return useQuery({
    queryKey: ["ticket-quotes", ticketId], enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("*, service_requests(id, request_number), warranty_claims(id, claim_number)").eq("ticket_id", ticketId!).order("created_at", { ascending: false });
      if (error) throw error; return data;
    },
  });
}

function useTicketWorkOrders(ticketId: string | undefined) {
  return useQuery({
    queryKey: ["ticket-work-orders", ticketId], enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase.from("work_orders").select("*").eq("ticket_id", ticketId!).order("created_at", { ascending: false });
      if (error) throw error; return data;
    },
  });
}

function useTicketServiceRequests(ticketId: string | undefined) {
  return useQuery({
    queryKey: ["ticket-service-requests", ticketId], enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase.from("service_requests").select("*").eq("ticket_id", ticketId!).order("created_at", { ascending: false });
      if (error) throw error; return data;
    },
  });
}

function useTicketWarrantyClaims(ticketId: string | undefined) {
  return useQuery({
    queryKey: ["ticket-warranty-claims", ticketId], enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase.from("warranty_claims").select("*").eq("ticket_id", ticketId!).order("created_at", { ascending: false });
      if (error) throw error; return data;
    },
  });
}

// ─── Data Hooks (client-level) ─────────────────────────────────

function useClientProfile(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client-profile", clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", clientId!).single();
      if (error) throw error; return data;
    },
  });
}

function useClientEquipments(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client-equipments", clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.from("equipments").select("*, equipment_models(name)").eq("client_id", clientId!).order("created_at", { ascending: false });
      if (error) throw error; return data;
    },
  });
}

function useClientTickets(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client-tickets", clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tickets").select("*, equipments(serial_number, equipment_models(name))").eq("client_id", clientId!).order("created_at", { ascending: false });
      if (error) throw error; return data;
    },
  });
}

function useClientQuotes(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client-quotes", clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("*, service_requests(id, request_number), warranty_claims(id, claim_number), quote_items(quantity, unit_price)").eq("client_id", clientId!).order("created_at", { ascending: false });
      if (error) throw error; return data;
    },
  });
}

function useClientWorkOrders(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client-work-orders", clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.from("work_orders").select("*").eq("client_id", clientId!).order("created_at", { ascending: false });
      if (error) throw error; return data;
    },
  });
}

function useClientWarrantyClaims(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client-warranty-claims", clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.from("warranty_claims").select("*, tickets(ticket_number, title)").in(
        "ticket_id",
        (await supabase.from("tickets").select("id").eq("client_id", clientId!)).data?.map((t: any) => t.id) || []
      ).order("created_at", { ascending: false });
      if (error) throw error; return data;
    },
  });
}

function useClientServiceRequests(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client-service-requests", clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.from("service_requests").select("*, tickets(ticket_number, title)").in(
        "ticket_id",
        (await supabase.from("tickets").select("id").eq("client_id", clientId!)).data?.map((t: any) => t.id) || []
      ).order("created_at", { ascending: false });
      if (error) throw error; return data;
    },
  });
}

function useClientServiceHistory(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client_service_history", clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("client_service_history").select("*").eq("client_id", clientId!).order("service_date", { ascending: false });
      if (error) throw error; return data as any[];
    },
  });
}

function useClientTasks(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client-tasks", clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("client_id", clientId!).order("created_at", { ascending: false });
      if (error) throw error; return data;
    },
  });
}

// ─── Utilities ─────────────────────────────────────────────────

function daysSince(dateStr: string | null) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function parseProblemAndSolution(description: string | null, internalNotes: string | null) {
  const problemLines: string[] = [];
  const solutionLines: string[] = [];
  const solutionKeys = ["solução", "solucao", "resolução", "resolucao"];
  if (description) {
    for (const line of description.split("\n")) {
      const lower = line.toLowerCase().trim();
      if (solutionKeys.some((k) => lower.startsWith(k + ":") || lower.startsWith(k + " "))) {
        solutionLines.push(line.trim());
      } else if (lower) {
        problemLines.push(line.trim());
      }
    }
  }
  if (internalNotes) solutionLines.push(internalNotes.trim());
  return { problem: problemLines.join("\n") || "", solution: solutionLines.join("\n") || "" };
}

// ─── Editable Field ────────────────────────────────────────────

interface EditableFieldProps {
  value: string;
  onSave: (value: string) => void;
  saving: boolean;
  placeholder: string;
  icon: React.ReactNode;
  label: string;
  borderClass: string;
  bgClass: string;
  labelClass: string;
}

function EditableField({ value, onSave, saving, placeholder, icon, label, borderClass, bgClass, labelClass }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const handleSave = () => { onSave(draft.trim()); setEditing(false); };
  const handleCancel = () => { setDraft(value); setEditing(false); };

  return (
    <div className={`rounded-lg border ${borderClass} ${bgClass} p-4`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <p className={`text-sm font-bold uppercase tracking-wide ${labelClass}`}>{label}</p>
        </div>
        {!editing && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} rows={4} className="text-sm bg-background" autoFocus />
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleCancel} disabled={saving}><X className="h-3.5 w-3.5 mr-1" /> Cancelar</Button>
            <Button size="sm" className="h-7 px-3" onClick={handleSave} disabled={saving}><Check className="h-3.5 w-3.5 mr-1" /> {saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap">{value || <span className="text-muted-foreground italic">Clique no lápis para preencher</span>}</p>
      )}
    </div>
  );
}

// ─── Main Dialog ───────────────────────────────────────────────

export function TicketDetailDialog({ ticket, open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketInternalNotes, setTicketInternalNotes] = useState("");
  const [ticketType, setTicketType] = useState(ticket?.ticket_type || "");
  const [newNote, setNewNote] = useState("");
  const [activeTab, setActiveTab] = useState("info");
  const [newEquipmentOpen, setNewEquipmentOpen] = useState(false);
  const [histDevice, setHistDevice] = useState("");
  const [histProblem, setHistProblem] = useState("");
  const [histSolution, setHistSolution] = useState("");
  const [stagePopoverOpen, setStagePopoverOpen] = useState(false);
  const [selectedQuotes, setSelectedQuotes] = useState<Set<string>>(new Set());
  const [selectedPA, setSelectedPA] = useState<Set<string>>(new Set());
  const [selectedPG, setSelectedPG] = useState<Set<string>>(new Set());
  const [approvalQuote, setApprovalQuote] = useState<{ id: string; quote_number: string; ticket_id: string | null; client_id: string | null; equipment_id: string | null } | null>(null);

  const toggleSel = (set: Set<string>, setFn: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setFn(next);
  };
  const toggleAll = (ids: string[], set: Set<string>, setFn: (s: Set<string>) => void) => {
    setFn(set.size === ids.length ? new Set() : new Set(ids));
  };
  const moveStage = useMovePipelineStage();
  const ticketId = ticket?.id;
  const equipmentId = ticket?.equipment_id;
  const clientId = ticket?.client_id;

  const enabledId = open && ticketId ? ticketId : undefined;
  const enabledClientId = open && clientId ? clientId : undefined;

  // Ticket-level data
  const { data: ticketTasks } = useTicketTasks(enabledId);
  const { data: activities } = useTicketActivities(enabledId);
  const { data: ticketQuotes } = useTicketQuotes(enabledId);
  const { data: ticketWorkOrders } = useTicketWorkOrders(enabledId);
  const { data: ticketServiceRequests } = useTicketServiceRequests(enabledId);
  const { data: ticketWarrantyClaims } = useTicketWarrantyClaims(enabledId);

  // Client-level data
  const { data: clientProfile } = useClientProfile(enabledClientId);
  const { data: clientEquipments } = useClientEquipments(enabledClientId);
  const { data: clientTickets } = useClientTickets(enabledClientId);
  const { data: clientQuotes } = useClientQuotes(enabledClientId);
  const { data: clientWorkOrders } = useClientWorkOrders(enabledClientId);
  const { data: clientWarrantyClaims } = useClientWarrantyClaims(enabledClientId);
  const { data: clientServiceRequests } = useClientServiceRequests(enabledClientId);
  const { data: clientTasks } = useClientTasks(enabledClientId);
  const { data: clientHistory } = useClientServiceHistory(enabledClientId);
  const { data: equipmentModels } = useQuery({
    queryKey: ["equipment_models_for_ticket_dialog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipment_models").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Reset tab when dialog opens
  useEffect(() => { if (open) setActiveTab("info"); }, [open]);
  useEffect(() => {
    if (!open || !ticket) return;
    setTicketDescription(ticket.description || "");
    setTicketInternalNotes(ticket.internal_notes || "");
    setTicketType(ticket.ticket_type || "");
  }, [open, ticket?.id, ticket?.description, ticket?.internal_notes, ticket?.ticket_type]);

  const addHistoryEntry = useMutation({
    mutationFn: async (description: string) => {
      if (!clientId) throw new Error("Sem cliente vinculado");

      const now = new Date().toISOString();
      const deviceLabel = ticket.equipments?.equipment_models?.name
        ? `${ticket.equipments.equipment_models.name}${ticket.equipments?.serial_number ? ` - ${ticket.equipments.serial_number}` : ""}`
        : ticket.equipments?.serial_number || null;

      const { error: clientHistoryError } = await supabase.from("client_service_history").insert({
        client_id: clientId,
        service_date: now,
        device: null,
        problem_reported: null,
        solution_provided: null,
        history_notes: description,
        service_status: "em_andamento",
        created_by: user?.id,
      } as any);
      if (clientHistoryError) throw clientHistoryError;

      if (equipmentId) {
        const { error: technicalHistoryError } = await supabase.from("technical_history").insert({
          equipment_id: equipmentId,
          event_type: "nota_manual",
          description,
          reference_type: "ticket",
          reference_id: ticketId,
          performed_by: user?.id,
        });
        if (technicalHistoryError) throw technicalHistoryError;
      }

      const { error: ticketError } = await supabase.from("tickets").update({
        last_interaction_at: now,
        updated_at: now,
      }).eq("id", ticketId!);
      if (ticketError) throw ticketError;
    },
    onSuccess: () => {
      if (equipmentId) qc.invalidateQueries({ queryKey: ["technical_history", equipmentId] });
      qc.invalidateQueries({ queryKey: ["client_service_history", clientId] });
      qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
      setNewNote("");
      setActiveTab("info");
      toast.success("Registro salvo no histórico do cliente");
    },
  });

  const updateTicketField = useMutation({
    mutationFn: async ({ field, value }: { field: "description" | "internal_notes" | "ticket_type"; value: string }) => {
      const { error } = await supabase.from("tickets").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", ticketId!);
      if (error) throw error;

      // Sync to client_service_history
      if (clientId && ticketId) {
        const deviceLabel = ticket.equipments?.equipment_models?.name
          ? `${ticket.equipments.equipment_models.name}${ticket.equipments?.serial_number ? ` - ${ticket.equipments.serial_number}` : ""}`
          : ticket.equipments?.serial_number || null;

        const historyUpdate: Record<string, any> = {};
        if (field === "description") historyUpdate.problem_reported = value;
        if (field === "internal_notes") historyUpdate.solution_provided = value;
        if (deviceLabel) historyUpdate.device = deviceLabel;

        // Find existing history record for this ticket (match by ticket number in history_notes)
        const ticketMarker = `[ticket:${ticketId}]`;
        const { data: existing } = await (supabase as any)
          .from("client_service_history")
          .select("id")
          .eq("client_id", clientId)
          .ilike("history_notes", `%${ticketMarker}%`)
          .limit(1);

        if (existing && existing.length > 0) {
          await (supabase as any).from("client_service_history").update(historyUpdate).eq("id", existing[0].id);
        } else {
          await (supabase as any).from("client_service_history").insert({
            client_id: clientId,
            service_date: new Date().toISOString(),
            device: deviceLabel,
            problem_reported: field === "description" ? value : null,
            solution_provided: field === "internal_notes" ? value : null,
            history_notes: ticketMarker,
            service_status: "em_andamento",
            created_by: user?.id,
          });
        }
      }

      return { field, value };
    },
    onSuccess: ({ field, value }) => {
      if (field === "description") setTicketDescription(value);
      if (field === "internal_notes") setTicketInternalNotes(value);
      if (field === "ticket_type") setTicketType(value);
      qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
      qc.invalidateQueries({ queryKey: ["client-tickets", clientId] });
      qc.invalidateQueries({ queryKey: ["client_service_history", clientId] });
      toast.success("Ticket atualizado");
    },
    onError: () => toast.error("Erro ao salvar"),
  });

  // ─── Inline creation mutations ────────────────────────────────

  const createQuote = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("quotes").insert({
        client_id: clientId!, equipment_id: equipmentId || null, ticket_id: ticketId || null, created_by: user?.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["client-quotes"] });
      toast.success(`Orçamento ${data.quote_number} criado`);
      onOpenChange(false);
      setTimeout(() => navigate(`/orcamentos/${data.id}?from_ticket=${ticketId}`), 150);
    },
    onError: () => toast.error("Erro ao criar orçamento"),
  });

  const createWorkOrder = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("work_orders").insert({
        client_id: clientId!, equipment_id: equipmentId!, ticket_id: ticketId || null,
        order_number: "", created_by: user?.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["client-work-orders"] });
      toast.success(`OS ${data.order_number} criada`);
      onOpenChange(false);
      setTimeout(() => navigate(`/ordens-servico/${data.id}?from_ticket=${ticketId}`), 150);
    },
    onError: () => toast.error("Erro ao criar OS"),
  });

  const createWarrantyClaim = useMutation({
    mutationFn: async () => {
      const { data: pgNumData } = await supabase.rpc("generate_pg_number");
      const claimNumber = pgNumData || `PG-${Date.now()}`;
      const { data: pg, error: pgErr } = await supabase.from("warranty_claims").insert({
        ticket_id: ticketId!,
        claim_number: claimNumber,
      }).select().single();
      if (pgErr) throw pgErr;
      // Cria quote vazio vinculado para habilitar edicao de itens/valores
      const { error: quoteErr } = await supabase.from("quotes").insert({
        client_id: clientId!,
        equipment_id: equipmentId || null,
        ticket_id: ticketId || null,
        warranty_claim_id: pg.id,
        created_by: user?.id,
      });
      if (quoteErr) {
        console.error("[createWarrantyClaim] quote insert error:", quoteErr);
        toast.warning(`PG criado, mas falha ao criar orcamento: ${quoteErr.message}`);
      }
      return pg;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["client-warranty-claims"] });
      toast.success(`PG ${data.claim_number} criado`);
      void notifySquad({ recordType: "pg", recordId: data.id, reference: data.claim_number });
      onOpenChange(false);
      setTimeout(() => navigate(`/pedidos-garantia/${data.id}?from_ticket=${ticketId}`), 150);
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao criar PG"),
  });

  const createServiceRequest = useMutation({
    mutationFn: async () => {
      const { data: paNumData } = await supabase.rpc("generate_pa_number");
      const requestNumber = paNumData || `PA-${Date.now()}`;
      const { data: pa, error: paErr } = await supabase.from("service_requests").insert({
        ticket_id: ticketId!,
        request_number: requestNumber,
        request_type: "troca_peca" as any,
      }).select().single();
      if (paErr) throw paErr;
      // Cria quote vazio vinculado para habilitar edicao de itens/valores
      // na pagina do PA (botoes Adicionar Peca/Servico).
      const { error: quoteErr } = await supabase.from("quotes").insert({
        client_id: clientId!,
        equipment_id: equipmentId || null,
        ticket_id: ticketId || null,
        service_request_id: pa.id,
        created_by: user?.id,
      });
      if (quoteErr) {
        console.error("[createServiceRequest] quote insert error:", quoteErr);
        toast.warning(`PA criado, mas falha ao criar orcamento: ${quoteErr.message}`);
      }
      return pa;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["client-service-requests"] });
      toast.success(`PA ${data.request_number} criado`);
      // Notifica SquadOS (fire-and-forget)
      void notifySquad({ recordType: "pa", recordId: data.id, reference: data.request_number });
      // Abre a pagina completa do PA recem-criado
      onOpenChange(false);
      setTimeout(() => navigate(`/pedidos-acessorios/${data.id}?from_ticket=${ticketId}`), 150);
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao criar PA"),
  });

  const createTask = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("tasks").insert({
        client_id: clientId!, ticket_id: ticketId || null, title: `Tarefa - ${ticket?.clients?.name || ""}`,
        assigned_to: user?.id!, created_by: user?.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-tasks"] });
      toast.success("Tarefa criada com sucesso");
    },
    onError: () => toast.error("Erro ao criar tarefa"),
  });

  const createEquipment = useMutation({
    mutationFn: async ({ model_id, serial_number, batch_number }: { model_id: string; serial_number?: string; batch_number?: string }) => {
      const { data, error } = await supabase
        .from("equipments")
        .insert({ model_id, client_id: clientId, serial_number: serial_number || "", batch_number: batch_number || null })
        .select("*, equipment_models(name)")
        .single();
      if (error) throw error;

      if (ticketId) {
        const { error: ticketError } = await supabase
          .from("tickets")
          .update({ equipment_id: data.id, updated_at: new Date().toISOString() })
          .eq("id", ticketId);
        if (ticketError) throw ticketError;
      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-equipments", clientId] });
      qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
      qc.invalidateQueries({ queryKey: ["equipments"] });
      setNewEquipmentOpen(false);
      toast.success("Equipamento registrado");
    },
    onError: () => toast.error("Erro ao criar equipamento"),
  });

  const createTicket = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("tickets").insert({
        client_id: clientId!, equipment_id: equipmentId!, title: "Novo chamado",
        ticket_type: "chamado_tecnico" as any, ticket_number: "", created_by: user?.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-tickets"] });
      toast.success("Chamado criado com sucesso");
    },
    onError: () => toast.error("Erro ao criar chamado"),
  });

  if (!ticket) return null;

  const days = daysSince(ticket.last_interaction_at);
  const { problem, solution } = parseProblemAndSolution(ticketDescription, ticketInternalNotes);

  const handleAddNote = () => { if (!newNote.trim()) return; addHistoryEntry.mutate(newNote.trim()); };

  const handleSaveProblem = (value: string) => {
    setTicketDescription(value);
    updateTicketField.mutate({ field: "description", value });
  };

  const handleSaveSolution = (value: string) => {
    setTicketInternalNotes(value);
    updateTicketField.mutate({ field: "internal_notes", value });
  };

  // Check if we're in a sub-tab (client-level view)
  const isSubView = activeTab.startsWith("client-");
  const goBackToCard = () => setActiveTab("info");
  const goTo = (path: string) => { onOpenChange(false); setTimeout(() => navigate(path), 150); };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1400px] h-[95vh] overflow-hidden flex flex-col p-0">
        {/* ── Header ───────────────────────────────────────── */}
        <DialogHeader className="p-5 pb-0 shrink-0">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                {isSubView && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 mr-1" onClick={goBackToCard}>
                    <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar
                  </Button>
                )}
                <Badge variant="outline" className="text-[10px] font-mono">{ticket.ticket_number}</Badge>
                <StatusBadge status={ticket.priority} />
                <StatusBadge status={ticket.status} />
                <button
                  onClick={() => setActiveTab("whatsapp")}
                  className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-white text-[11px] font-semibold transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "#25D366" }}
                  title="Abrir conversa WhatsApp"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-white" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp
                </button>
                {ticket.pipeline_stage && (
                  <Popover open={stagePopoverOpen} onOpenChange={setStagePopoverOpen}>
                    <PopoverTrigger asChild>
                      <button className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium bg-muted hover:bg-muted/80 transition-colors cursor-pointer">
                        <span
                          className="h-2 w-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: PIPELINE_STAGES.find((s) => s.key === ticket.pipeline_stage)?.color || "hsl(var(--muted-foreground))" }}
                        />
                        {PIPELINE_STAGES.find((s) => s.key === ticket.pipeline_stage)?.label || ticket.pipeline_stage}
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-48 p-1">
                      <p className="text-[10px] text-muted-foreground px-2 py-1 font-semibold uppercase tracking-wider">Mover para</p>
                      {PIPELINE_STAGES.map((stage) => (
                        <button
                          key={stage.key}
                          onClick={() => {
                            moveStage.mutate({ id: ticket.id, stage: stage.key });
                            setStagePopoverOpen(false);
                            toast.success(`Movido para: ${stage.label}`);
                          }}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors text-left ${
                            ticket.pipeline_stage === stage.key ? "bg-muted font-semibold" : ""
                          }`}
                        >
                          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                          {stage.label}
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              <DialogTitle className="text-lg">{ticket.title}</DialogTitle>
              <DialogDescription className="flex items-center gap-4 text-sm">
                <span className="font-medium">{ticket.clients?.name || "—"}</span>
                {ticket.equipments && (
                  <span className="text-xs text-muted-foreground">{ticket.equipments.equipment_models?.name} — {ticket.equipments.serial_number}</span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* ── Tabs ─────────────────────────────────────────── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="px-5 pt-3 shrink-0 border-b">
            <TabsList className="w-full justify-start bg-transparent h-auto p-0 gap-0 flex-wrap">
              {/* Ticket-level tabs */}
              <TabsTrigger value="info" className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-3 pb-2">
                Detalhes
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-3 pb-2">
                Histórico Técnico
              </TabsTrigger>

              {/* Separator */}
              <div className="h-5 w-px bg-border mx-2 self-center" />

              {/* Client-level tabs */}
              <TabsTrigger value="client-equipments" className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-3 pb-2 gap-1">
                <Cpu className="h-3 w-3" /> Equipamentos ({clientEquipments?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="client-tickets" className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-3 pb-2 gap-1">
                <ClipboardList className="h-3 w-3" /> Chamados ({clientTickets?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="client-quotes" className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-3 pb-2 gap-1">
                <Receipt className="h-3 w-3" /> Orçamentos ({clientQuotes?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="client-workorders" className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-3 pb-2 gap-1">
                <Wrench className="h-3 w-3" /> Ordens de Serviço ({clientWorkOrders?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="client-warranties" className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-3 pb-2 gap-1">
                <Shield className="h-3 w-3" /> Ped. Garantia ({clientWarrantyClaims?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="client-services" className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-3 pb-2 gap-1">
                <Package className="h-3 w-3" /> Ped. Acessórios ({clientServiceRequests?.length || 0})
              </TabsTrigger>
               <TabsTrigger value="client-tasks" className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-3 pb-2 gap-1">
                <Tag className="h-3 w-3" /> Tarefas ({clientTasks?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="client-history" className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-3 pb-2 gap-1">
                <History className="h-3 w-3" /> Histórico ({clientHistory?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="activity" className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-3 pb-2">
                Atividades
              </TabsTrigger>

              <div className="h-5 w-px bg-border mx-2 self-center" />

              <TabsTrigger value="whatsapp" className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:shadow-none px-3 pb-2 gap-1 data-[state=active]:text-emerald-600">
                <MessageSquare className="h-3 w-3" /> WhatsApp
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden min-h-0">
            <ScrollArea className="h-full">
              <div className="px-6 pb-8 pt-4">

                {/* ── Tab: Detalhes (Client Dashboard) ──── */}
                <TabsContent value="info" className="mt-0 space-y-5">
                  {/* Ticket info */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <InfoRow icon={User} label="Cliente" value={ticket.clients?.name} />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Tag className="h-3.5 w-3.5" />
                        <span className="text-[11px]">Tipo</span>
                      </div>
                      <select
                        className="text-sm font-medium bg-transparent border border-input rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
                        value={ticketType}
                        onChange={(e) => { setTicketType(e.target.value); updateTicketField.mutate({ field: "ticket_type" as any, value: e.target.value }); }}
                      >
                        <option value="chamado_tecnico">Chamado Técnico</option>
                        <option value="garantia">Garantia</option>
                        <option value="assistencia">Assistência</option>
                        <option value="pos_venda">Pós Venda</option>
                        <option value="comprar_acessorios">Comprar Acessórios</option>
                      </select>
                    </div>
                    <InfoRow icon={Clock} label="Último contato" value={
                      ticket.last_interaction_at
                        ? `${fmtDate(ticket.last_interaction_at)} (${days}d atrás)` : "—"
                    } />
                    <InfoRow icon={Calendar} label="Criado em" value={fmtDate(ticket.created_at)} />
                    {ticket.equipments && (
                      <InfoRow icon={Package} label="Equipamento" value={
                        `${ticket.equipments.equipment_models?.name || ""} - ${ticket.equipments.serial_number}`
                      } />
                    )}
                    {ticket.estimated_value > 0 && (
                      <InfoRow icon={FileText} label="Valor estimado" value={fmtCurrency(ticket.estimated_value)} />
                    )}
                    {ticket.channel && <InfoRow icon={MessageSquare} label="Canal" value={ticket.channel} />}
                    {ticket.origin && <InfoRow icon={Settings2} label="Origem" value={ticket.origin} />}
                  </div>

                  {/* Client profile info */}
                  {clientProfile && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Dados do Cliente</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <InfoRow icon={User} label="Código" value={clientProfile.client_code} />
                          <InfoRow icon={FileText} label="Documento" value={clientProfile.document ? `${clientProfile.document_type?.toUpperCase()}: ${clientProfile.document}` : null} />
                          <InfoRow icon={MessageSquare} label="Telefone" value={clientProfile.phone} />
                          <InfoRow icon={MessageSquare} label="WhatsApp" value={clientProfile.whatsapp} />
                          <InfoRow icon={FileText} label="Email" value={clientProfile.email} />
                          <InfoRow icon={User} label="Contato" value={clientProfile.contact_person} />
                          <InfoRow icon={Package} label="Cidade" value={clientProfile.city ? `${clientProfile.city}${clientProfile.state ? ` - ${clientProfile.state}` : ""}` : null} />
                          <InfoRow icon={FileText} label="Endereço" value={clientProfile.address} />
                        </div>
                        {clientProfile.notes && (
                          <p className="mt-2 text-xs text-muted-foreground border-l-2 border-muted pl-3">{clientProfile.notes}</p>
                        )}
                      </div>
                    </>
                  )}

                  <Separator />

                  {/* Problem & Solution */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <EditableField
                      value={problem} onSave={handleSaveProblem} saving={updateTicketField.isPending}
                      placeholder="Descreva o problema encontrado..."
                      icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
                      label="Problema" borderClass="border-destructive/30" bgClass="bg-destructive/5" labelClass="text-destructive"
                    />
                    <EditableField
                      value={solution} onSave={handleSaveSolution} saving={updateTicketField.isPending}
                      placeholder="Descreva a solução aplicada..."
                      icon={<FileText className="h-4 w-4 text-success" />}
                      label="Solução" borderClass="border-success/30" bgClass="bg-success/5" labelClass="text-success"
                    />
                  </div>

                  {ticket.problem_category && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Categoria:</span>
                      <Badge variant="secondary">{ticket.problem_category}</Badge>
                    </div>
                  )}

                  {/* Documentos do Cliente — Orçamentos / PA / PG */}
                  {((clientQuotes && clientQuotes.length > 0) || (clientServiceRequests && clientServiceRequests.length > 0) || (clientWarrantyClaims && clientWarrantyClaims.length > 0)) && (
                    <>
                      <Separator />
                      <div className="space-y-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Documentos do Cliente
                        </p>

                        {/* Orçamentos */}
                        {clientQuotes && clientQuotes.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Checkbox
                                checked={selectedQuotes.size === clientQuotes.length}
                                onCheckedChange={() => toggleAll(clientQuotes.map((q: any) => q.id), selectedQuotes, setSelectedQuotes)}
                                className="h-3.5 w-3.5"
                              />
                              <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs font-semibold">Orçamentos</span>
                              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{clientQuotes.length}</Badge>
                              {selectedQuotes.size > 0 && <Badge className="text-[10px] h-4 px-1.5 bg-primary text-white">{selectedQuotes.size} selecionado{selectedQuotes.size > 1 ? "s" : ""}</Badge>}
                            </div>
                            <div className="rounded-lg border overflow-hidden divide-y">
                              {clientQuotes.map((q: any) => {
                                const total = Number(q.total) > 0 ? Number(q.total) : (q.quote_items || []).reduce((sum: number, it: any) => sum + (Number(it.quantity) * Number(it.unit_price)), 0);
                                const isCurrentTicket = q.ticket_id === ticket.id;
                                const isSelected = selectedQuotes.has(q.id);
                                return (
                                  <div
                                    key={q.id}
                                    className={`flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors ${isCurrentTicket ? "bg-primary/5" : ""} ${isSelected ? "bg-primary/10" : ""}`}
                                  >
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() => toggleSel(selectedQuotes, setSelectedQuotes, q.id)}
                                      className="h-3.5 w-3.5 shrink-0"
                                    />
                                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-mono font-semibold text-primary">{q.quote_number || "—"}</span>
                                      {isCurrentTicket && <Badge className="text-[9px] h-4 px-1.5 bg-primary/10 text-primary border-primary/20">Chamado atual</Badge>}
                                      {q.service_request_id && (
                                        <Badge
                                          className="text-[9px] h-4 px-1.5 bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200 cursor-pointer"
                                          onClick={() => { onOpenChange(false); navigate(`/pedidos-acessorios/${q.service_request_id}?from_ticket=${ticket.id}`); }}
                                        >
                                          PA · {q.service_requests?.request_number || "—"}
                                        </Badge>
                                      )}
                                      {q.warranty_claim_id && (
                                        <Badge
                                          className="text-[9px] h-4 px-1.5 bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 cursor-pointer"
                                          onClick={() => { onOpenChange(false); navigate(`/pedidos-garantia/${q.warranty_claim_id}?from_ticket=${ticket.id}`); }}
                                        >
                                          PG · {q.warranty_claims?.claim_number || "—"}
                                        </Badge>
                                      )}
                                    </div>
                                    <Select
                                      value={q.status}
                                      onValueChange={async (val) => {
                                        const { error } = await supabase
                                          .from("quotes")
                                          .update({ status: val, ...(val === "aprovado" ? { approved_at: new Date().toISOString() } : {}) })
                                          .eq("id", q.id);
                                        if (error) { toast.error("Erro ao atualizar"); return; }
                                        toast.success("Status atualizado");
                                        qc.invalidateQueries({ queryKey: ["client-quotes"] });
                                        if (val === "aprovado") {
                                          setApprovalQuote({
                                            id: q.id,
                                            quote_number: q.quote_number,
                                            ticket_id: q.ticket_id,
                                            client_id: q.client_id,
                                            equipment_id: q.equipment_id,
                                          });
                                        }
                                      }}
                                    >
                                      <SelectTrigger className="h-6 w-[130px] text-[10px] shrink-0">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="rascunho">Rascunho</SelectItem>
                                        <SelectItem value="em_analise">Em Análise</SelectItem>
                                        <SelectItem value="aprovado">Aprovado</SelectItem>
                                        <SelectItem value="reprovado">Reprovado</SelectItem>
                                        <SelectItem value="cancelado">Cancelado</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <span className="text-xs font-mono shrink-0">{fmtCurrency(total)}</span>
                                    <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">{new Date(q.created_at).toLocaleDateString("pt-BR")}</span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 shrink-0"
                                      title="Abrir tela completa"
                                      onClick={() => { onOpenChange(false); navigate(`/orcamentos/${q.id}?from_ticket=${ticket.id}`); }}
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Pedidos de Acessório (PA) */}
                        {clientServiceRequests && clientServiceRequests.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Checkbox
                                checked={selectedPA.size === clientServiceRequests.length}
                                onCheckedChange={() => toggleAll(clientServiceRequests.map((sr: any) => sr.id), selectedPA, setSelectedPA)}
                                className="h-3.5 w-3.5"
                              />
                              <Package className="h-3.5 w-3.5 text-blue-600" />
                              <span className="text-xs font-semibold">Pedidos de Acessório (PA)</span>
                              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{clientServiceRequests.length}</Badge>
                              {selectedPA.size > 0 && <Badge className="text-[10px] h-4 px-1.5 bg-primary text-white">{selectedPA.size} selecionado{selectedPA.size > 1 ? "s" : ""}</Badge>}
                            </div>
                            <div className="rounded-lg border overflow-hidden divide-y">
                              {clientServiceRequests.map((sr: any) => {
                                const isSelected = selectedPA.has(sr.id);
                                return (
                                  <div
                                    key={sr.id}
                                    className={`flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/10" : ""}`}
                                  >
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() => toggleSel(selectedPA, setSelectedPA, sr.id)}
                                      className="h-3.5 w-3.5 shrink-0"
                                    />
                                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-mono font-semibold text-blue-700">{sr.request_number || "—"}</span>
                                      {sr.tickets?.ticket_number && (
                                        <span className="text-[10px] text-muted-foreground">#{sr.tickets.ticket_number}</span>
                                      )}
                                    </div>
                                    <Select
                                      value={sr.status === "cancelado" ? "cancelado" : sr.status === "resolvido" ? "resolvido" : "em_andamento"}
                                      onValueChange={async (val) => {
                                        const { error } = await supabase.from("service_requests").update({ status: val as any }).eq("id", sr.id);
                                        if (error) { toast.error("Erro ao atualizar"); return; }
                                        toast.success("Status atualizado");
                                        qc.invalidateQueries({ queryKey: ["client-service-requests"] });
                                      }}
                                    >
                                      <SelectTrigger className="h-6 w-[130px] text-[10px] shrink-0">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="em_andamento">Em Análise</SelectItem>
                                        <SelectItem value="resolvido">Aprovado</SelectItem>
                                        <SelectItem value="cancelado">Reprovado</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    {sr.notes && <span className="text-[10px] text-muted-foreground truncate max-w-[100px] hidden sm:block">{sr.notes}</span>}
                                    <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">{new Date(sr.created_at).toLocaleDateString("pt-BR")}</span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 shrink-0"
                                      title="Abrir tela completa"
                                      onClick={() => { onOpenChange(false); navigate(`/pedidos-acessorios/${sr.id}?from_ticket=${ticket.id}`); }}
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Pedidos de Garantia (PG) */}
                        {clientWarrantyClaims && clientWarrantyClaims.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Checkbox
                                checked={selectedPG.size === clientWarrantyClaims.length}
                                onCheckedChange={() => toggleAll(clientWarrantyClaims.map((wc: any) => wc.id), selectedPG, setSelectedPG)}
                                className="h-3.5 w-3.5"
                              />
                              <Shield className="h-3.5 w-3.5 text-amber-600" />
                              <span className="text-xs font-semibold">Pedidos de Garantia (PG)</span>
                              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{clientWarrantyClaims.length}</Badge>
                              {selectedPG.size > 0 && <Badge className="text-[10px] h-4 px-1.5 bg-primary text-white">{selectedPG.size} selecionado{selectedPG.size > 1 ? "s" : ""}</Badge>}
                            </div>
                            <div className="rounded-lg border overflow-hidden divide-y">
                              {clientWarrantyClaims.map((wc: any) => {
                                const isSelected = selectedPG.has(wc.id);
                                return (
                                  <div
                                    key={wc.id}
                                    className={`flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/10" : ""}`}
                                  >
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() => toggleSel(selectedPG, setSelectedPG, wc.id)}
                                      className="h-3.5 w-3.5 shrink-0"
                                    />
                                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-mono font-semibold text-amber-700">{wc.claim_number || "—"}</span>
                                      {wc.tickets?.ticket_number && (
                                        <span className="text-[10px] text-muted-foreground">#{wc.tickets.ticket_number}</span>
                                      )}
                                    </div>
                                    <Select
                                      value={["em_analise","aprovada","reprovada"].includes(wc.warranty_status) ? wc.warranty_status : "em_analise"}
                                      onValueChange={async (val) => {
                                        const { error } = await supabase.from("warranty_claims").update({ warranty_status: val as any }).eq("id", wc.id);
                                        if (error) { toast.error("Erro ao atualizar"); return; }
                                        toast.success("Status atualizado");
                                        qc.invalidateQueries({ queryKey: ["client-warranty-claims"] });
                                      }}
                                    >
                                      <SelectTrigger className="h-6 w-[130px] text-[10px] shrink-0">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="em_analise">Em Análise</SelectItem>
                                        <SelectItem value="aprovada">Aprovado</SelectItem>
                                        <SelectItem value="reprovada">Reprovado</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    {wc.defect_description && <span className="text-[10px] text-muted-foreground truncate max-w-[100px] hidden sm:block">{wc.defect_description}</span>}
                                    <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">{new Date(wc.created_at).toLocaleDateString("pt-BR")}</span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 shrink-0"
                                      title="Abrir tela completa"
                                      onClick={() => { onOpenChange(false); navigate(`/pedidos-garantia/${wc.id}?from_ticket=${ticket.id}`); }}
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {!clientQuotes?.length && !clientServiceRequests?.length && !clientWarrantyClaims?.length && (
                          <p className="text-sm text-muted-foreground text-center py-3">Nenhum documento registrado para este cliente.</p>
                        )}
                      </div>
                    </>
                  )}

                  {/* Client Service History */}
                  <Separator />
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Histórico de Atendimentos ({clientHistory?.length || 0})
                      </p>
                    </div>
                    {clientHistory && clientHistory.length > 0 ? (
                      <div className="space-y-2">
                        {clientHistory.map((row: any) => (
                          <div key={row.id} className="rounded-lg border p-3 hover:bg-muted/30 transition-colors">
                            <div className="flex items-center gap-2 mb-1">
                              <History className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-[11px] text-muted-foreground">
                                {row.service_date ? new Date(row.service_date).toLocaleDateString("pt-BR") + " " + new Date(row.service_date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{(row as any).history_notes || "—"}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">Nenhum histórico registrado.</p>
                    )}
                  </div>

                  {/* Quick summary */}
                  <Separator />
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    <SummaryPill label="Equipamentos" count={clientEquipments?.length || 0} onClick={() => setActiveTab("client-equipments")} />
                    <SummaryPill label="Chamados" count={clientTickets?.length || 0} onClick={() => setActiveTab("client-tickets")} />
                    <SummaryPill label="Orçamentos" count={clientQuotes?.length || 0} onClick={() => setActiveTab("client-quotes")} />
                    <SummaryPill label="OS" count={clientWorkOrders?.length || 0} onClick={() => setActiveTab("client-workorders")} />
                    <SummaryPill label="Ped. Garantia" count={clientWarrantyClaims?.length || 0} onClick={() => setActiveTab("client-warranties")} />
                    <SummaryPill label="Tarefas" count={clientTasks?.length || 0} onClick={() => setActiveTab("client-tasks")} />
                  </div>
                </TabsContent>

                {/* ── Tab: Histórico Técnico ─────────────── */}
                <TabsContent value="history" className="mt-0 space-y-4">
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <p className="text-xs font-semibold">Adicionar registro ao histórico</p>
                    <Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Descreva a interação, decisão tomada, peça solicitada, contato realizado..." rows={3} className="text-sm" />
                    <div className="flex justify-end">
                      <Button size="sm" onClick={handleAddNote} disabled={!newNote.trim() || addHistoryEntry.isPending}>
                        <Send className="h-3.5 w-3.5 mr-1.5" /> {addHistoryEntry.isPending ? "Salvando..." : "Registrar"}
                      </Button>
                    </div>
                    {!ticket.equipment_id && (
                      <p className="text-[11px] text-muted-foreground">Sem equipamento vinculado: o registro será salvo no histórico do cliente.</p>
                    )}
                  </div>
                  <Separator />
                  {ticket.equipment_id ? <TechnicalTimeline equipmentId={ticket.equipment_id} /> : (
                    <p className="text-sm text-muted-foreground py-4">Nenhum equipamento vinculado.</p>
                  )}
                </TabsContent>

                {/* ── Tab: Client Equipments ─────────────── */}
                <TabsContent value="client-equipments" className="mt-0 space-y-3">
                  <SectionHeader label="Equipamentos" clientName={ticket.clients?.name} count={clientEquipments?.length || 0} onNew={() => setNewEquipmentOpen(true)} />
                  {clientEquipments?.length === 0 && <EmptyState label="Nenhum equipamento registrado para este cliente." />}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {clientEquipments?.map((eq: any) => (
                      <div key={eq.id} className={`border rounded-lg p-4 transition-colors ${eq.id === equipmentId ? "border-primary bg-primary/5" : "hover:bg-muted/30"}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Cpu className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-semibold">{eq.equipment_models?.name || "—"}</span>
                            {eq.id === equipmentId && <Badge className="text-[9px] h-4">Atual</Badge>}
                          </div>
                          <StatusBadge status={eq.warranty_status} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <span>Série: <strong className="text-foreground">{eq.serial_number || "—"}</strong></span>
                          <span>NF: <strong className="text-foreground">{eq.batch_number || "—"}</strong></span>
                          <span>Status: <strong className="text-foreground">{eq.status}</strong></span>
                          {eq.warranty_expires_at && <span>Garantia até: {fmtDate(eq.warranty_expires_at)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* ── Tab: Client Tickets ────────────────── */}
                <TabsContent value="client-tickets" className="mt-0 space-y-3">
                  <SectionHeader label="Chamados" clientName={ticket.clients?.name} count={clientTickets?.length || 0} onNew={() => createTicket.mutate()} loading={createTicket.isPending} />
                  {clientTickets?.length === 0 && <EmptyState label="Nenhum chamado registrado." />}
                  {clientTickets?.map((t: any) => (
                    <div key={t.id} className={`border rounded-lg p-4 transition-colors ${t.id === ticketId ? "border-primary bg-primary/5" : "hover:bg-muted/30"}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <ClipboardList className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-semibold font-mono">{t.ticket_number}</span>
                          <StatusBadge status={t.status} />
                          <Badge variant="secondary" className="text-[10px]">{t.ticket_type}</Badge>
                          {t.id === ticketId && <Badge className="text-[9px] h-4">Atual</Badge>}
                        </div>
                        <StatusBadge status={t.priority} />
                      </div>
                      <p className="text-sm font-medium mb-1">{t.title}</p>
                      <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                        <span>Criado: {fmtDate(t.created_at)}</span>
                        <span>Pipeline: {t.pipeline_stage}</span>
                        {t.equipments && <span>Equip: {t.equipments.serial_number}</span>}
                      </div>
                    </div>
                  ))}
                </TabsContent>

                {/* ── Tab: Client Quotes ─────────────────── */}
                <TabsContent value="client-quotes" className="mt-0 space-y-3">
                  <SectionHeader label="Orçamentos" clientName={ticket.clients?.name} count={clientQuotes?.length || 0} onNew={() => createQuote.mutate()} loading={createQuote.isPending} />
                  {clientQuotes?.length === 0 && <EmptyState label="Nenhum orçamento registrado." />}
                  {clientQuotes?.map((q: any) => (
                    <div key={q.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Receipt className="h-4 w-4 text-muted-foreground" />
                          <span
                            className="text-sm font-semibold font-mono text-primary cursor-pointer hover:underline"
                            onClick={() => { onOpenChange(false); navigate(`/orcamentos/${q.id}?from_ticket=${ticket.id}`); }}
                          >
                            {q.quote_number}
                          </span>
                          <StatusBadge status={q.status} />
                          {q.service_request_id && <Badge className="text-[9px] h-4 bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200 cursor-pointer" onClick={() => { onOpenChange(false); navigate(`/pedidos-acessorios/${q.service_request_id}?from_ticket=${ticket.id}`); }}>→ {q.service_requests?.request_number || "PA"}</Badge>}
                          {q.warranty_claim_id && <Badge className="text-[9px] h-4 bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200 cursor-pointer" onClick={() => { onOpenChange(false); navigate(`/pedidos-garantia/${q.warranty_claim_id}?from_ticket=${ticket.id}`); }}>→ {q.warranty_claims?.claim_number || "PG"}</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">{fmtCurrency(q.total)}</span>
                          <Button variant="ghost" size="sm" className="text-[10px] gap-1 h-6" onClick={() => { onOpenChange(false); navigate(`/orcamentos/${q.id}?from_ticket=${ticket.id}`); }}>
                            <ExternalLink className="h-3 w-3" /> Editar
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                        <span>Criado: {fmtDate(q.created_at)}</span>
                        {q.valid_until && <span>Válido até: {fmtDate(q.valid_until)}</span>}
                        <span>Subtotal: {fmtCurrency(q.subtotal)}</span>
                      </div>
                    </div>
                  ))}
                </TabsContent>

                {/* ── Tab: Client Work Orders ────────────── */}
                <TabsContent value="client-workorders" className="mt-0 space-y-3">
                  <SectionHeader label="Ordens de Serviço" clientName={ticket.clients?.name} count={clientWorkOrders?.length || 0} onNew={equipmentId ? () => createWorkOrder.mutate() : undefined} loading={createWorkOrder.isPending} />
                  {clientWorkOrders?.length === 0 && <EmptyState label="Nenhuma ordem de serviço registrada." />}
                  {clientWorkOrders?.map((wo: any) => (
                    <div key={wo.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Wrench className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-semibold font-mono">{wo.order_number}</span>
                          <StatusBadge status={wo.status} />
                          <Badge variant="secondary" className="text-[10px]">{wo.order_type}</Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                        <span>Criado: {fmtDate(wo.created_at)}</span>
                        {wo.completed_at && <span>Concluído: {fmtDate(wo.completed_at)}</span>}
                        {wo.diagnosis && <span className="col-span-2 line-clamp-1">Diagnóstico: {wo.diagnosis}</span>}
                      </div>
                    </div>
                  ))}
                </TabsContent>

                {/* ── Tab: Pedidos de Garantia (PG) ─────────────── */}
                <TabsContent value="client-warranties" className="mt-0 space-y-3">
                  <SectionHeader label="Pedidos de Garantia (PG)" clientName={ticket.clients?.name} count={clientWarrantyClaims?.length || 0} onNew={() => createWarrantyClaim.mutate()} loading={createWarrantyClaim.isPending} />
                  {clientWarrantyClaims?.length === 0 && <EmptyState label="Nenhum pedido de garantia registrado." />}
                  {clientWarrantyClaims?.map((wc: any) => {
                    const pgStatusLabels: Record<string, string> = { em_analise: "Em Análise", aprovada: "Aprovada", reprovada: "Reprovada", convertida_os: "Convertida em OS" };
                    return (
                      <div key={wc.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-muted-foreground" />
                            <span
                              className="text-sm font-semibold font-mono text-primary cursor-pointer hover:underline"
                              onClick={() => { onOpenChange(false); navigate(`/pedidos-garantia/${wc.id}?from_ticket=${ticket.id}`); }}
                            >
                              {wc.claim_number || "PG"}
                            </span>
                            <Select
                              value={wc.warranty_status}
                              onValueChange={async (val: any) => {
                                const { error } = await supabase.from("warranty_claims").update({ warranty_status: val }).eq("id", wc.id);
                                if (error) { toast.error("Erro ao atualizar"); return; }
                                toast.success("Status atualizado");
                                qc.invalidateQueries({ queryKey: ["client-warranty-claims"] });
                              }}
                            >
                              <SelectTrigger className="h-6 w-[140px] text-[10px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(pgStatusLabels).map(([val, label]) => (
                                  <SelectItem key={val} value={val}>{label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button variant="ghost" size="sm" className="text-[10px] gap-1 h-6" onClick={() => { onOpenChange(false); navigate(`/pedidos-garantia/${wc.id}?from_ticket=${ticket.id}`); }}>
                            <ExternalLink className="h-3 w-3" /> Ver Detalhes
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                          <span>Criado: {fmtDate(wc.created_at)}</span>
                          {wc.defect_description && <span className="col-span-2 line-clamp-1">Defeito: {wc.defect_description}</span>}
                        </div>
                      </div>
                    );
                  })}
                </TabsContent>

                {/* ── Tab: Pedidos de Acessórios (PA) ───────── */}
                <TabsContent value="client-services" className="mt-0 space-y-3">
                  <SectionHeader label="Pedidos de Acessórios (PA)" clientName={ticket.clients?.name} count={clientServiceRequests?.length || 0} onNew={() => createServiceRequest.mutate()} loading={createServiceRequest.isPending} />
                  {clientServiceRequests?.length === 0 && <EmptyState label="Nenhum pedido de acessório registrado." />}
                  {clientServiceRequests?.map((sr: any) => {
                    const paStatusLabels: Record<string, string> = { aberto: "Aberto", orcamento_enviado: "Orçamento Enviado", agendado: "Agendado", em_andamento: "Em Andamento", resolvido: "Resolvido", cancelado: "Cancelado" };
                    return (
                      <div key={sr.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <span
                              className="text-sm font-semibold font-mono text-primary cursor-pointer hover:underline"
                              onClick={() => { onOpenChange(false); navigate(`/pedidos-acessorios/${sr.id}?from_ticket=${ticket.id}`); }}
                            >
                              {sr.request_number || "PA"}
                            </span>
                            <Select
                              value={sr.status}
                              onValueChange={async (val: any) => {
                                const { error } = await supabase.from("service_requests").update({ status: val }).eq("id", sr.id);
                                if (error) { toast.error("Erro ao atualizar"); return; }
                                toast.success("Status atualizado");
                                qc.invalidateQueries({ queryKey: ["client-service-requests"] });
                              }}
                            >
                              <SelectTrigger className="h-6 w-[140px] text-[10px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(paStatusLabels).map(([val, label]) => (
                                  <SelectItem key={val} value={val}>{label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button variant="ghost" size="sm" className="text-[10px] gap-1 h-6" onClick={() => { onOpenChange(false); navigate(`/pedidos-acessorios/${sr.id}?from_ticket=${ticket.id}`); }}>
                            <ExternalLink className="h-3 w-3" /> Ver Detalhes
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                          <span>Criado: {fmtDate(sr.created_at)}</span>
                          <span>Tipo: {sr.request_type}</span>
                          {sr.notes && <span className="line-clamp-1">Obs: {sr.notes}</span>}
                        </div>
                      </div>
                    );
                  })}
                </TabsContent>

                {/* ── Tab: Client Tasks ──────────────────── */}
                <TabsContent value="client-tasks" className="mt-0 space-y-2">
                  <SectionHeader label="Tarefas" clientName={ticket.clients?.name} count={clientTasks?.length || 0} onNew={() => createTask.mutate()} loading={createTask.isPending} />
                  {clientTasks?.length === 0 && <EmptyState label="Nenhuma tarefa registrada." />}
                  {clientTasks?.map((task: any) => (
                    <div key={task.id} className="border rounded-lg p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{task.title}</p>
                        <div className="flex items-center gap-1">
                          <StatusBadge status={task.priority} />
                          <Badge variant={task.status === "concluida" ? "default" : "secondary"} className="text-[10px]">{task.status}</Badge>
                        </div>
                      </div>
                      {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        {task.due_date && <span className="flex items-center gap-0.5"><Calendar className="h-3 w-3" />{fmtDate(task.due_date)}</span>}
                        <span>{fmtDate(task.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </TabsContent>

                {/* ── Tab: Client Service History ────────── */}
                <TabsContent value="client-history" className="mt-0 space-y-3">
                  <SectionHeader label="Histórico de Atendimento" clientName={ticket.clients?.name} count={clientHistory?.length || 0} />

                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <p className="text-xs font-semibold">Registrar novo atendimento</p>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Aparelho"
                        value={histDevice}
                        onChange={(e) => setHistDevice(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <input
                        type="text"
                        placeholder="Problema relatado"
                        value={histProblem}
                        onChange={(e) => setHistProblem(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <Textarea
                      value={histSolution}
                      onChange={(e) => setHistSolution(e.target.value)}
                      placeholder="Solução aplicada..."
                      rows={2}
                      className="text-sm"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        disabled={!histDevice.trim() && !histProblem.trim()}
                        onClick={async () => {
                          const { error } = await supabase.from("client_service_history").insert({
                            client_id: clientId,
                            device: histDevice.trim() || null,
                            problem_reported: histProblem.trim() || null,
                            solution_provided: histSolution.trim() || null,
                            service_status: "concluido",
                            created_by: user?.id,
                          });
                          if (error) {
                            toast.error("Erro ao registrar: " + error.message);
                            return;
                          }
                          toast.success("Histórico registrado");
                          setHistDevice("");
                          setHistProblem("");
                          setHistSolution("");
                          qc.invalidateQueries({ queryKey: ["client_service_history", clientId] });
                        }}
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5" /> Registrar
                      </Button>
                    </div>
                  </div>

                  {clientHistory?.length === 0 && <EmptyState label="Nenhum histórico de atendimento registrado." />}
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          {["Data", "Aparelho", "Problema Relatado", "Solução", "Status"].map((h) => (
                            <th key={h} className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {clientHistory?.map((row: any) => (
                          <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-4 py-2 whitespace-nowrap">{row.service_date ? new Date(row.service_date).toLocaleDateString("pt-BR") : "—"}</td>
                            <td className="px-4 py-2">{row.device || "—"}</td>
                            <td className="px-4 py-2 max-w-[250px] truncate" title={row.problem_reported || ""}>{row.problem_reported || "—"}</td>
                            <td className="px-4 py-2 max-w-[250px] truncate" title={row.solution_provided || ""}>{row.solution_provided || "—"}</td>
                            <td className="px-4 py-2"><StatusBadge status={row.service_status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                {/* ── Tab: Atividades ────────────────────── */}
                <TabsContent value="activity" className="mt-0 space-y-2">
                  {activities?.length === 0 && <EmptyState label="Nenhuma atividade registrada." />}
                  {activities?.map((act: any) => (
                    <div key={act.id} className="flex gap-3 py-2 border-b last:border-0">
                      <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{act.action}</p>
                        {act.description && <p className="text-xs text-muted-foreground">{act.description}</p>}
                        <span className="text-[10px] text-muted-foreground">
                          {fmtDate(act.created_at)} {new Date(act.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  ))}
                </TabsContent>

                {/* ── Tab: WhatsApp ──────────────────────── */}
                <TabsContent value="whatsapp" className="mt-0">
                  <WhatsAppChat
                    clientId={clientId}
                    ticketId={ticketId}
                    clientPhone={clientProfile?.whatsapp || clientProfile?.phone || ticket.clients?.whatsapp || ticket.clients?.phone}
                    clientName={clientProfile?.name || ticket.clients?.name}
                  />
                </TabsContent>

              </div>
            </ScrollArea>
          </div>
        </Tabs>
      </DialogContent>

      <CrudDialog
        open={newEquipmentOpen}
        onOpenChange={setNewEquipmentOpen}
        title="Novo Equipamento"
        fields={[
          {
            name: "model_id",
            label: "Nome do Aparelho",
            type: "select",
            required: true,
            options: equipmentModels?.map((model: any) => ({ value: model.id, label: model.name })) || [],
          },
          {
            name: "serial_number",
            label: "Número de Série",
            type: "text",
            placeholder: "Ex: SN-123456",
          },
          {
            name: "batch_number",
            label: "Número da Nota Fiscal",
            type: "text",
            placeholder: "Ex: NF-00123",
          },
        ]}
        onSubmit={async (values) => {
          await createEquipment.mutateAsync({
            model_id: values.model_id,
            serial_number: values.serial_number,
            batch_number: values.batch_number,
          });
        }}
      />
    </Dialog>

    <ApprovalActionDialog
      open={!!approvalQuote}
      onOpenChange={(o) => !o && setApprovalQuote(null)}
      quote={approvalQuote}
    />
    </>
  );
}

// ─── Shared sub-components ─────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <div>
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || "—"}</p>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground py-8 text-center">{label}</p>;
}

function SectionHeader({ label, clientName, count, onNew, loading }: { label: string; clientName?: string; count: number; onNew?: () => void; loading?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold">
        {label} <span className="text-muted-foreground font-normal">de {clientName || "—"}</span>
      </h3>
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-[10px]">{count} registros</Badge>
        {onNew && (
          <Button size="sm" className="h-7 text-xs gap-1" onClick={onNew} disabled={loading}>
            <Plus className="h-3 w-3" /> {loading ? "Criando..." : "Novo"}
          </Button>
        )}
      </div>
    </div>
  );
}

function SummaryPill({ label, count, onClick }: { label: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 p-3 rounded-lg border bg-muted/30 hover:bg-muted/60 hover:border-primary/30 transition-all cursor-pointer"
    >
      <span className="text-lg font-bold">{count}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </button>
  );
}
