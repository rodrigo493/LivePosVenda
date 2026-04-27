import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Check, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAllUsers, useUserAccess, useSaveUserAccess } from "@/hooks/useUserAccess";
import { useCrmModulePermissions, useSaveCrmPermissions } from "@/hooks/useCrmPermissions";
import { usePipelines } from "@/hooks/usePipelines";
import { PipelineStageDB } from "@/hooks/usePipelineStages";
import { CRM_MODULES, CRM_SECTIONS } from "@/lib/crmModules";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

const CrmPermissionsPage = () => {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!hasRole("admin")) navigate("/");
  }, [hasRole, navigate]);

  const { data: users = [], isLoading: usersLoading } = useAllUsers();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token ?? "";
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users?user_id=${userId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? payload.message ?? `Erro ${res.status}`);
    },
    onSuccess: () => {
      toast.success("Usuário excluído com sucesso");
      if (selectedUserId === deleteTarget?.id) setSelectedUserId(null);
      qc.invalidateQueries({ queryKey: ["all-users"] });
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Module permissions state
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const { data: userPerms } = useCrmModulePermissions(selectedUserId);
  const savePerms = useSaveCrmPermissions();

  // Pipeline/stage access state
  const [selectedPipelineIds, setSelectedPipelineIds] = useState<Set<string>>(new Set());
  const [selectedStageIds, setSelectedStageIds] = useState<Set<string>>(new Set());
  const [expandedPipelines, setExpandedPipelines] = useState<Set<string>>(new Set());

  const { data: allPipelines = [] } = usePipelines();
  const { data: allStages = [] } = useQuery<PipelineStageDB[]>({
    queryKey: ["all-pipeline-stages"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pipeline_stages")
        .select("id, pipeline_id, key, label, color, position")
        .order("position", { ascending: true });
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
  const { data: userAccess } = useUserAccess(selectedUserId);
  const saveAccess = useSaveUserAccess();

  // Sync module permissions when user changes
  useEffect(() => {
    if (userPerms !== undefined) setChecked(new Set(userPerms));
  }, [userPerms, selectedUserId]);

  // Sync pipeline/stage access when user changes
  useEffect(() => {
    if (userAccess === undefined || allPipelines.length === 0 || allStages.length === 0) return;
    if (userAccess.pipelineIds.size === 0) {
      // Novo usuário sem acesso configurado: selecionar tudo por padrão
      setSelectedPipelineIds(new Set(allPipelines.map((p) => p.id)));
      setSelectedStageIds(new Set(allStages.map((s) => s.id)));
    } else {
      setSelectedPipelineIds(new Set(userAccess.pipelineIds));
      setSelectedStageIds(new Set(userAccess.stageIds));
    }
    setExpandedPipelines(new Set(allPipelines.map((p) => p.id)));
  }, [userAccess, selectedUserId, allPipelines, allStages]);

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleSection(section: string) {
    const sectionKeys = CRM_MODULES.filter((m) => m.section === section).map((m) => m.key);
    const allChecked = sectionKeys.every((k) => checked.has(k));
    setChecked((prev) => {
      const next = new Set(prev);
      if (allChecked) sectionKeys.forEach((k) => next.delete(k));
      else sectionKeys.forEach((k) => next.add(k));
      return next;
    });
  }

  function togglePipeline(pipelineId: string) {
    const stages = allStages.filter((s) => s.pipeline_id === pipelineId);
    if (selectedPipelineIds.has(pipelineId)) {
      setSelectedPipelineIds((prev) => { const n = new Set(prev); n.delete(pipelineId); return n; });
      setSelectedStageIds((prev) => { const n = new Set(prev); stages.forEach((s) => n.delete(s.id)); return n; });
    } else {
      setSelectedPipelineIds((prev) => { const n = new Set(prev); n.add(pipelineId); return n; });
      setSelectedStageIds((prev) => { const n = new Set(prev); stages.forEach((s) => n.add(s.id)); return n; });
    }
  }

  function toggleStage(stageId: string, pipelineId: string) {
    setSelectedStageIds((prev) => {
      const n = new Set(prev);
      if (n.has(stageId)) n.delete(stageId); else n.add(stageId);
      return n;
    });
    // garantir que o funil esteja selecionado quando ao menos uma etapa estiver
    setSelectedPipelineIds((prev) => { const n = new Set(prev); n.add(pipelineId); return n; });
  }

  function toggleExpandPipeline(pipelineId: string) {
    setExpandedPipelines((prev) => {
      const n = new Set(prev);
      if (n.has(pipelineId)) n.delete(pipelineId); else n.add(pipelineId);
      return n;
    });
  }

  function toggleAllPipelines() {
    const allSelected = allPipelines.every((p) => selectedPipelineIds.has(p.id));
    if (allSelected) {
      setSelectedPipelineIds(new Set());
      setSelectedStageIds(new Set());
    } else {
      setSelectedPipelineIds(new Set(allPipelines.map((p) => p.id)));
      setSelectedStageIds(new Set(allStages.map((s) => s.id)));
    }
  }

  function handleSave() {
    if (!selectedUserId) return;
    savePerms.mutate(
      { userId: selectedUserId, grantedKeys: [...checked] },
      {
        onSuccess: () => {
          saveAccess.mutate({
            userId: selectedUserId,
            pipelineIds: [...selectedPipelineIds],
            stageIds: [...selectedStageIds],
          });
        },
      }
    );
  }

  const selectedUser = users.find((u) => u.user_id === selectedUserId);
  const isSaving = savePerms.isPending || saveAccess.isPending;

  return (
    <>
    <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong>? Esta ação é irreversível e removerá o acesso permanentemente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90 text-white"
            onClick={() => deleteTarget && deleteUser.mutate(deleteTarget.id)}
            disabled={deleteUser.isPending}
          >
            {deleteUser.isPending ? "Excluindo..." : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div className="space-y-6">
      <PageHeader
        title="Permissões CRM"
        description="Controle quais módulos cada usuário pode acessar"
        icon={Shield}
      />

      <div className="flex gap-4 h-[calc(100vh-200px)] min-h-[400px]">
        {/* Painel de usuários */}
        <div className="w-64 flex-shrink-0 border border-border rounded-xl overflow-hidden bg-card">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Usuários</p>
          </div>
          <ScrollArea className="h-full">
            {usersLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Carregando...</div>
            ) : users.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Nenhum usuário encontrado</div>
            ) : (
              users.map((u) => (
                <div
                  key={u.user_id}
                  className={`group flex items-center gap-3 px-4 py-3 border-b border-border/50 transition-colors hover:bg-muted/50 ${
                    selectedUserId === u.user_id ? "bg-primary/10 border-l-2 border-l-primary" : ""
                  }`}
                >
                  <button
                    onClick={() => setSelectedUserId(u.user_id)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-semibold text-primary">
                        {getInitials(u.full_name || u.email)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: u.user_id, name: u.full_name || u.email }); }}
                    className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                    title="Excluir usuário"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Painel de módulos + funis */}
        <div className="flex-1 border border-border rounded-xl overflow-hidden bg-card flex flex-col">
          {!selectedUserId ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Selecione um usuário para gerenciar as permissões
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Permissões de{" "}
                  <span className="text-foreground font-medium">
                    {selectedUser?.full_name || selectedUser?.email}
                  </span>
                </p>
                <Button size="sm" onClick={handleSave} disabled={isSaving} className="h-8">
                  {isSaving ? "Salvando..." : "Salvar"}
                </Button>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-5 space-y-6">
                  {/* Seções de módulos */}
                  {CRM_SECTIONS.map((section) => {
                    const modules = CRM_MODULES.filter((m) => m.section === section);
                    const allChecked = modules.every((m) => checked.has(m.key));

                    return (
                      <div key={section}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {section}
                          </span>
                          <button
                            onClick={() => toggleSection(section)}
                            className="text-xs text-primary hover:underline"
                          >
                            {allChecked ? "Desmarcar todos" : "Marcar todos"}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {modules.map((m) => (
                            <button
                              key={m.key}
                              onClick={() => toggle(m.key)}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                                checked.has(m.key)
                                  ? "border-primary/40 bg-primary/10 text-foreground"
                                  : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
                              }`}
                            >
                              <div
                                className={`h-4 w-4 rounded flex items-center justify-center border flex-shrink-0 ${
                                  checked.has(m.key) ? "bg-primary border-primary" : "border-muted-foreground/40"
                                }`}
                              >
                                {checked.has(m.key) && <Check className="h-2.5 w-2.5 text-white" />}
                              </div>
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Funis & Etapas */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        CRM Pipeline — Funis & Etapas
                      </span>
                      <button onClick={toggleAllPipelines} className="text-xs text-primary hover:underline">
                        {allPipelines.every((p) => selectedPipelineIds.has(p.id))
                          ? "Desmarcar todos"
                          : "Marcar todos"}
                      </button>
                    </div>

                    <div className="space-y-2">
                      {allPipelines.map((pipeline) => {
                        const stages = allStages.filter((s) => s.pipeline_id === pipeline.id);
                        const pipeChecked = selectedPipelineIds.has(pipeline.id);
                        const expanded = expandedPipelines.has(pipeline.id);
                        const checkedCount = stages.filter((s) => selectedStageIds.has(s.id)).length;

                        return (
                          <div
                            key={pipeline.id}
                            className={`rounded-lg border transition-colors ${
                              pipeChecked ? "border-primary/40 bg-primary/5" : "border-border bg-muted/20"
                            }`}
                          >
                            {/* Cabeçalho do funil */}
                            <div className="flex items-center gap-2 px-3 py-2.5">
                              <button
                                onClick={() => togglePipeline(pipeline.id)}
                                className={`h-4 w-4 rounded flex items-center justify-center border flex-shrink-0 transition-colors ${
                                  pipeChecked ? "bg-primary border-primary" : "border-muted-foreground/40"
                                }`}
                              >
                                {pipeChecked && <Check className="h-2.5 w-2.5 text-white" />}
                              </button>
                              <span
                                className={`flex-1 text-sm font-medium ${
                                  pipeChecked ? "text-foreground" : "text-muted-foreground"
                                }`}
                              >
                                {pipeline.name}
                              </span>
                              {pipeChecked && stages.length > 0 && (
                                <span className="text-[10px] text-muted-foreground mr-1">
                                  {checkedCount}/{stages.length} etapas
                                </span>
                              )}
                              {stages.length > 0 && (
                                <button
                                  onClick={() => toggleExpandPipeline(pipeline.id)}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  {expanded
                                    ? <ChevronDown className="h-4 w-4" />
                                    : <ChevronRight className="h-4 w-4" />}
                                </button>
                              )}
                            </div>

                            {/* Etapas */}
                            {expanded && stages.length > 0 && (
                              <div className="border-t border-border/50 px-3 py-2 space-y-1">
                                {stages.map((stage) => {
                                  const stageChecked = selectedStageIds.has(stage.id);
                                  return (
                                    <button
                                      key={stage.id}
                                      onClick={() => toggleStage(stage.id, pipeline.id)}
                                      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-sm transition-colors ${
                                        stageChecked ? "text-foreground" : "text-muted-foreground hover:text-foreground/70"
                                      }`}
                                    >
                                      <div
                                        className={`h-3.5 w-3.5 rounded flex items-center justify-center border flex-shrink-0 transition-colors ${
                                          stageChecked ? "bg-primary border-primary" : "border-muted-foreground/40"
                                        }`}
                                      >
                                        {stageChecked && <Check className="h-2 w-2 text-white" />}
                                      </div>
                                      <span
                                        className="h-2 w-2 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: stage.color }}
                                      />
                                      {stage.label}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
};

export default CrmPermissionsPage;
