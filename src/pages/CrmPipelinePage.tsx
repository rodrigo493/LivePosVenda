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
  MessageSquare,
  Pencil,
} from "lucide-react";
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
import { PageHeader } from "@/components/layout/PageHeader";
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
import { useAuth } from "@/hooks/useAuth";
import { useCreateClient } from "@/hooks/useClients";
import { useCreateTicket } from "@/hooks/useTickets";
import { useEquipments } from "@/hooks/useEquipments";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { TaskCreateDialog } from "@/components/tasks/TaskCreateDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  const [viewAll, setViewAll] = useState(true);

  const { data: pipelines = [] } = usePipelines();
  const [currentPipeline, setCurrentPipeline] = useState<Pipeline | null>(null);

  useEffect(() => {
    if (pipelines.length > 0 && !currentPipeline) {
      setCurrentPipeline(pipelines[0]);
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

  const { data: tickets, isLoading } = usePipelineTickets(currentPipeline?.id, viewAll ? undefined : user?.id);
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
  const moveStage = useMovePipelineStage();
  const createClient = useCreateClient();
  const createTicket = useCreateTicket();
  const { data: equipments } = useEquipments();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [taskCreate, setTaskCreate] = useState<{ open: boolean; ticketId?: string; clientId?: string }>({ open: false });
  const [clientDialog, setClientDialog] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [excelImportOpen, setExcelImportOpen] = useState(false);
  const [detailTicket, setDetailTicket] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // ── Edit mode ──────────────────────────────────────────────────
  interface LocalAutomation {
    id: string;
    trigger_type: string;
    action_type: AutomationActionType;
    action_config: Record<string, unknown>;
    is_active: boolean;
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
  const grabState = useRef({ isDown: false, startX: 0, scrollLeft: 0 });

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

      const days = daysSince(t.last_interaction_at);
      const stageDelay = delayMap[t.pipeline_stage] ?? 2;
      const enriched = {
        ...t,
        _daysSinceInteraction: days,
        _isDelayed: days >= stageDelay,
        _isNoContact: t.pipeline_stage === "sem_atendimento",
        _unreadWhatsapp: whatsappUnread.get(t.client_id) || 0,
        _lastWhatsappAt: whatsappLastActivity.get(t.client_id) || null,
      };
      const target = map[t.pipeline_stage] ? t.pipeline_stage : "sem_atendimento";
      map[target].push(enriched);
    });

    Object.values(map).forEach((arr) =>
      arr.sort((a: any, b: any) => {
        if (!!a._unreadWhatsapp !== !!b._unreadWhatsapp) return a._unreadWhatsapp ? -1 : 1;
        if (a._lastWhatsappAt || b._lastWhatsappAt) {
          if (!a._lastWhatsappAt) return 1;
          if (!b._lastWhatsappAt) return -1;
          return new Date(b._lastWhatsappAt).getTime() - new Date(a._lastWhatsappAt).getTime();
        }
        if (a._isDelayed !== b._isDelayed) return a._isDelayed ? -1 : 1;
        return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
      })
    );

    return map;
  }, [tickets, delayMap, searchTerm, stages, whatsappUnread, whatsappLastActivity]);

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

    if (!over || !source) {
      setActiveId(null);
      setColumns(grouped);
      dragSourceRef.current = null;
      return;
    }

    setColumns((currentColumns) => {
      const ticketId = active.id as string;
      const overId = over.id as string;

      // Where is the card NOW? (dragOver may have already moved it)
      const currentContainer = findContainer(currentColumns, ticketId);
      if (!currentContainer) {
        dragSourceRef.current = null;
        setTimeout(() => setActiveId(null), 0);
        return grouped;
      }

      let finalColumns = currentColumns;
      let targetStage = currentContainer;
      const items = currentColumns[currentContainer];
      let position = items.findIndex((t: any) => t.id === ticketId) + 1; // 1-indexed

      // Handle same-container reorder (only if over is another card in the same container)
      if (!stageKeySet.has(overId) && overId !== ticketId) {
        const overContainer = findContainer(currentColumns, overId);
        if (overContainer === currentContainer) {
          const oldIndex = items.findIndex((t: any) => t.id === ticketId);
          const newIndex = items.findIndex((t: any) => t.id === overId);
          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            const reordered = arrayMove(items, oldIndex, newIndex);
            finalColumns = { ...currentColumns, [currentContainer]: reordered };
            position = newIndex + 1;
          }
        }
      }

      // Check if anything actually changed from original
      const stageChanged = targetStage !== source.stage;
      const positionChanged = position !== source.index + 1;

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

      dragSourceRef.current = null;
      setTimeout(() => setActiveId(null), 0);
      return finalColumns;
    });
  }, [grouped, moveStage, stageKeySet, currentPipeline]);

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

  return (
    <div>
      <PageHeader
        title="CRM Pipeline"
        description="Gestão visual dos atendimentos da assistência técnica"
        icon={Kanban}
        action={
          <div className="flex gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => setClientDialog(true)}>
              <UserPlus className="h-4 w-4" /> Novo Cliente
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBatchOpen(true)}>
              <ClipboardPaste className="h-4 w-4 mr-1" /> Sincronizar em lote
            </Button>
            <Button variant="outline" size="sm" onClick={() => setExcelImportOpen(true)}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Importar Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSyncOpen(true)}>
              <Upload className="h-4 w-4 mr-1" /> Importar CSV
            </Button>
            <Button variant={viewAll ? "default" : "outline"} size="sm" onClick={() => setViewAll(!viewAll)}>
              {viewAll ? "Todos" : "Meus"}
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-2 mb-3">
        <span className="font-semibold text-sm">{currentPipeline?.name ?? "Pipeline CRM"}</span>
        {!isEditing && (
          <FunnelSwitcher
            currentPipelineId={currentPipeline?.id ?? null}
            onSelect={setCurrentPipeline}
          />
        )}
        {isAdmin && !isEditing && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={enterEditMode}
              disabled={!currentPipeline}
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar funil
            </Button>
            <FunnelManagerDropdown
              currentPipeline={currentPipeline}
              onPipelineCreated={setCurrentPipeline}
            />
          </>
        )}
      </div>

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
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar cliente, nº ou título..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {!currentPipeline && !isLoading && pipelines.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground text-sm">Sem acesso ao CRM. Solicite acesso ao administrador.</div>
      ) : isLoading ? (
        <div className="p-8 text-center text-muted-foreground text-sm">Carregando pipeline...</div>
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
            className={`flex gap-3 overflow-x-auto pb-4 select-none ${isGrabbing ? "cursor-grabbing" : "cursor-grab"}`}
            style={{ minHeight: "calc(100vh - 200px)" }}
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
              const totalValue = items.reduce((s: number, t: any) => s + Number(t.estimated_value || 0), 0);

              return (
                <StageColumn
                  key={stage.key}
                  stage={stage}
                  items={items}
                  totalValue={totalValue}
                  onQuickTask={handleQuickTask}
                  onClickTicket={setDetailTicket}
                />
              );
            })}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeTicket ? (
              <div className="w-[260px] rotate-2 shadow-lg">
                <PipelineCard ticket={activeTicket} onQuickTask={() => {}} onClick={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
        </>
      )}

      <TaskCreateDialog
        open={taskCreate.open}
        onOpenChange={(open) => setTaskCreate({ ...taskCreate, open })}
        defaultTicketId={taskCreate.ticketId}
        defaultClientId={taskCreate.clientId}
      />

      <CrmSyncImportDialog open={syncOpen} onOpenChange={setSyncOpen} />
      <CrmBatchSyncDialog open={batchOpen} onOpenChange={setBatchOpen} />
      <PipelineExcelImportDialog open={excelImportOpen} onOpenChange={setExcelImportOpen} />
      <TicketDetailDialog ticket={detailTicket} open={!!detailTicket} onOpenChange={(o) => !o && setDetailTicket(null)} />

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
            name: "equipment_id",
            label: "Equipamento",
            type: "select" as const,
            required: true,
            options:
              equipments?.map((e: any) => ({
                value: e.id,
                label: e.equipment_models?.name || "Equipamento",
              })) || [],
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
          const { pipeline_stage, equipment_id, title, serial_number, ...clientData } = values;

          if (!equipment_id) {
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

          const newTicket = await createTicket.mutateAsync({
            client_id: client.id,
            equipment_id,
            ticket_type: "chamado_tecnico",
            title: title || `Atendimento - ${clientData.name}`,
            ticket_number: "",
            pipeline_id: currentPipeline?.id,
            pipeline_stage: pipeline_stage || "sem_atendimento",
            created_by: user?.id,
          } as any);

          await qc.refetchQueries({ queryKey: ["pipeline-tickets"] });
          toast.success(client.name === clientData.name ? "Card adicionado ao pipeline" : `Card vinculado ao cliente existente: ${client.name}`);

          if (serial_number && equipment_id) {
            await supabase.from("equipments").update({ serial_number }).eq("id", equipment_id);
          }

          if (newTicket) {
            setDetailTicket({
              ...newTicket,
              clients: { name: client.name || clientData.name },
              equipments: equipments?.find((e: any) => e.id === equipment_id) || null,
            });
          }
        }}
      />
    </div>
  );
};

