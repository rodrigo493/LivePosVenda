import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import {
  Kanban,
  ListTodo,
  Upload,
  ClipboardPaste,
  UserPlus,
  Search,
  FileSpreadsheet,
  Pencil,
  TrendingUp,
  ChevronDown,
  CalendarClock,
  MessageSquare,
  X,
  ArrowRightLeft,
  FileDown,
  Tag,
  MoveRight,
  Layers,
  CheckSquare2,
} from "lucide-react";
import { ChannelIcon } from "@/components/ui/ChannelIcon";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  rectIntersection,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CrmSyncImportDialog } from "@/components/crm/CrmSyncImportDialog";
import { CrmBatchSyncDialog } from "@/components/crm/CrmBatchSyncDialog";
import { PipelineExcelImportDialog } from "@/components/crm/PipelineExcelImportDialog";
import { TicketDetailDialog } from "@/components/tickets/TicketDetailDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useQueryClient } from "@tanstack/react-query";
import { usePipelineTickets, useMovePipelineStage } from "@/hooks/usePipeline";
import { usePipelines, type Pipeline } from "@/hooks/usePipelines";
import { usePipelineStages, type PipelineStageDB } from "@/hooks/usePipelineStages";
import { FunnelSwitcher } from "@/components/crm/FunnelSwitcher";
import { FunnelManagerDropdown } from "@/components/crm/FunnelManagerDropdown";
import { PipelineEditMode } from "@/components/crm/PipelineEditMode";
import { usePipelineAutomations, type AutomationActionType } from "@/hooks/useStageAutomations";
import { useUpdatePipeline } from "@/hooks/useManagePipelines";
import { useCreateStage, useUpdateStage, useDeleteStage, useReorderStages } from "@/hooks/useManageStages";
import { useWhatsAppConversations } from "@/hooks/useWhatsAppConversations";
import { useInstagramConversations } from "@/hooks/useInstagramConversations";
import { useAuth } from "@/hooks/useAuth";
import { useCreateClient } from "@/hooks/useClients";
import { useCreateTicket } from "@/hooks/useTickets";
import { useEquipments, useEquipmentModels } from "@/hooks/useEquipments";
import { useAllUsers } from "@/hooks/useUserAccess";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { TaskCreateDialog } from "@/components/tasks/TaskCreateDialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useClearNewLead } from "@/hooks/useNewLeads";

function daysSince(dateStr: string | null) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function normalizePhone(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

const priorityOrder: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };

function findContainer(columns: Record<string, any[]>, id: string): string | null {
  if (id in columns) return id;
  for (const [stage, items] of Object.entries(columns)) {
    if (items.some((t: any) => t.id === id)) return stage;
  }
  return null;
}

