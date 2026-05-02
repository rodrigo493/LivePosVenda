import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Pencil, ChevronDown, ChevronRight, Target } from "lucide-react";

interface Pipeline { id: string; name: string; slug: string; }
interface LeadSource {
  id: string;
  pipeline_id: string;
  name: string;
  color: string;
  active: boolean;
  created_at: string;
}

const PREDEFINED: { name: string; color: string }[] = [
  { name: "Site",        color: "#6366f1" },
  { name: "Meta Ads",    color: "#1877F2" },
  { name: "Google Ads",  color: "#EA4335" },
  { name: "LinkedIn",    color: "#0A66C2" },
  { name: "TikTok",      color: "#010101" },
  { name: "Instagram",   color: "#E1306C" },
  { name: "Orgânico",    color: "#10B981" },
  { name: "Indicação",   color: "#F59E0B" },
  { name: "WhatsApp",    color: "#25D366" },
  { name: "Email",       color: "#6B7280" },
  { name: "YouTube",     color: "#FF0000" },
  { name: "Evento",      color: "#8B5CF6" },
];

const COLOR_PALETTE = [
  "#6366f1","#8B5CF6","#EC4899","#EF4444","#F97316",
  "#EAB308","#10B981","#06B6D4","#3B82F6","#0A66C2",
  "#1877F2","#E1306C","#25D366","#FF0000","#6B7280",
  "#010101",
];

function SourceDot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{ width: size, height: size, backgroundColor: color }}
    />
  );
}