const TICKET_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  chamado_tecnico: { label: "Chamado Técnico", color: "bg-blue-100 text-blue-800" },
  garantia: { label: "Garantia", color: "bg-orange-100 text-orange-800" },
  assistencia: { label: "Assistência", color: "bg-purple-100 text-purple-800" },
  pos_venda: { label: "Pós Venda", color: "bg-green-100 text-green-800" },
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
  onQuickTask,
  onClickTicket,
}: {
  stage: { key: string; label: string; color: string };
  items: any[];
  totalValue: number;
  onQuickTask: (ticketId: string, clientId: string) => void;
  onClickTicket: (ticket: any) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-[280px] rounded-xl border bg-card flex flex-col transition-all ${
        isOver ? "ring-2 ring-primary/50" : ""
      }`}
    >
      <div className="p-3 border-b">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
            <span className="text-xs font-semibold">{stage.label}</span>
          </div>
          <Badge variant="secondary" className="text-[10px] h-5">
            {items.length}
          </Badge>
        </div>
        {totalValue > 0 && (
          <span className="text-[10px] text-muted-foreground">
            R$ {totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-[60px]">
        <SortableContext items={items.map((t: any) => t.id)} strategy={verticalListSortingStrategy}>
          {items.map((ticket: any) => (
            <SortableCard
              key={ticket.id}
              ticket={ticket}
              onQuickTask={() => onQuickTask(ticket.id, ticket.client_id)}
              onClick={() => onClickTicket(ticket)}
            />
          ))}
        </SortableContext>
        {items.length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-8">Nenhum atendimento</p>
        )}
      </div>
    </div>
  );
}

function SortableCard({ ticket, onQuickTask, onClick }: { ticket: any; onQuickTask: () => void; onClick: () => void }) {
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
      <PipelineCard ticket={ticket} onQuickTask={onQuickTask} onClick={onClick} />
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

function PipelineCard({ ticket, onQuickTask, onClick }: { ticket: any; onQuickTask: () => void; onClick: () => void }) {
  const typeInfo = TICKET_TYPE_LABELS[ticket.ticket_type] || { label: ticket.ticket_type, color: "bg-muted text-muted-foreground" };
  const unreadWpp = ticket._unreadWhatsapp || 0;
  const lastOrderTag = getLastOrderTag(ticket.quotes || []);

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border cursor-pointer hover:shadow-md transition-shadow overflow-hidden ${
        unreadWpp > 0
          ? "bg-[#f97316]/[0.06] border-[#c2410c] animate-unread-pulse"
          : "bg-background"
      }`}
    >
      {unreadWpp > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[#c2410c]/30">
          <span className="h-1.5 w-1.5 rounded-full bg-[#c2410c] animate-dot-pulse" />
          <span className="text-[10px] font-bold text-[#f97316] uppercase tracking-wide">
            {unreadWpp} {unreadWpp === 1 ? "mensagem não lida" : "mensagens não lidas"}
          </span>
        </div>
      )}
      <div className="p-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1">
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${typeInfo.color}`}>{typeInfo.label}</span>
            {lastOrderTag && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">
                {lastOrderTag}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadWpp > 0 && (
              <span className="flex items-center gap-0.5 bg-[#c2410c] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-2.5 w-2.5">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                {unreadWpp}
              </span>
            )}
            <StatusBadge status={ticket.priority} />
          </div>
        </div>

        <p className="text-xs font-semibold line-clamp-1">{ticket.clients?.name || "—"}</p>
        {(ticket.description || ticket.problem_category) && (
          <span className="inline-block text-[10px] font-medium bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded line-clamp-1 mb-1">
            {ticket.description || ticket.problem_category}
          </span>
        )}

        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[9px] font-mono text-muted-foreground">{ticket.ticket_number}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onQuickTask();
            }}
            title="Criar tarefa"
          >
            <ListTodo className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default CrmPipelinePage;
