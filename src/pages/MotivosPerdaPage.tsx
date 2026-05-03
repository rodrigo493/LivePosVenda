// src/pages/MotivosPerdaPage.tsx
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pencil, Check, X, Plus, TrendingDown, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import {
  useLossReasons,
  useCreateLossReason,
  useUpdateLossReason,
} from "@/hooks/useLossReasons";

export default function MotivosPerdaPage() {
  const { data: reasons, isLoading } = useLossReasons();
  const createReason = useCreateLossReason();
  const updateReason = useUpdateLossReason();

  const [isCreating, setIsCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleCreate() {
    if (!newLabel.trim()) return;
    try {
      await createReason.mutateAsync(newLabel.trim());
      toast.success("Motivo criado com sucesso.");
      setNewLabel("");
      setIsCreating(false);
    } catch {
      toast.error("Erro ao criar motivo.");
    }
  }

  async function handleSaveEdit(id: string) {
    if (!editingLabel.trim()) return;
    setLoadingId(id);
    try {
      await updateReason.mutateAsync({ id, updates: { label: editingLabel.trim() } });
      toast.success("Motivo atualizado.");
      setEditingId(null);
    } catch {
      toast.error("Erro ao atualizar motivo.");
    } finally {
      setLoadingId(null);
    }
  }

  async function handleToggleActive(id: string, currentActive: boolean) {
    setLoadingId(id);
    try {
      await updateReason.mutateAsync({ id, updates: { active: !currentActive } });
      toast.success(currentActive ? "Motivo desativado." : "Motivo reativado.");
    } catch {
      toast.error("Erro ao alterar status.");
    } finally {
      setLoadingId(null);
    }
  }

  const activeReasons = (reasons ?? []).filter((r) => r.active);
  const inactiveReasons = (reasons ?? []).filter((r) => !r.active);

  return (
    <div className="container max-w-3xl py-6 space-y-6">
      <PageHeader
        title="Motivos de Perda"
        description="Gerencie os motivos de perda de negociações. Esses motivos são selecionáveis dentro de cada card de ticket."
        icon={TrendingDown}
      />

      {/* Botão + form de criação */}
      <div>
        {!isCreating ? (
          <Button size="sm" onClick={() => setIsCreating(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Novo motivo
          </Button>
        ) : (
          <div className="flex gap-2 items-center">
            <Input
              autoFocus
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") { setIsCreating(false); setNewLabel(""); } }}
              placeholder="Ex: Preço acima do esperado"
              className="max-w-md h-9 text-sm"
            />
            <Button size="sm" onClick={handleCreate} disabled={createReason.isPending || !newLabel.trim()} className="gap-1">
              <Check className="h-3.5 w-3.5" /> Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setIsCreating(false); setNewLabel(""); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Lista de motivos ativos */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="space-y-6">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Ativos ({activeReasons.length})
            </p>
            {activeReasons.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">Nenhum motivo ativo.</p>
            )}
            {activeReasons.map((reason) => (
              <div
                key={reason.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5 hover:bg-muted/40 transition-colors"
              >
                {editingId === reason.id ? (
                  <>
                    <Input
                      autoFocus
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(reason.id); if (e.key === "Escape") setEditingId(null); }}
                      className="h-7 text-sm flex-1 max-w-md"
                    />
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleSaveEdit(reason.id)} disabled={loadingId === reason.id || !editingLabel.trim()}>
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" title="Cancelar edição" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm">{reason.label}</span>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {reason.ticket_count ?? 0} {(reason.ticket_count ?? 0) === 1 ? "negociação" : "negociações"}
                    </Badge>
                    <Button
                      size="sm" variant="ghost" className="h-7 px-2"
                      title="Editar motivo"
                      onClick={() => { setEditingId(reason.id); setEditingLabel(reason.label); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-destructive"
                      onClick={() => handleToggleActive(reason.id, reason.active)}
                      title="Desativar"
                      disabled={loadingId === reason.id}
                    >
                      <PowerOff className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Lista de inativos */}
          {inactiveReasons.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Inativos ({inactiveReasons.length})
              </p>
              {inactiveReasons.map((reason) => (
                <div
                  key={reason.id}
                  className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-2.5"
                >
                  <span className="flex-1 text-sm text-muted-foreground line-through">{reason.label}</span>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {reason.ticket_count ?? 0} {(reason.ticket_count ?? 0) === 1 ? "negociação" : "negociações"}
                  </Badge>
                  <Button
                    size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-green-600"
                    onClick={() => handleToggleActive(reason.id, reason.active)}
                    title="Reativar"
                    disabled={loadingId === reason.id}
                  >
                    <Power className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