function SourceRow({
  source,
  onDelete,
  onToggleActive,
  onUpdate,
}: {
  source: LeadSource;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onUpdate: (id: string, data: { name: string; color: string }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: source.name, color: source.color });

  const save = async () => {
    if (!form.name.trim()) { toast.error("Nome obrigatório"); return; }
    await onUpdate(source.id, form);
    setEditing(false);
  };

  const openEdit = () => { setForm({ name: source.name, color: source.color }); setEditing(true); };

  if (editing) {
    return (
      <div className="rounded-lg border border-primary/30 p-3 space-y-3 bg-muted/20">
        <p className="text-xs font-medium text-muted-foreground">Editar fonte</p>
        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Nome *</Label>
            <Input
              className="h-8 text-xs"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cor</Label>
            <div className="flex flex-wrap gap-1 max-w-[200px]">
              {COLOR_PALETTE.map(c => (
                <button
                  key={c}
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={`w-5 h-5 rounded-full transition-transform ${form.color === c ? "ring-2 ring-offset-1 ring-foreground scale-110" : "hover:scale-110"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
          <Button size="sm" onClick={save}>Salvar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${source.active ? "bg-background" : "bg-muted/40 opacity-60"}`}>
      <SourceDot color={source.color} />
      <span className="flex-1 font-medium truncate">{source.name}</span>

      <button
        onClick={() => onToggleActive(source.id, !source.active)}
        className={`text-[10px] rounded-full px-2 py-0.5 font-medium border transition-colors shrink-0 ${source.active ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : "bg-muted text-muted-foreground border-border hover:bg-muted/60"}`}
      >
        {source.active ? "Ativa" : "Inativa"}
      </button>

      <button onClick={openEdit} className="text-muted-foreground hover:text-foreground transition-colors" title="Editar">
        <Pencil className="h-3.5 w-3.5" />
      </button>

      <button onClick={() => onDelete(source.id)} className="text-muted-foreground hover:text-destructive transition-colors">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AddSourceForm({
  pipelineId,
  existingNames,
  onCancel,
  onSaved,
}: {
  pipelineId: string;
  existingNames: Set<string>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"predefined" | "custom">("predefined");
  const [custom, setCustom] = useState({ name: "", color: COLOR_PALETTE[0] });
  const qc = useQueryClient();

  const insert = async (name: string, color: string) => {
    if (existingNames.has(name)) { toast.error(`"${name}" já está neste fluxo`); return; }
    const { error } = await supabase.from("pipeline_lead_sources").insert({ pipeline_id: pipelineId, name, color });
    if (error) { toast.error(error.message); return; }
    toast.success(`Fonte "${name}" adicionada`);
    qc.invalidateQueries({ queryKey: ["pipeline_lead_sources"] });
    onSaved();
  };

  const saveCustom = () => {
    if (!custom.name.trim()) { toast.error("Nome obrigatório"); return; }
    insert(custom.name.trim(), custom.color);
  };

  return (
    <div className="rounded-lg border border-dashed p-3 space-y-3 bg-muted/20">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <button
          onClick={() => setMode("predefined")}
          className={`px-2 py-0.5 rounded transition-colors ${mode === "predefined" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
        >
          Sugeridas
        </button>
        <button
          onClick={() => setMode("custom")}
          className={`px-2 py-0.5 rounded transition-colors ${mode === "custom" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
        >
          Personalizada
        </button>
      </div>

      {mode === "predefined" && (
        <div className="flex flex-wrap gap-1.5">
          {PREDEFINED.map(p => {
            const already = existingNames.has(p.name);
            return (
              <button
                key={p.name}
                disabled={already}
                onClick={() => insert(p.name, p.color)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-all
                  ${already ? "opacity-40 cursor-not-allowed" : "hover:scale-105 active:scale-95"}`}
                style={already ? {} : { borderColor: p.color, color: p.color }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                {p.name}
                {already && " ✓"}
              </button>
            );
          })}
        </div>
      )}

      {mode === "custom" && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Nome da fonte *</Label>
            <Input
              className="h-8 text-xs"
              placeholder="ex: Parceria, Feirão, etc."
              value={custom.name}
              onChange={e => setCustom(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => { if (e.key === "Enter") saveCustom(); }}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cor</Label>
            <div className="flex flex-wrap gap-1">
              {COLOR_PALETTE.map(c => (
                <button
                  key={c}
                  onClick={() => setCustom(f => ({ ...f, color: c }))}
                  className={`w-5 h-5 rounded-full transition-transform ${custom.color === c ? "ring-2 ring-offset-1 ring-foreground scale-110" : "hover:scale-110"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        {mode === "custom" && <Button size="sm" onClick={saveCustom}>Adicionar</Button>}
      </div>
    </div>
  );
}

function PipelineSection({ pipeline, sources }: { pipeline: Pipeline; sources: LeadSource[] }) {
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const qc = useQueryClient();

  const deleteSource = async (id: string) => {
    if (!window.confirm("Remover esta fonte do fluxo?")) return;
    const { error } = await supabase.from("pipeline_lead_sources").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Fonte removida");
    qc.invalidateQueries({ queryKey: ["pipeline_lead_sources"] });
  };

  const toggleActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from("pipeline_lead_sources").update({ active }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["pipeline_lead_sources"] });
  };

  const updateSource = async (id: string, data: { name: string; color: string }) => {
    const { error } = await supabase.from("pipeline_lead_sources").update(data).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Fonte atualizada");
    qc.invalidateQueries({ queryKey: ["pipeline_lead_sources"] });
  };

  const activeSources = sources.filter(s => s.active);
  const existingNames = new Set(sources.map(s => s.name));

  return (
    <div className="rounded-xl border bg-card">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-violet-500" />
          <span className="font-medium text-sm">{pipeline.name}</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {sources.length} fonte{sources.length !== 1 ? "s" : ""}
          </Badge>
          {activeSources.length > 0 && (
            <div className="flex -space-x-1">
              {activeSources.slice(0, 6).map(s => (
                <SourceDot key={s.id} color={s.color} size={8} />
              ))}
              {activeSources.length > 6 && (
                <span className="text-[10px] text-muted-foreground ml-1.5">+{activeSources.length - 6}</span>
              )}
            </div>
          )}
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          <div className="space-y-1.5 mt-1">
            {sources.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">Nenhuma fonte configurada.</p>
            )}
            {sources.map(source => (
              <SourceRow
                key={source.id}
                source={source}
                onDelete={deleteSource}
                onToggleActive={toggleActive}
                onUpdate={updateSource}
              />
            ))}
          </div>

          {adding ? (
            <AddSourceForm
              pipelineId={pipeline.id}
              existingNames={existingNames}
              onCancel={() => setAdding(false)}
              onSaved={() => setAdding(false)}
            />
          ) : (
            <Button variant="outline" size="sm" className="w-full text-xs mt-1" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar fonte
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function LeadSourcesSettings() {
  const { data: pipelines = [] } = useQuery<Pipeline[]>({
    queryKey: ["pipelines_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipelines")
        .select("id, name, slug")
        .eq("is_active", true)
        .order("position");
      if (error) throw error;
      return data;
    },
  });

  const { data: sources = [] } = useQuery<LeadSource[]>({
    queryKey: ["pipeline_lead_sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_lead_sources")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const byPipeline = (pid: string) => sources.filter(s => s.pipeline_id === pid);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Fontes de Leads por Fluxo</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure de onde chegam os leads em cada fluxo: site, Meta Ads, Google, LinkedIn, TikTok e outros canais.
        </p>
      </div>
      {pipelines.map(p => (
        <PipelineSection key={p.id} pipeline={p} sources={byPipeline(p.id)} />
      ))}
      {pipelines.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum fluxo ativo encontrado.</p>
      )}
    </div>
  );
}
