import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Kanban,
  ListTodo,
  Upload,
  ClipboardPaste,
  UserPlus,
  Search,
  FileSpreadsheet,
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
import { usePipelineTickets, useMovePipelineStage, PIPELINE_STAGES } from "@/hooks/usePipeline";
import { usePipelineSettings, getDelayMap } from "@/hooks/usePipelineSettings";
import { useAuth } from "@/hooks/useAuth";
import { useCreateTask } from "@/hooks/useTasks";
import { useCreateClient } from "@/hooks/useClients";
import { useCreateTicket } from "@/hooks/useTickets";
import { useEquipments } from "@/hooks/useEquipments";
import { CrudDialog } from "@/components/shared/CrudDialog";
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

const stageKeySet = new Set<string>(PIPELINE_STAGES.map((s) => s.key));

// Custom collision: try sortable items first (closestCorners), then fall back
// to droppable containers (rectIntersection) so empty columns are reachable.
const multiContainerCollision: CollisionDetection = (args) => {
  // First check pointer-within for precise hits
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    // Prefer sortable items (tickets) over droppable containers (stages)
    const itemHit = pointerCollisions.find((c) => !stageKeySet.has(c.id as string));
    if (itemHit) return [itemHit];
    return pointerCollisions;
  }

  // Fall back to rect intersection (catches empty columns)
  const rectCollisions = rectIntersection(args);
  if (rectCollisions.length > 0) return rectCollisions;

  // Last resort
  return closestCorners(args);
};

function findContainer(columns: Record<string, any[]>, id: string): string | null {
  if (id in columns) return id;
  for (const [stage, items] of Object.entries(columns)) {
    if (items.some((t: any) => t.id === id)) return stage;
  }
  return null;
}

const CrmPipelinePage = () => {
  const { user, roles } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = roles.includes("admin");
  const [viewAll, setViewAll] = useState(isAdmin);
  const { data: tickets, isLoading } = usePipelineTickets(viewAll ? undefined : user?.id);
  const { data: stageConfigs } = usePipelineSettings();
  const delayMap = useMemo(() => getDelayMap(stageConfigs), [stageConfigs]);
  const moveStage = useMovePipelineStage();
  const createTask = useCreateTask();
  const createClient = useCreateClient();
  const createTicket = useCreateTicket();
  const { data: equipments } = useEquipments();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; ticketId?: string; clientId?: string }>({ open: false });
  const [clientDialog, setClientDialog] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [excelImportOpen, setExcelImportOpen] = useState(false);
  const [detailTicket, setDetailTicket] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
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

  useEffect(() => {
    const openTicketId = searchParams.get("open_ticket");
    if (openTicketId && tickets?.length) {
      const found = tickets.find((t: any) => t.id === openTicketId);
      if (found) {
        setDetailTicket(found);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, tickets, setSearchParams]);

  // Build grouped data from server tickets
  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    PIPELINE_STAGES.forEach((s) => (map[s.key] = []));
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
      };
      const target = map[t.pipeline_stage] ? t.pipeline_stage : "sem_atendimento";
      map[target].push(enriched);
    });

    Object.values(map).forEach((arr) =>
      arr.sort((a: any, b: any) => {
        if (a._isDelayed !== b._isDelayed) return a._isDelayed ? -1 : 1;
        return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
      })
    );

    return map;
  }, [tickets, delayMap, searchTerm]);

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
          { id: ticketId, stage: targetStage, position },
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
  }, [grouped, moveStage]);

  const handleQuickTask = (ticketId: string, clientId: string) => {
    setTaskDialog({ open: true, ticketId, clientId });
  };

  const taskFields = [
    { name: "title", label: "Título", required: true, placeholder: "Ex: Ligar para cliente" },
    { name: "description", label: "Descrição", type: "textarea" as const },
    { name: "due_date", label: "Vencimento", type: "date" as const },
    {
      name: "priority",
      label: "Prioridade",
      type: "select" as const,
      options: [
        { value: "baixa", label: "Baixa" },
        { value: "media", label: "Média" },
        { value: "alta", label: "Alta" },
        { value: "urgente", label: "Urgente" },
      ],
    },
  ];

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
            {isAdmin && (
              <Button variant={viewAll ? "default" : "outline"} size="sm" onClick={() => setViewAll(!viewAll)}>
                {viewAll ? "Todos" : "Meus"}
              </Button>
            )}
          </div>
        }
      />

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

      {isLoading ? (
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
            {(stageConfigs || PIPELINE_STAGES).map((stage) => {
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

      <CrudDialog
        open={taskDialog.open}
        onOpenChange={(open) => setTaskDialog({ ...taskDialog, open })}
        title="Nova Tarefa"
        fields={taskFields}
        onSubmit={async (values) => {
          await createTask.mutateAsync({
            title: values.title || "Tarefa",
            description: values.description,
            due_date: values.due_date,
            priority: values.priority,
            ticket_id: taskDialog.ticketId,
            client_id: taskDialog.clientId,
            assigned_to: user?.id || "",
            created_by: user?.id,
          });
          toast.success("Tarefa criada");
        }}
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
            options: PIPELINE_STAGES.map((s) => ({ value: s.key, label: s.label })),
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
            pipeline_stage: pipeline_stage || "sem_atendimento",
            created_by: user?.id,
          } as any);

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

function getLatestQuoteRef(quotes: any[] | null) {
  if (!quotes || quotes.length === 0) return null;
  const pa = quotes.find((q: any) => q.status === "aprovado");
  if (pa) return `PA ${pa.quote_number}`;
  const pg = quotes.find((q: any) => q.status === "reprovado");
  if (pg) return `PG ${pg.quote_number}`;
  return `Orç ${quotes[0].quote_number}`;
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

function PipelineCard({ ticket, onQuickTask, onClick }: { ticket: any; onQuickTask: () => void; onClick: () => void }) {
  const typeInfo = TICKET_TYPE_LABELS[ticket.ticket_type] || { label: ticket.ticket_type, color: "bg-muted text-muted-foreground" };
  const quoteRef = getLatestQuoteRef(ticket.quotes);

  return (
    <div
      onClick={onClick}
      className="bg-background rounded-lg border p-3 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${typeInfo.color}`}>{typeInfo.label}</span>
        <StatusBadge status={ticket.priority} />
      </div>

      <p className="text-xs font-semibold line-clamp-1">{ticket.clients?.name || "—"}</p>
      {(ticket.description || ticket.problem_category) && (
        <span className="inline-block text-[10px] font-medium bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded line-clamp-1 mb-1">
          {ticket.description || ticket.problem_category}
        </span>
      )}

      <div className="flex items-center gap-1.5 flex-wrap mt-1">
        {quoteRef && (
          <span className="text-[9px] font-mono bg-muted px-1.5 py-0.5 rounded">{quoteRef}</span>
        )}
        <span className="text-[9px] font-mono text-muted-foreground">{ticket.ticket_number}</span>
      </div>

      <div className="flex items-center justify-end mt-1.5">
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
  );
}

export default CrmPipelinePage;