const CrmPipelinePage = () => {
  const qc = useQueryClient();
  const { user, roles } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = roles.includes("admin");
  const [filterBy, setFilterBy] = useState<"all" | "mine" | string>(isAdmin ? "all" : "mine");
  const { data: allUsers = [] } = useAllUsers();

  const { data: pipelines = [] } = usePipelines();
  const [currentPipeline, setCurrentPipeline] = useState<Pipeline | null>(null);

  const selectPipeline = useCallback((p: Pipeline) => {
    setCurrentPipeline(p);
    localStorage.setItem("crm_last_pipeline_id", p.id);
  }, []);

  useEffect(() => {
    if (pipelines.length > 0 && !currentPipeline) {
      const storedId = localStorage.getItem("crm_last_pipeline_id");
      const stored = storedId ? pipelines.find((p) => p.id === storedId) : null;
      setCurrentPipeline(stored ?? pipelines[0]);
    }
  }, [pipelines, currentPipeline]);

  const { data: stages = [] } = usePipelineStages(currentPipeline?.id);

  const stageKeySet = useMemo(() => new Set<string>(stages.map((s) => s.key)), [stages]);

  const multiContainerCollision: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      const itemHit = pointerCollisions.find((c) => !stageKeySet.has(c.id as string));
      if (itemHit) return [itemHit];
      return pointerCollisions;
    }
    const rectCollisions = rectIntersection(args);
    if (rectCollisions.length > 0) return rectCollisions;
    return closestCorners(args);
  }, [stageKeySet]);

  const delayMap = useMemo(() => {
    const map: Record<string, number> = {};
    stages.forEach((s) => { map[s.key] = s.delay_minutes; });
    return map;
  }, [stages]);

  const ticketFilterUserId = filterBy === "all" ? undefined : filterBy === "mine" ? user?.id : filterBy;
  const { data: tickets, isLoading } = usePipelineTickets(currentPipeline?.id, ticketFilterUserId, isAdmin);
  const { data: conversations } = useWhatsAppConversations();
  const whatsappUnread = useMemo(() => {
    const map = new Map<string, number>();
    conversations?.forEach((c) => { if (c.unread_count > 0) map.set(c.client_id, c.unread_count); });
    return map;
  }, [conversations]);
  const whatsappLastActivity = useMemo(() => {
    const map = new Map<string, string>();
    conversations?.forEach((c) => { map.set(c.client_id, c.last_message_at); });
    return map;
  }, [conversations]);
  const { data: igConversations } = useInstagramConversations();
  const instagramUnread = useMemo(() => {
    const map = new Map<string, number>();
    igConversations?.forEach((c) => { if (c.unread_count > 0 && c.client_id) map.set(c.client_id, c.unread_count); });
    return map;
  }, [igConversations]);
  const instagramLastActivity = useMemo(() => {
    const map = new Map<string, string>();
    igConversations?.forEach((c) => { if (c.client_id) map.set(c.client_id, c.last_message_at); });
    return map;
  }, [igConversations]);
  const moveStage = useMovePipelineStage();
  const createClient = useCreateClient();
  const createTicket = useCreateTicket();
  const { data: equipments } = useEquipments();
  const { data: equipmentModels } = useEquipmentModels();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [taskCreate, setTaskCreate] = useState<{ open: boolean; ticketId?: string; clientId?: string }>({ open: false });
  const [clientDialog, setClientDialog] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [excelImportOpen, setExcelImportOpen] = useState(false);
  const [detailTicket, setDetailTicket] = useState<any>(null);
  const [detailInitialTab, setDetailInitialTab] = useState("info");
  const clearNewLead = useClearNewLead();
  const handleOpenTicket = useCallback((ticket: any, tab = "info") => {
    setDetailInitialTab(tab);
    setDetailTicket(ticket);
    if (ticket?.new_lead) clearNewLead(ticket.id);
  }, [clearNewLead]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");

  // ── Edit mode ──────────────────────────────────────────────────
  interface LocalAutomation {
    id: string;
    trigger_type: string;
    action_type: AutomationActionType;
    action_config: Record<string, unknown>;
    is_active: boolean;
    delay_minutes: number;
  }
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editStages, setEditStages] = useState<PipelineStageDB[]>([]);
  const [editAutomations, setEditAutomations] = useState<Record<string, LocalAutomation[]>>({});
  const [saveEditPending, setSaveEditPending] = useState(false);
  const { data: pipelineAutomations = [] } = usePipelineAutomations(currentPipeline?.id);
  const updatePipeline = useUpdatePipeline();
  const createStageHook = useCreateStage();
  const deleteStageHook = useDeleteStage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isGrabbing, setIsGrabbing] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const grabState = useRef({ isDown: false, startX: 0, scrollLeft: 0 });

  // ── Seleção em massa (modo lista) ───────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  type BulkModal = "transfer" | "status" | "stage" | "pipeline" | "addAlter" | "export" | null;
  const [bulkModal, setBulkModal] = useState<BulkModal>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkTransferTo, setBulkTransferTo] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkStage, setBulkStage] = useState("");
  const [bulkPipelineId, setBulkPipelineId] = useState("");
  const [bulkAddField, setBulkAddField] = useState<"qualificacao" | "campanha" | "fonte" | "canal">("qualificacao");
  const [bulkAddValue, setBulkAddValue] = useState("");

  // Local columns state for smooth drag — synced from server data
  const [columns, setColumns] = useState<Record<string, any[]>>({});
  const dragSourceRef = useRef<{ stage: string; index: number } | null>(null);
  const isMutatingRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Handle ticket passed via navigation state (from ChatPage create-crm-card)
  useEffect(() => {
    if (!location.state?.openTicket) return;
    setDetailTicket(location.state.openTicket);
    navigate(location.pathname, { replace: true, state: {} });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.openTicket]);

  useEffect(() => {
    const openTicketId = searchParams.get("open_ticket");
    if (!openTicketId) return;

    // Try pipeline list first (fast path)
    if (tickets?.length) {
      const found = tickets.find((t: any) => t.id === openTicketId);
      if (found) {
        setDetailTicket(found);
        setSearchParams({}, { replace: true });
        return;
      }
    }

    // Fallback: fetch directly — handles users without pipeline_user_access
    setSearchParams({}, { replace: true });
    supabase
      .from("tickets")
      .select("*, clients(name), equipments(serial_number, equipment_models(name))")
      .eq("id", openTicketId)
      .maybeSingle()
      .then(({ data }) => { if (data) setDetailTicket(data); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Keep detailTicket in sync with fresh query data (so dialog shows latest description/solution)
  useEffect(() => {
    if (!detailTicket?.id || !tickets?.length) return;
    const updated = tickets.find((t: any) => t.id === detailTicket.id);
    if (updated && (updated.description !== detailTicket.description || updated.internal_notes !== detailTicket.internal_notes)) {
      setDetailTicket(updated);
    }
  }, [tickets]); // eslint-disable-line react-hooks/exhaustive-deps

  // Options for Canal / Origem / Campanha filters (computed from loaded tickets)
  const canalOptions = useMemo(() => {
    const vals = new Set<string>();
    tickets?.forEach((t: any) => { if (t.channel) vals.add(t.channel); });
    return Array.from(vals).sort();
  }, [tickets]);

  const origemOptions = useMemo(() => {
    const vals = new Set<string>();
    tickets?.forEach((t: any) => { if (t.origin) vals.add(t.origin); });
    return Array.from(vals).sort();
  }, [tickets]);

  const campanhaOptions = useMemo(() => {
    const vals = new Set<string>();
    tickets?.forEach((t: any) => { if (t.campanha) vals.add(t.campanha); });
    return Array.from(vals).sort();
  }, [tickets]);

  // Build grouped data from server tickets
  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    stages.forEach((s) => (map[s.key] = []));
    const term = searchTerm.toLowerCase().trim();

    tickets?.forEach((t: any) => {
      if (term) {
        const name = (t.clients?.name || "").toLowerCase();
        const number = (t.ticket_number || "").toLowerCase();
        const title = (t.title || "").toLowerCase();
        if (!name.includes(term) && !number.includes(term) && !title.includes(term)) return;
      }
      if (statusFilter !== "all" && t.status !== statusFilter) return;
      if (filterSource !== "all") {
        const [ftype, fval] = filterSource.split(/:(.+)/);
        if (ftype === "canal" && (t.channel || "") !== fval) return;
        if (ftype === "origem" && (t.origin || "") !== fval) return;
        if (ftype === "campanha" && (t.campanha || "") !== fval) return;
      }

      const days = daysSince(t.last_interaction_at);
      const stageDelay = delayMap[t.pipeline_stage] ?? 2;
      const stageColor = stages.find((s) => s.key === t.pipeline_stage)?.color ?? "#6366f1";
      const enriched = {
        ...t,
        _daysSinceInteraction: days,
        _isDelayed: days >= stageDelay,
        _isNoContact: t.pipeline_stage === "sem_atendimento",
        _unreadWhatsapp: whatsappUnread.get(t.client_id) || 0,
        _lastWhatsappAt: whatsappLastActivity.get(t.client_id) || null,
        _unreadInstagram: instagramUnread.get(t.client_id) || 0,
        _lastInstagramAt: instagramLastActivity.get(t.client_id) || null,
        _stageColor: stageColor,
        _isNewLead: !!t.new_lead,
      };
      const target = map[t.pipeline_stage] ? t.pipeline_stage : "sem_atendimento";
      map[target]?.push(enriched);
    });

    Object.values(map).forEach((arr) =>
      arr.sort((a: any, b: any) => {
        if (a._isNewLead !== b._isNewLead) return a._isNewLead ? -1 : 1;
        const aUnread = (a._unreadWhatsapp > 0) || (a._unreadInstagram > 0);
        const bUnread = (b._unreadWhatsapp > 0) || (b._unreadInstagram > 0);
        if (aUnread !== bUnread) return aUnread ? -1 : 1;
        const aLast = a._lastInstagramAt && (!a._lastWhatsappAt || a._lastInstagramAt > a._lastWhatsappAt) ? a._lastInstagramAt : a._lastWhatsappAt;
        const bLast = b._lastInstagramAt && (!b._lastWhatsappAt || b._lastInstagramAt > b._lastWhatsappAt) ? b._lastInstagramAt : b._lastWhatsappAt;
        if (aLast || bLast) {
          if (!aLast) return 1;
          if (!bLast) return -1;
          return new Date(bLast).getTime() - new Date(aLast).getTime();
        }
        if (a._isDelayed !== b._isDelayed) return a._isDelayed ? -1 : 1;
        return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
      })
    );

    return map;
  }, [tickets, delayMap, searchTerm, stages, whatsappUnread, whatsappLastActivity, statusFilter, filterSource]);

  // Sync columns from grouped when not dragging and not mutating
  useEffect(() => {
    if (!activeId && !isMutatingRef.current) {
      setColumns(grouped);
    }
  }, [grouped, activeId]);

  const activeTicket = useMemo(() => {
    if (!activeId) return null;
    for (const items of Object.values(columns)) {
      const found = items.find((t: any) => t.id === activeId);
      if (found) return found;
    }
    return null;
  }, [activeId, columns]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string;
    setActiveId(id);
    // Remember source position for cancel
    for (const [stage, items] of Object.entries(columns)) {
      const idx = items.findIndex((t: any) => t.id === id);
      if (idx !== -1) {
        dragSourceRef.current = { stage, index: idx };
        break;
      }
    }
  }, [columns]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setColumns((prev) => {
      const activeContainer = findContainer(prev, active.id as string);
      const overContainer = findContainer(prev, over.id as string);

      if (!activeContainer || !overContainer || activeContainer === overContainer) {
        return prev;
      }

      const activeItems = [...prev[activeContainer]];
      const overItems = [...prev[overContainer]];

      const activeIndex = activeItems.findIndex((t) => t.id === active.id);
      if (activeIndex === -1) return prev;

      const [movedItem] = activeItems.splice(activeIndex, 1);

      // If over is a stage key (empty column), append; otherwise insert at card position
      const overIndex = overItems.findIndex((t) => t.id === over.id);
      const insertIndex = overIndex === -1 ? overItems.length : overIndex;

      overItems.splice(insertIndex, 0, movedItem);

      return {
        ...prev,
        [activeContainer]: activeItems,
        [overContainer]: overItems,
      };
    });
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    const source = dragSourceRef.current;
    dragSourceRef.current = null;

    if (!over || !source) {
      setActiveId(null);
      setColumns(grouped);
      return;
    }

    const ticketId = active.id as string;
    const overId = over.id as string;

    // Read columns directly from closure — accurate because handleDragOver
    // triggers a re-render (updating columns) before pointerup fires handleDragEnd.
    const currentContainer = findContainer(columns, ticketId);
    if (!currentContainer) {
      setTimeout(() => setActiveId(null), 0);
      setColumns(grouped);
      return;
    }

    let finalColumns = columns;
    let targetStage = currentContainer;
    const items = columns[currentContainer];
    let position = items.findIndex((t: any) => t.id === ticketId) + 1; // 1-indexed

    // Handle same-container reorder (only if over is another card in the same container)
    if (!stageKeySet.has(overId) && overId !== ticketId) {
      const overContainer = findContainer(columns, overId);
      if (overContainer === currentContainer) {
        const oldIndex = items.findIndex((t: any) => t.id === ticketId);
        const newIndex = items.findIndex((t: any) => t.id === overId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = arrayMove(items, oldIndex, newIndex);
          finalColumns = { ...columns, [currentContainer]: reordered };
          position = newIndex + 1;
        }
      }
    }

    const stageChanged = targetStage !== source.stage;
    const positionChanged = position !== source.index + 1;

    // Fire mutation OUTSIDE any state setter — calling mutate() inside a state
    // updater function violates React's pure-updater rule and triggers the ErrorBoundary
    // because React Query's internal dispatch() runs during the render phase.
    if (stageChanged || positionChanged) {
      isMutatingRef.current = true;
      moveStage.mutate(
        { id: ticketId, stage: targetStage, position, pipelineId: currentPipeline?.id ?? "" },
        {
          onSuccess: () => toast.success("Pipeline atualizado"),
          onSettled: () => { isMutatingRef.current = false; },
        }
      );
    }

    setColumns(finalColumns);
    setTimeout(() => setActiveId(null), 0);
  }, [columns, grouped, moveStage, stageKeySet, currentPipeline]);

  const cardCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    stages.forEach((s) => { counts[s.key] = (columns[s.key] || []).length; });
    return counts;
  }, [stages, columns]);

  // ── Edit mode handlers ─────────────────────────────────────────
  function enterEditMode() {
    if (!currentPipeline) return;
    setEditName(currentPipeline.name);
    setEditStages([...stages]);
    const autoMap: Record<string, LocalAutomation[]> = {};
    stages.forEach((s) => { autoMap[s.id] = []; });
    pipelineAutomations.forEach((a) => {
      if (!autoMap[a.stage_id]) autoMap[a.stage_id] = [];
      autoMap[a.stage_id].push({
        id: a.id,
        trigger_type: a.trigger_type,
        action_type: a.action_type,
        action_config: a.action_config as Record<string, unknown>,
        is_active: a.is_active,
        delay_minutes: a.delay_minutes ?? 0,
      });
    });
    setEditAutomations(autoMap);
    setIsEditing(true);
  }

  function handleAddEditStage() {
    const tempId = `temp-${Date.now()}`;
    const newStage: PipelineStageDB = {
      id: tempId,
      pipeline_id: currentPipeline?.id ?? "",
      key: "",
      label: "Nova etapa",
      color: "hsl(210 80% 55%)",
      delay_minutes: 1440,
      position: editStages.length,
    };
    setEditStages((prev) => [...prev, newStage]);
    setEditAutomations((prev) => ({ ...prev, [tempId]: [] }));
  }

  async function handleDeleteEditStage(stageId: string) {
    if (stageId.startsWith("temp-")) {
      setEditStages((prev) => prev.filter((s) => s.id !== stageId));
      setEditAutomations((prev) => { const n = { ...prev }; delete n[stageId]; return n; });
      return;
    }
    if (!currentPipeline) return;
    try {
      await deleteStageHook.mutateAsync({ id: stageId, pipelineId: currentPipeline.id });
      setEditStages((prev) => prev.filter((s) => s.id !== stageId));
      setEditAutomations((prev) => { const n = { ...prev }; delete n[stageId]; return n; });
    } catch { /* toast already shown by hook */ }
  }

  async function handleSaveEdit() {
    if (!currentPipeline || !editName.trim()) return;
    setSaveEditPending(true);
    try {
      // 1. Pipeline name
      if (editName.trim() !== currentPipeline.name) {
        const { error } = await (supabase as any).from("pipelines").update({ name: editName.trim() }).eq("id", currentPipeline.id);
        if (error) throw error;
        setCurrentPipeline({ ...currentPipeline, name: editName.trim() });
      }

      // 2. Update + reorder existing stages
      const existing = editStages.filter((s) => !s.id.startsWith("temp-"));
      const newStages = editStages.filter((s) => s.id.startsWith("temp-"));
      await Promise.all(
        existing.map((s, i) =>
          (supabase as any).from("pipeline_stages").update({
            label: s.label, color: s.color, delay_minutes: s.delay_minutes, position: i,
          }).eq("id", s.id)
        )
      );

      // 3. Create new stages
      const idMap: Record<string, string> = {};
      for (let i = 0; i < newStages.length; i++) {
        const s = newStages[i];
        const key = s.label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") + "_" + Date.now().toString(36);
        const { data, error } = await (supabase as any)
          .from("pipeline_stages")
          .insert({ pipeline_id: currentPipeline.id, key, label: s.label, color: s.color, delay_minutes: s.delay_minutes, position: existing.length + i })
          .select("id").single();
        if (error) throw error;
        idMap[s.id] = data.id;
      }

      // 4. Save automations
      for (const [stageId, autos] of Object.entries(editAutomations)) {
        const realId = idMap[stageId] ?? stageId;
        await (supabase as any).from("pipeline_stage_automations").delete().eq("stage_id", realId);
        if (autos.length > 0) {
          const { error } = await (supabase as any).from("pipeline_stage_automations").insert(
            autos.map((a, pos) => ({
              stage_id: realId, trigger_type: a.trigger_type, action_type: a.action_type,
              action_config: a.action_config, position: pos, is_active: a.is_active,
              delay_minutes: a.delay_minutes ?? 0,
            }))
          );
          if (error) throw error;
        }
      }

      qc.invalidateQueries({ queryKey: ["pipeline-stages", currentPipeline.id] });
      qc.invalidateQueries({ queryKey: ["pipeline-automations", currentPipeline.id] });
      qc.invalidateQueries({ queryKey: ["pipelines"] });
      toast.success("Funil salvo com sucesso");
      setIsEditing(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar funil");
    } finally {
      setSaveEditPending(false);
    }
  }

  const handleQuickTask = (ticketId: string, clientId: string) => {
    setTaskCreate({ open: true, ticketId, clientId });
  };

  // ── Helpers de seleção em massa ─────────────────────────────────
  const allVisibleIds = useMemo(
    () => stages.flatMap((s) => (columns[s.key] || []).map((t: any) => t.id)),
    [stages, columns]
  );
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));
  const someSelected = !allSelected && allVisibleIds.some((id) => selectedIds.has(id));

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allSelected || someSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allVisibleIds));
  }, [allSelected, someSelected, allVisibleIds]);

  const bulkUpdate = useCallback(async (updates: Record<string, any>) => {
    setBulkLoading(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await (supabase as any).from("tickets").update(updates).in("id", ids);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
      setSelectedIds(new Set());
      setBulkModal(null);
      toast.success(`${ids.length} negociação${ids.length > 1 ? "ões" : ""} atualizada${ids.length > 1 ? "s" : ""}`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar");
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, qc]);

  const exportSelectedCsv = useCallback(() => {
    const ids = new Set(selectedIds);
    const rows = stages.flatMap((s) => (columns[s.key] || []).filter((t: any) => ids.has(t.id)));
    const headers = ["Número", "Cliente", "Etapa", "Valor", "Status", "Prioridade", "Criado em"];
    const csvRows = rows.map((t: any) => [
      t.ticket_number,
      t.clients?.name || "",
      stages.find((s) => s.key === t.pipeline_stage)?.label || t.pipeline_stage,
      t.estimated_value || 0,
      t.status,
      t.priority || "",
      t.created_at ? new Date(t.created_at).toLocaleDateString("pt-BR") : "",
    ]);
    const csv = [headers, ...csvRows]
      .map((r) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `negociacoes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setSelectedIds(new Set());
    setBulkModal(null);
  }, [selectedIds, stages, columns]);

  return (
    <div className="-mx-6 -mt-6 -mb-6 flex flex-col bg-zinc-950">

      {/* ── Header preto com logo ── */}
      <div className="bg-black flex items-center justify-between px-6 py-2.5">
        <div className="flex items-center gap-3">
          {/* Botões modo Kanban / Lista */}
          <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
            <button
              onClick={() => setViewMode("kanban")}
              title="Modo Kanban"
              className={`p-1.5 rounded-md transition-colors ${viewMode === "kanban" ? "bg-white/20 text-white" : "text-white/50 hover:text-white/80"}`}
            >
              <Kanban className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              title="Modo Lista"
              className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-white/20 text-white" : "text-white/50 hover:text-white/80"}`}
            >
              <ListTodo className="h-4 w-4" />
            </button>
          </div>
          <img
            src="/crm-pipeline-logo.png"
            alt="Live CRM Pipeline"
            className="h-8 lg:h-9 w-auto object-contain select-none"
            draggable={false}
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <Button
            size="sm"
            className="gap-1.5 h-8 bg-[#25D366] hover:bg-[#1ebe5d] text-white border-0 font-semibold"
            onClick={() => navigate("/chat")}
          >
            <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
          </Button>
          <Button size="sm" className="gap-1.5 h-8" onClick={() => setClientDialog(true)}>
            <UserPlus className="h-3.5 w-3.5" /> Novo Cliente
          </Button>
          <Button variant="outline" size="sm" className="h-8 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white bg-transparent" onClick={() => setBatchOpen(true)}>
            <ClipboardPaste className="h-3.5 w-3.5 mr-1" /> Sincronizar
          </Button>
          <Button variant="outline" size="sm" className="h-8 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white bg-transparent" onClick={() => setExcelImportOpen(true)}>
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" className="h-8 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white bg-transparent" onClick={() => setSyncOpen(true)}>
            <Upload className="h-3.5 w-3.5 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {/* ── Barra de funil + filtros ── */}
      <div className="flex items-center gap-2 px-6 py-2 border-b border-zinc-800 bg-zinc-900 flex-wrap">
        <span className="font-semibold text-sm text-zinc-100">{currentPipeline?.name ?? "Pipeline CRM"}</span>
        {!isEditing && (
          <FunnelSwitcher
            currentPipelineId={currentPipeline?.id ?? null}
            onSelect={selectPipeline}
          />
        )}
        {isAdmin && !isEditing && (
          <>
            <div className="w-px h-5 bg-zinc-700 mx-0.5" />
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white bg-transparent"
              onClick={enterEditMode}
              disabled={!currentPipeline}
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar funil
            </Button>
            <FunnelManagerDropdown
              currentPipeline={currentPipeline}
              onPipelineCreated={selectPipeline}
            />
          </>
        )}
        <div className="flex-1" />
        {tickets && tickets.length > 0 && (
          <span className="text-[11px] text-zinc-500 hidden sm:inline whitespace-nowrap">
            {tickets.length} negociações
          </span>
        )}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar cliente, nº ou título..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary/50 h-8 w-48"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-36 text-xs bg-zinc-800 border-zinc-700 text-zinc-100">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="aberto">Em andamento</SelectItem>
            <SelectItem value="cancelado">Perdida</SelectItem>
            <SelectItem value="pausado">Pausado</SelectItem>
          </SelectContent>
        </Select>
        {isAdmin ? (
          <Select value={filterBy} onValueChange={setFilterBy}>
            <SelectTrigger className="h-8 w-36 text-xs bg-zinc-800 border-zinc-700 text-zinc-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="mine">Minhas</SelectItem>
              {allUsers.filter((u) => u.isAdmin).length > 0 && (
                <>
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-t mt-1 pt-2">
                    Admins
                  </div>
                  {allUsers.filter((u) => u.isAdmin).map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.full_name || u.email}
                    </SelectItem>
                  ))}
                </>
              )}
              {allUsers.filter((u) => !u.isAdmin).length > 0 && (
                <>
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-t mt-1 pt-2">
                    Usuários
                  </div>
                  {allUsers.filter((u) => !u.isAdmin).map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.full_name || u.email}
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
        ) : null}
        {/* Filtro unificado Canal / Origem / Campanha */}
        <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="h-8 w-40 text-xs bg-zinc-800 border-zinc-700 text-zinc-100">
              <SelectValue placeholder="Canal / Origem / Campanha" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              {canalOptions.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase tracking-wide text-zinc-500">Canal</SelectLabel>
                  {canalOptions.map((v) => <SelectItem key={`canal:${v}`} value={`canal:${v}`}>{v}</SelectItem>)}
                </SelectGroup>
              )}
              {origemOptions.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase tracking-wide text-zinc-500">Origem</SelectLabel>
                  {origemOptions.map((v) => <SelectItem key={`origem:${v}`} value={`origem:${v}`}>{v}</SelectItem>)}
                </SelectGroup>
              )}
              {campanhaOptions.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase tracking-wide text-zinc-500">Campanha</SelectLabel>
                  {campanhaOptions.map((v) => <SelectItem key={`campanha:${v}`} value={`campanha:${v}`}>{v}</SelectItem>)}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
      </div>

      {/* ── Conteúdo ── */}
      <div className="flex-1 px-4 py-3">

      {isEditing && currentPipeline ? (
        <PipelineEditMode
          pipeline={{ ...currentPipeline, name: editName }}
          stages={editStages}
          automations={editAutomations}
          cardCounts={cardCounts}
          onNameChange={setEditName}
          onStagesChange={setEditStages}
          onAutomationsChange={setEditAutomations}
          onAddStage={handleAddEditStage}
          onDeleteStage={handleDeleteEditStage}
          onSave={handleSaveEdit}
          onCancel={() => setIsEditing(false)}
          isSaving={saveEditPending}
        />
      ) : (
        <>
      {!currentPipeline && !isLoading && pipelines.length === 0 ? (
        <div className="p-12 text-center text-zinc-500 text-sm">Sem acesso ao CRM. Solicite acesso ao administrador.</div>
      ) : isLoading ? (
        <div className="p-8 text-center text-zinc-500 text-sm">Carregando pipeline...</div>
      ) : viewMode === "list" ? (
        <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900">
          {/* ── Barra de ações em massa ── */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 border-b border-primary/20 flex-wrap">
              <span className="text-xs font-bold text-primary">{selectedIds.size} selecionados</span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-zinc-400 hover:text-zinc-100 flex items-center gap-1 ml-1"
              >
                <X className="h-3 w-3" /> Limpar seleção
              </button>
              <div className="h-4 w-px bg-zinc-600 mx-1" />
              <button onClick={() => { setBulkTransferTo(""); setBulkModal("transfer"); }} className="text-xs text-zinc-300 hover:text-white flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-700 transition-colors">
                <ArrowRightLeft className="h-3 w-3" /> Transferir
              </button>
              <button onClick={() => { setBulkStatus(""); setBulkModal("status"); }} className="text-xs text-zinc-300 hover:text-white flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-700 transition-colors">
                <CheckSquare2 className="h-3 w-3" /> Alterar status
              </button>
              <button onClick={() => setTaskCreate({ open: true })} className="text-xs text-zinc-300 hover:text-white flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-700 transition-colors">
                <CalendarClock className="h-3 w-3" /> Criar tarefa
              </button>
              <button onClick={() => { setBulkStage(""); setBulkModal("stage"); }} className="text-xs text-zinc-300 hover:text-white flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-700 transition-colors">
                <MoveRight className="h-3 w-3" /> Mover para etapa
              </button>
              <button onClick={() => { setBulkPipelineId(""); setBulkModal("pipeline"); }} className="text-xs text-zinc-300 hover:text-white flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-700 transition-colors">
                <Layers className="h-3 w-3" /> Mover para fluxo
              </button>
              <button onClick={() => setBulkModal("export")} className="text-xs text-zinc-300 hover:text-white flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-700 transition-colors">
                <FileDown className="h-3 w-3" /> Exportar
              </button>
              <button onClick={() => { setBulkAddField("qualificacao"); setBulkAddValue(""); setBulkModal("addAlter"); }} className="text-xs text-zinc-300 hover:text-white flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-700 transition-colors">
                <Tag className="h-3 w-3" /> Adicionar ou Alterar
              </button>
            </div>
          )}
          <table className="w-full text-xs text-zinc-100">
            <thead>
              <tr className="bg-zinc-800 border-b border-zinc-700">
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleSelectAll}
                    className="cursor-pointer accent-primary h-3.5 w-3.5"
                  />
                </th>
                <th className="text-left px-3 py-2 font-semibold text-zinc-400 whitespace-nowrap">Etapa</th>
                <th className="text-left px-3 py-2 font-semibold text-zinc-400">Cliente</th>
                <th className="text-left px-3 py-2 font-semibold text-zinc-400">Nº</th>
                <th className="text-left px-3 py-2 font-semibold text-zinc-400">Problema</th>
                <th className="text-right px-3 py-2 font-semibold text-zinc-400 whitespace-nowrap">Valor</th>
                <th className="text-left px-3 py-2 font-semibold text-zinc-400">Próxima tarefa</th>
                <th className="text-center px-3 py-2 font-semibold text-zinc-400 whitespace-nowrap">Dias s/ interação</th>
                <th className="text-left px-3 py-2 font-semibold text-zinc-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {stages.flatMap((stage) =>
                (columns[stage.key] || []).map((ticket: any) => {
                  const value = Number(ticket.estimated_value || 0);
                  const problem = (ticket.description || ticket.problem_category || "").trim();
                  const stageColor = stage.color;
                  const pending = (ticket.tasks || []).filter((t: any) => t.status !== "concluida" && t.due_date);
                  const nextTask = pending.length > 0
                    ? pending.sort((a: any, b: any) => (a.due_date + (a.due_time || "")).localeCompare(b.due_date + (b.due_time || "")))[0]
                    : null;
                  const isChecked = selectedIds.has(ticket.id);
                  return (
                    <tr
                      key={ticket.id}
                      className={`border-b border-zinc-800 last:border-0 hover:bg-zinc-800/60 cursor-pointer transition-colors ${isChecked ? "bg-primary/5" : ""}`}
                      onClick={() => handleOpenTicket(ticket)}
                    >
                      <td className="px-3 py-2 w-8" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelect(ticket.id)}
                          className="cursor-pointer accent-primary h-3.5 w-3.5"
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stageColor }} />
                          <span style={{ color: stageColor }} className="font-medium">{stage.label}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 font-medium max-w-[140px] truncate">{ticket.clients?.name || "—"}</td>
                      <td className="px-3 py-2 text-zinc-400 whitespace-nowrap font-mono">{ticket.ticket_number}</td>
                      <td className="px-3 py-2 max-w-[180px] truncate text-zinc-400">{problem || "—"}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap font-bold tabular-nums" style={{ color: value > 0 ? stageColor : undefined }}>
                        {value > 0 ? `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td className="px-3 py-2 max-w-[200px]">
                        {nextTask ? (
                          <span className="flex items-center gap-1 text-zinc-300">
                            <CalendarClock className="h-3 w-3 text-zinc-500 shrink-0" />
                            <span className="truncate">{nextTask.title}</span>
                            <span className="text-zinc-500 shrink-0 tabular-nums">
                              {formatTaskDateTime(nextTask.due_date, nextTask.due_time)}
                            </span>
                          </span>
                        ) : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {(() => {
                          const d = daysSince(ticket.last_interaction_at);
                          const color = d >= 5 ? "text-red-400" : d >= 2 ? "text-amber-400" : "text-zinc-500";
                          return <span className={`font-mono font-semibold ${color}`}>{d === 999 ? "—" : `${d}d`}</span>;
                        })()}
                      </td>
                      <td className="px-3 py-2"><StatusBadge status={ticket.status} /></td>
                    </tr>
                  );
                })
              )}
              {stages.every((s) => (columns[s.key] || []).length === 0) && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-zinc-500">Nenhum ticket neste funil</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={multiContainerCollision}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div
            ref={scrollRef}
            className={`flex gap-3 overflow-x-auto pb-4 select-none rounded-xl bg-zinc-950 p-3 ${isGrabbing ? "cursor-grabbing" : "cursor-grab"}`}
            style={{ minHeight: "calc(100vh - 165px)" }}
            onMouseDown={(e) => {
              if (activeId) return;
              if (!scrollRef.current) return;
              grabState.current = { isDown: true, startX: e.pageX - scrollRef.current.offsetLeft, scrollLeft: scrollRef.current.scrollLeft };
              setIsGrabbing(true);
            }}
            onMouseLeave={() => { grabState.current.isDown = false; setIsGrabbing(false); }}
            onMouseUp={() => { grabState.current.isDown = false; setIsGrabbing(false); }}
            onMouseMove={(e) => {
              if (!grabState.current.isDown || !scrollRef.current) return;
              e.preventDefault();
              const x = e.pageX - scrollRef.current.offsetLeft;
              const walk = (x - grabState.current.startX) * 1.5;
              scrollRef.current.scrollLeft = grabState.current.scrollLeft - walk;
            }}
          >
            {stages.map((stage) => {
              const items = columns[stage.key] || [];
              const totalValue = items.reduce((s: number, t: any) => {
                const v = Number(t.estimated_value || 0) ||
                  (t.quotes || []).reduce((sq: number, q: any) => sq + Number(q.total || 0), 0);
                return s + v;
              }, 0);

              return (
                <StageColumn
                  key={stage.key}
                  stage={stage}
                  items={items}
                  totalValue={totalValue}
                  pipelineName={currentPipeline?.name ?? ""}
                  onQuickTask={handleQuickTask}
                  onClickTicket={handleOpenTicket}
                  onTaskClick={(ticket) => handleOpenTicket(ticket, "client-tasks")}
                  onNewTicket={() => setClientDialog(true)}
                  isAdmin={isAdmin}
                />
              );
            })}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeTicket ? (
              <div className="w-[260px] rotate-2 shadow-lg">
                <PipelineCard ticket={activeTicket} onQuickTask={() => {}} onClick={() => {}} isAdmin={isAdmin} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
        </>
      )}
      </div>

      <TaskCreateDialog
        open={taskCreate.open}
        onOpenChange={(open) => setTaskCreate({ ...taskCreate, open })}
        defaultTicketId={taskCreate.ticketId}
        defaultClientId={taskCreate.clientId}
      />

      <CrmSyncImportDialog open={syncOpen} onOpenChange={setSyncOpen} />
      <CrmBatchSyncDialog open={batchOpen} onOpenChange={setBatchOpen} />
      <PipelineExcelImportDialog open={excelImportOpen} onOpenChange={setExcelImportOpen} />
      <TicketDetailDialog ticket={detailTicket} open={!!detailTicket} onOpenChange={(o) => { if (!o) { setDetailTicket(null); setDetailInitialTab("info"); } }} initialTab={detailInitialTab} />

      {/* ── Modal: Transferir responsável ── */}
      <Dialog open={bulkModal === "transfer"} onOpenChange={(o) => !o && setBulkModal(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Transferir {selectedIds.size} negociação{selectedIds.size > 1 ? "ões" : ""}</DialogTitle></DialogHeader>
          <div className="py-2">
            <label className="text-xs text-zinc-400 block mb-1">Novo responsável</label>
            <select
              value={bulkTransferTo}
              onChange={(e) => setBulkTransferTo(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md text-xs text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Selecione um responsável...</option>
              {allUsers.map((u) => (
                <option key={u.user_id} value={u.user_id}>{u.full_name || u.email}</option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <button onClick={() => setBulkModal(null)} className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800">Cancelar</button>
            <button
              disabled={!bulkTransferTo || bulkLoading}
              onClick={() => bulkUpdate({ assigned_to: bulkTransferTo })}
              className="text-xs px-3 py-1.5 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {bulkLoading ? "Transferindo..." : "Transferir"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Alterar status ── */}
      <Dialog open={bulkModal === "status"} onOpenChange={(o) => !o && setBulkModal(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Alterar status de {selectedIds.size} negociação{selectedIds.size > 1 ? "ões" : ""}</DialogTitle></DialogHeader>
          <div className="py-2 flex flex-col gap-2">
            {[
              { value: "aberto", label: "Em andamento", dot: "#3b82f6" },
              { value: "fechado", label: "Vendida", dot: "#22c55e" },
              { value: "cancelado", label: "Perdida", dot: "#ef4444" },
              { value: "pausado", label: "Pausado", dot: "#f97316" },
            ].map((s) => (
              <label key={s.value} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${bulkStatus === s.value ? "border-primary bg-primary/10" : "border-zinc-700 hover:bg-zinc-800"}`}>
                <input type="radio" name="bulk-status" value={s.value} checked={bulkStatus === s.value} onChange={() => setBulkStatus(s.value)} className="accent-primary" />
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.dot }} />
                <span className="text-xs">{s.label}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <button onClick={() => setBulkModal(null)} className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800">Cancelar</button>
            <button
              disabled={!bulkStatus || bulkLoading}
              onClick={() => bulkUpdate({ status: bulkStatus })}
              className="text-xs px-3 py-1.5 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {bulkLoading ? "Alterando..." : "Alterar status"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Mover para etapa ── */}
      <Dialog open={bulkModal === "stage"} onOpenChange={(o) => !o && setBulkModal(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Mover {selectedIds.size} negociação{selectedIds.size > 1 ? "ões" : ""} para etapa</DialogTitle></DialogHeader>
          <div className="py-2 flex flex-col gap-2 max-h-64 overflow-y-auto">
            {stages.map((s) => (
              <label key={s.key} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${bulkStage === s.key ? "border-primary bg-primary/10" : "border-zinc-700 hover:bg-zinc-800"}`}>
                <input type="radio" name="bulk-stage" value={s.key} checked={bulkStage === s.key} onChange={() => setBulkStage(s.key)} className="accent-primary" />
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-xs">{s.label}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <button onClick={() => setBulkModal(null)} className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800">Cancelar</button>
            <button
              disabled={!bulkStage || bulkLoading}
              onClick={() => bulkUpdate({ pipeline_stage: bulkStage })}
              className="text-xs px-3 py-1.5 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {bulkLoading ? "Movendo..." : "Mover"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Mover para fluxo ── */}
      <Dialog open={bulkModal === "pipeline"} onOpenChange={(o) => !o && setBulkModal(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Mover {selectedIds.size} negociação{selectedIds.size > 1 ? "ões" : ""} para fluxo</DialogTitle></DialogHeader>
          <div className="py-2 flex flex-col gap-2">
            {pipelines.filter((p) => p.id !== currentPipeline?.id).map((p) => (
              <label key={p.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${bulkPipelineId === p.id ? "border-primary bg-primary/10" : "border-zinc-700 hover:bg-zinc-800"}`}>
                <input type="radio" name="bulk-pipeline" value={p.id} checked={bulkPipelineId === p.id} onChange={() => setBulkPipelineId(p.id)} className="accent-primary" />
                <span className="text-xs">{p.name}</span>
              </label>
            ))}
            {pipelines.filter((p) => p.id !== currentPipeline?.id).length === 0 && (
              <p className="text-xs text-zinc-500 text-center py-2">Nenhum outro fluxo disponível</p>
            )}
          </div>
          <DialogFooter>
            <button onClick={() => setBulkModal(null)} className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800">Cancelar</button>
            <button
              disabled={!bulkPipelineId || bulkLoading}
              onClick={() => bulkUpdate({ pipeline_id: bulkPipelineId })}
              className="text-xs px-3 py-1.5 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {bulkLoading ? "Movendo..." : "Mover para fluxo"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Exportar ── */}
      <Dialog open={bulkModal === "export"} onOpenChange={(o) => !o && setBulkModal(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-xs">
          <DialogHeader><DialogTitle className="text-sm">Exportar {selectedIds.size} negociação{selectedIds.size > 1 ? "ões" : ""}</DialogTitle></DialogHeader>
          <div className="py-2 flex flex-col gap-2">
            <button
              onClick={exportSelectedCsv}
              className="flex items-center gap-2 px-4 py-3 rounded-lg border border-zinc-700 hover:bg-zinc-800 transition-colors text-left"
            >
              <FileDown className="h-4 w-4 text-green-400" />
              <div>
                <div className="text-xs font-medium">CSV</div>
                <div className="text-[10px] text-zinc-500">Compatível com Excel, Sheets</div>
              </div>
            </button>
          </div>
          <DialogFooter>
            <button onClick={() => setBulkModal(null)} className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800">Fechar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Adicionar ou Alterar ── */}
      <Dialog open={bulkModal === "addAlter"} onOpenChange={(o) => !o && setBulkModal(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Adicionar ou Alterar — {selectedIds.size} negociação{selectedIds.size > 1 ? "ões" : ""}</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Campo</label>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { value: "qualificacao", label: "Qualificação" },
                  { value: "campanha", label: "Campanha" },
                  { value: "fonte", label: "Fonte" },
                  { value: "canal", label: "Canal" },
                ] as const).map((f) => (
                  <button
                    key={f.value}
                    onClick={() => { setBulkAddField(f.value); setBulkAddValue(""); }}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${bulkAddField === f.value ? "border-primary bg-primary/10 text-primary" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">
                {bulkAddField === "qualificacao" ? "Qualificação (1–5)" : bulkAddField === "campanha" ? "Campanha" : bulkAddField === "fonte" ? "Fonte / Origem" : "Canal"}
              </label>
              {bulkAddField === "qualificacao" ? (
                <select
                  value={bulkAddValue}
                  onChange={(e) => setBulkAddValue(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md text-xs text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Selecione...</option>
                  {["1","2","3","4","5"].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={bulkAddValue}
                  onChange={(e) => setBulkAddValue(e.target.value)}
                  placeholder={bulkAddField === "campanha" ? "Nome da campanha" : bulkAddField === "fonte" ? "Ex: Google, Indicação..." : "Ex: WhatsApp, Instagram..."}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md text-xs text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setBulkModal(null)} className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800">Cancelar</button>
            <button
              disabled={!bulkAddValue || bulkLoading}
              onClick={() => {
                const fieldMap: Record<string, string> = {
                  qualificacao: "priority",
                  campanha: "campanha",
                  fonte: "origin",
                  canal: "channel",
                };
                bulkUpdate({ [fieldMap[bulkAddField]]: bulkAddValue });
              }}
              className="text-xs px-3 py-1.5 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {bulkLoading ? "Salvando..." : "Aplicar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CrudDialog
        open={clientDialog}
        onOpenChange={setClientDialog}
        title="Novo Cliente"
        fields={[
          { name: "name", label: "Nome / Razão Social", required: true, placeholder: "Nome do cliente" },
          {
            name: "document_type",
            label: "Tipo Documento",
            type: "select" as const,
            options: [
              { value: "cpf", label: "CPF" },
              { value: "cnpj", label: "CNPJ" },
            ],
          },
          { name: "document", label: "CPF / CNPJ", placeholder: "000.000.000-00" },
          { name: "phone", label: "Telefone", type: "tel" as const, placeholder: "(11) 99999-9999" },
          { name: "whatsapp", label: "WhatsApp", type: "tel" as const, placeholder: "(11) 99999-9999" },
          { name: "email", label: "Email", type: "email" as const },
          { name: "contact_person", label: "Pessoa de Contato", placeholder: "Nome do contato" },
          {
            name: "pipeline_stage",
            label: "Etapa do Pipeline",
            type: "select" as const,
            required: true,
            options: stages.map((s) => ({ value: s.key, label: s.label })),
          },
          {
            name: "model_id",
            label: "Equipamento",
            type: "select" as const,
            required: true,
            options: equipmentModels?.map((m: any) => ({ value: m.id, label: m.name })) || [],
          },
          { name: "serial_number", label: "Número de Série", placeholder: "Ex: RF-2024-00001" },
          { name: "title", label: "Título do Atendimento", placeholder: "Descrição breve do atendimento" },
          { name: "address", label: "Endereço" },
          { name: "city", label: "Cidade" },
          { name: "state", label: "Estado" },
          { name: "zip_code", label: "CEP", placeholder: "00000-000" },
          { name: "notes", label: "Observações", type: "textarea" as const },
        ]}
        onSubmit={async (values) => {
          const { pipeline_stage, model_id, title, serial_number, ...clientData } = values;

          if (!model_id) {
            toast.error("Selecione um equipamento para criar o card no pipeline");
            return;
          }

          const normalizedContacts = [normalizePhone(clientData.phone), normalizePhone(clientData.whatsapp)].filter(Boolean);
          let client: any = null;

          if (normalizedContacts.length > 0) {
            const filters = normalizedContacts.flatMap((number) => [
              `phone.ilike.%${number}%`,
              `whatsapp.ilike.%${number}%`,
            ]);

            const { data: candidateClients, error: candidateError } = await supabase
              .from("clients")
              .select("id, name, phone, whatsapp")
              .or(filters.join(","))
              .limit(20);

            if (candidateError) throw candidateError;

            client =
              candidateClients?.find((candidate) => {
                const candidatePhones = [normalizePhone(candidate.phone), normalizePhone(candidate.whatsapp)].filter(Boolean);
                return candidatePhones.some((phone) => normalizedContacts.includes(phone));
              }) ?? null;
          }

          if (!client) {
            client = await createClient.mutateAsync({ ...clientData, created_by: user?.id } as any);
          }

          const { data: newEquipment, error: eqError } = await supabase
            .from("equipments")
            .insert({ model_id, client_id: client.id, serial_number: serial_number || null })
            .select("*, equipment_models(name)")
            .single();
          if (eqError) throw eqError;

          const newTicket = await createTicket.mutateAsync({
            client_id: client.id,
            equipment_id: newEquipment.id,
            ticket_type: "chamado_tecnico",
            title: title || `Atendimento - ${clientData.name}`,
            ticket_number: "",
            pipeline_id: currentPipeline?.id,
            pipeline_stage: pipeline_stage || "sem_atendimento",
            created_by: user?.id,
          } as any);

          await qc.refetchQueries({ queryKey: ["pipeline-tickets"] });
          await qc.invalidateQueries({ queryKey: ["equipments"] });
          toast.success(client.name === clientData.name ? "Card adicionado ao pipeline" : `Card vinculado ao cliente existente: ${client.name}`);

          if (newTicket) {
            setDetailTicket({
              ...newTicket,
              clients: { name: client.name || clientData.name },
              equipments: newEquipment,
            });
          }
        }}
      />
    </div>
  );
};

const STATUS_LABELS: Record<string, { label: string; dot: string }> = {
  aberto:    { label: "Em andamento", dot: "#3b82f6" },
  fechado:   { label: "Vendida",      dot: "#22c55e" },
  cancelado: { label: "Perdida",      dot: "#ef4444" },
  pausado:   { label: "Pausado",      dot: "#f97316" },
};

const TICKET_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  chamado_tecnico: { label: "Chamado Técnico", color: "bg-blue-100 text-blue-800" },
  garantia: { label: "Garantia", color: "bg-orange-100 text-orange-800" },
  assistencia: { label: "Assistência", color: "bg-purple-100 text-purple-800" },
  pos_venda: { label: "Pós Venda", color: "bg-green-100 text-green-800" },
  negociacao: { label: "Negociação", color: "bg-indigo-100 text-indigo-800" },
  comprar_acessorios: { label: "Acessórios", color: "bg-pink-100 text-pink-800" },
};

interface QuoteRef {
  label: string;
  quoteId: string;
  status: string;
  route: string;
}

function getQuoteRefs(quotes: any[] | null): QuoteRef[] {
  if (!quotes || quotes.length === 0) return [];
  return quotes.map((q: any) => {
    const hasPa = !!q.service_request_id;
    const hasPg = !!q.warranty_claim_id;
    const label = hasPa ? `PA ${q.quote_number}` : hasPg ? `PG ${q.quote_number}` : `Orç ${q.quote_number}`;
    const route = hasPa
      ? `/pedidos-acessorios/${q.service_request_id}`
      : hasPg
      ? `/pedidos-garantia/${q.warranty_claim_id}`
      : `/orcamentos/${q.id}`;
    return { label, quoteId: q.id, status: q.status, route };
  });
}

function StageColumn({
  stage,
  items,
  totalValue,
  pipelineName,
  onQuickTask,
  onClickTicket,
  onTaskClick,
  onNewTicket,
  isAdmin,
}: {
  stage: { key: string; label: string; color: string };
  items: any[];
  totalValue: number;
  pipelineName: string;
  onQuickTask: (ticketId: string, clientId: string) => void;
  onClickTicket: (ticket: any) => void;
  onTaskClick: (ticket: any) => void;
  onNewTicket: () => void;
  isAdmin: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  const [showStats, setShowStats] = useState(false);

  const stats = useMemo(() => {
    const now = new Date();
    const emAndamento = items.filter((t: any) => t.status === "em_andamento").length;
    const esfriando   = items.filter((t: any) => t._isDelayed).length;
    const semTarefas  = items.filter((t: any) => {
      const pending = (t.tasks || []).filter((tk: any) => tk.status !== "concluida");
      return pending.length === 0;
    }).length;
    const atrasadas = items.filter((t: any) =>
      (t.tasks || []).some((tk: any) =>
        tk.status !== "concluida" && tk.due_date && new Date(tk.due_date) < now
      )
    ).length;
    const semProdutos = items.filter((t: any) => !(t.quotes?.length > 0)).length;
    return { emAndamento, esfriando, semTarefas, atrasadas, semProdutos };
  }, [items]);

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[230px] rounded-xl border border-zinc-800 bg-zinc-900 flex flex-col transition-all ${
        isOver ? "ring-2 ring-primary/40" : ""
      }`}
      style={{ borderTop: `3px solid ${stage.color}` }}
    >
      <div className="px-3 pt-2.5 pb-2 border-b border-zinc-800">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold flex-1 truncate text-zinc-100">{stage.label}</span>
          {totalValue > 0 && (
            <span className="text-[10px] font-semibold shrink-0 tabular-nums" style={{ color: stage.color }}>
              {`R$ ${totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </span>
          )}
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-700 text-zinc-300 shrink-0">
            {items.length}
          </span>
          <button
            className={`flex items-center gap-0.5 h-5 px-1.5 rounded text-[9px] font-semibold transition-colors shrink-0 ${
              showStats ? "bg-zinc-600 text-zinc-100" : "hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
            }`}
            onClick={() => setShowStats((v) => !v)}
            title="Estatísticas da etapa"
          >
            <TrendingUp className="h-3 w-3" />
            <ChevronDown className={`h-2.5 w-2.5 transition-transform ${showStats ? "rotate-180" : ""}`} />
          </button>
        </div>
        {showStats && (
          <div className="mt-2 space-y-1 text-[10px]">
            {stage.key === "concluido" ? (
              <div className="flex items-center justify-between bg-zinc-800 rounded px-2 py-1">
                <span className="text-zinc-400">Resolvido</span>
                <span className="font-bold text-green-400">{items.length}</span>
              </div>
            ) : (
              [
                { label: "Total de cards",      value: items.length,      color: "text-zinc-100"   },
                { label: "Em andamento",        value: stats.emAndamento, color: "text-blue-400"   },
                { label: "Esfriando",           value: stats.esfriando,   color: "text-amber-400"  },
                { label: "Sem tarefas",         value: stats.semTarefas,  color: "text-zinc-400"   },
                { label: "Tarefas atrasadas",   value: stats.atrasadas,   color: "text-red-400"    },
                { label: "Sem prod./serviços",  value: stats.semProdutos, color: "text-purple-400" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between bg-zinc-800 rounded px-2 py-1">
                  <span className="text-zinc-400">{label}</span>
                  <span className={`font-bold ${color}`}>{value}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-[60px]">
        <SortableContext items={items.map((t: any) => t.id)} strategy={verticalListSortingStrategy}>
          {items.map((ticket: any) => (
            <SortableCard
              key={ticket.id}
              ticket={ticket}
              pipelineName={pipelineName}
              stageKey={stage.key}
              onQuickTask={() => onQuickTask(ticket.id, ticket.client_id)}
              onClick={() => onClickTicket(ticket)}
              onTaskClick={() => onTaskClick(ticket)}
              isAdmin={isAdmin}
            />
          ))}
        </SortableContext>
        {items.length === 0 && (
          <p className="text-[11px] text-zinc-600 text-center py-8">Nenhum atendimento</p>
        )}
      </div>

      <button
        onClick={onNewTicket}
        className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors rounded-b-xl border-t border-zinc-800 w-full"
      >
        <span className="text-base leading-none">+</span> Nova negociação
      </button>
    </div>
  );
}

function SortableCard({ ticket, pipelineName, stageKey, onQuickTask, onClick, onTaskClick, isAdmin }: { ticket: any; pipelineName: string; stageKey: string; onQuickTask: () => void; onClick: () => void; onTaskClick: () => void; isAdmin: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ticket.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <PipelineCard ticket={ticket} pipelineName={pipelineName} stageKey={stageKey} onQuickTask={onQuickTask} onClick={onClick} onTaskClick={onTaskClick} isAdmin={isAdmin} />
    </div>
  );
}

const QUOTE_STATUS_OPTIONS = [
  { value: "aguardando_aprovacao", label: "Em Análise" },
  { value: "aprovado", label: "Aprovado" },
  { value: "reprovado", label: "Reprovado" },
];

function getLastOrderTag(quotes: any[]): "ORÇ" | "PA" | "PG" | null {
  if (!quotes || quotes.length === 0) return null;
  const last = [...quotes].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )[0];
  if (last.warranty_claim_id) return "PG";
  if (last.service_request_id) return "PA";
  return "ORÇ";
}

function getLastOrderRoute(quotes: any[]): string | null {
  if (!quotes || quotes.length === 0) return null;
  const last = [...quotes].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )[0];
  if (last.warranty_claim_id) return `/pedidos-garantia/${last.warranty_claim_id}`;
  if (last.service_request_id) return `/pedidos-acessorios/${last.service_request_id}`;
  return null;
}

function formatTaskDateTime(due_date: string | null, due_time: string | null): string {
  if (!due_date) return "";
  const [y, m, d] = due_date.split("-");
  const date = `${d}/${m}`;
  if (due_time) {
    const [h, min] = due_time.split(":");
    return `${date} ${h}:${min}`;
  }
  return date;
}

function PipelineCard({ ticket, pipelineName, stageKey, onQuickTask, onClick, onTaskClick, isAdmin }: { ticket: any; pipelineName: string; stageKey: string; onQuickTask: () => void; onClick: () => void; onTaskClick: () => void; isAdmin: boolean }) {
  const navigate = useNavigate();
  const typeInfo = TICKET_TYPE_LABELS[ticket.ticket_type] || { label: ticket.ticket_type, color: "bg-zinc-700 text-zinc-300" };
  const unreadWpp = ticket._unreadWhatsapp || 0;
  const unreadIg = ticket._unreadInstagram || 0;
  const isNewLead = ticket._isNewLead || false;
  const lastOrderTag = getLastOrderTag(ticket.quotes || []);
  const isDelayed = ticket._isDelayed;
  const days = ticket._daysSinceInteraction ?? 0;
  const stageColor: string = ticket._stageColor ?? "#6366f1";
  const statusInfo = STATUS_LABELS[ticket.status] ?? { label: ticket.status, dot: "#71717a" };
  const isVendas = pipelineName.toLowerCase().includes("vend");
  // Usa estimated_value ou, se vazio, soma os totais dos orçamentos
  const value = Number(ticket.estimated_value || 0) ||
    (ticket.quotes || []).reduce((s: number, q: any) => s + Number(q.total || 0), 0);
  const problem = isVendas
    ? (ticket.objecao || "").trim()
    : (ticket.description || ticket.problem_category || "").trim();
  const problemLabel = isVendas ? "Objeção" : null;

  // Próxima tarefa pendente com data mais próxima
  const nextTask = useMemo(() => {
    const pending = (ticket.tasks || []).filter((t: any) => t.status !== "concluida" && t.due_date);
    if (pending.length === 0) return null;
    return pending.sort((a: any, b: any) => {
      const da = a.due_date + (a.due_time || "");
      const db = b.due_date + (b.due_time || "");
      return da.localeCompare(db);
    })[0];
  }, [ticket.tasks]);

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border cursor-pointer transition-all overflow-hidden hover:brightness-110 ${
        isNewLead
          ? "bg-[#0b1a12] border-[#166534]"
          : unreadWpp > 0
          ? "bg-[#1f1208] border-[#7c2d12]"
          : "bg-zinc-800 border-zinc-700"
      }`}
      style={{ borderLeft: `3px solid ${stageColor}` }}
    >
      {isNewLead && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 border-b border-[#166534]/50">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-dot-pulse" />
          <span className="text-[9px] font-bold text-green-400 uppercase tracking-wide">
            Novo lead
          </span>
        </div>
      )}
      {unreadWpp > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 border-b border-[#7c2d12]/50">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-dot-pulse" />
          <span className="text-[9px] font-bold text-orange-400 uppercase tracking-wide">
            {unreadWpp} msg não {unreadWpp === 1 ? "lida" : "lidas"}
          </span>
        </div>
      )}
      {unreadIg > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 border-b border-purple-900/50">
          <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-dot-pulse" />
          <span className="text-[9px] font-bold text-purple-400 uppercase tracking-wide">
            {unreadIg} msg Instagram não {unreadIg === 1 ? "lida" : "lidas"}
          </span>
        </div>
      )}

      <div className="p-2.5 space-y-1">
        {/* Linha 1: tipo + tags + status + prioridade */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
          {lastOrderTag && (lastOrderTag !== "ORÇ" || isVendas) && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
              lastOrderTag === "ORÇ"
                ? "bg-indigo-900/60 text-indigo-300 border-indigo-700/50"
                : "bg-blue-900/60 text-blue-300 border-blue-700/50"
            }`}>
              {lastOrderTag}
            </span>
          )}
          {stageKey === "concluido" ? (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-green-900/60 text-green-300 border border-green-700/50 flex items-center gap-0.5">
              ✓ Resolvido
            </span>
          ) : isDelayed ? (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 border border-amber-700/50 flex items-center gap-0.5">
              ⚠ Esfriando {days}d
            </span>
          ) : (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1 bg-zinc-700/60 text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: statusInfo.dot }} />
              {statusInfo.label}
            </span>
          )}
          {ticket.channel && (
            <ChannelIcon channel={ticket.channel} size={11} className="opacity-80" />
          )}
          <span className="ml-auto">
            <StatusBadge status={ticket.priority} />
          </span>
        </div>

        {/* Linha 2: nome + valor */}
        <div className="flex items-start justify-between gap-1">
          <p className="text-xs font-semibold line-clamp-1 text-zinc-100 flex-1 min-w-0">
            {ticket.clients?.name || ticket.title || "—"}
          </p>
          <span className="text-[10px] font-bold shrink-0 tabular-nums" style={{ color: value > 0 ? stageColor : "#52525b" }}>
            {value > 0
              ? `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "—"}
          </span>
        </div>

        {/* Linha 3: número · problema/objeção */}
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[9px] font-mono text-zinc-500 shrink-0">{ticket.ticket_number}</span>
          {problem ? (
            <>
              <span className="text-[9px] text-zinc-600">·</span>
              {problemLabel && (
                <span className="text-[9px] font-bold text-yellow-500 shrink-0">{problemLabel}:</span>
              )}
              <span className={`text-[9px] truncate ${problemLabel ? "text-yellow-300/80" : "text-zinc-400"}`}>
                {problem.slice(0, 40)}
              </span>
            </>
          ) : problemLabel ? (
            <>
              <span className="text-[9px] text-zinc-600">·</span>
              <span className="text-[9px] text-yellow-700/60 italic">sem objeção</span>
            </>
          ) : null}
        </div>

        {/* Linha 4: criar tarefa + próxima tarefa agendada */}
        <div className="flex items-center gap-1.5 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1 text-[9px] text-zinc-500 hover:text-zinc-300 gap-0.5 -ml-1 shrink-0"
            onClick={(e) => { e.stopPropagation(); onQuickTask(); }}
            title="Criar tarefa"
          >
            <ListTodo className="h-2.5 w-2.5" /> Criar tarefa
          </Button>
          {ticket.channel === "instagram" && ticket.client_id && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[9px] gap-0.5 shrink-0 text-purple-400 hover:text-purple-300 hover:bg-purple-900/30"
              onClick={(e) => { e.stopPropagation(); navigate(`/chat?ig_client=${ticket.client_id}`); }}
              title="Abrir chat Instagram"
            >
              <ChannelIcon channel="instagram" size={10} /> Chat
            </Button>
          )}
          {nextTask && (
            <button
              className="flex items-center gap-1 min-w-0 flex-1 bg-zinc-700/40 hover:bg-zinc-600/50 rounded px-1.5 py-0.5 transition-colors text-left"
              onClick={(e) => { e.stopPropagation(); onTaskClick(); }}
            >
              <CalendarClock className="h-2.5 w-2.5 text-zinc-400 shrink-0" />
              <span className="text-[9px] text-zinc-300 truncate flex-1">{nextTask.title}</span>
              <span className="text-[9px] text-zinc-500 shrink-0 tabular-nums">
                {formatTaskDateTime(nextTask.due_date, nextTask.due_time)}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default CrmPipelinePage;
