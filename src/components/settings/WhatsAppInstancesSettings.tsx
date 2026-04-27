import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Pencil, X, Check, ChevronDown, ChevronRight, MessageSquare } from "lucide-react";

interface Pipeline { id: string; name: string; slug: string; }
interface Instance {
  id: string;
  pipeline_id: string;
  instance_name: string;
  phone_number: string | null;
  uazapi_instance_name: string;
  instance_token: string;
  base_url: string;
  distribution_pct: number;
  active: boolean;
}

const EMPTY_FORM = {
  instance_name: "",
  phone_number: "",
  uazapi_instance_name: "",
  instance_token: "",
  base_url: "https://liveuni.uazapi.com",
  distribution_pct: 0,
  active: true,
};

function DistributionBar({ instances }: { instances: Instance[] }) {
  const active = instances.filter(i => i.active);
  const total = active.reduce((s, i) => s + i.distribution_pct, 0);
  const ok = total === 100;
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Total de distribuição</span>
        <span className={ok ? "text-emerald-600 font-medium" : "text-amber-500 font-medium"}>
          {total}% {ok ? "✓" : `— faltam ${100 - total}%`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden flex">
        {active.map((inst, idx) => (
          <div
            key={inst.id}
            style={{ width: `${inst.distribution_pct}%`, backgroundColor: `hsl(${(idx * 60) % 360} 70% 55%)` }}
            className="h-full transition-all"
            title={`${inst.instance_name}: ${inst.distribution_pct}%`}
          />
        ))}
      </div>
    </div>
  );
}

function InstanceRow({
  inst,
  onDelete,
  onToggleActive,
  onChangePct,
}: {
  inst: Instance;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onChangePct: (id: string, pct: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pct, setPct] = useState(String(inst.distribution_pct));

  const savePct = () => {
    const n = parseInt(pct, 10);
    if (isNaN(n) || n < 0 || n > 100) { toast.error("Percentual deve ser entre 0 e 100"); return; }
    onChangePct(inst.id, n);
    setEditing(false);
  };

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${inst.active ? "bg-background" : "bg-muted/40 opacity-60"}`}>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{inst.instance_name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {inst.phone_number && <span className="mr-2">{inst.phone_number}</span>}
          <span className="font-mono">{inst.uazapi_instance_name}</span>
        </p>
      </div>

      {/* Distribution % */}
      <div className="flex items-center gap-1 shrink-0">
        {editing ? (
          <>
            <Input
              className="h-7 w-16 text-xs text-center"
              value={pct}
              onChange={e => setPct(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") savePct(); if (e.key === "Escape") setEditing(false); }}
              autoFocus
            />
            <button onClick={savePct} className="text-emerald-600 hover:text-emerald-700"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
          </>
        ) : (
          <button
            onClick={() => { setPct(String(inst.distribution_pct)); setEditing(true); }}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-muted hover:bg-muted/80"
          >
            {inst.distribution_pct}%
            <Pencil className="h-2.5 w-2.5" />
          </button>
        )}
      </div>

      {/* Active toggle */}
      <button
        onClick={() => onToggleActive(inst.id, !inst.active)}
        className={`text-[10px] rounded-full px-2 py-0.5 font-medium border transition-colors ${inst.active ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : "bg-muted text-muted-foreground border-border hover:bg-muted/60"}`}
      >
        {inst.active ? "Ativo" : "Inativo"}
      </button>

      <button onClick={() => onDelete(inst.id)} className="text-muted-foreground hover:text-destructive transition-colors">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AddInstanceForm({
  pipelineId,
  onCancel,
  onSaved,
}: {
  pipelineId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const qc = useQueryClient();

  const save = async () => {
    if (!form.instance_name.trim() || !form.uazapi_instance_name.trim() || !form.instance_token.trim()) {
      toast.error("Preencha nome, instanceName e token");
      return;
    }
    const { error } = await supabase.from("pipeline_whatsapp_instances").insert({
      pipeline_id: pipelineId,
      ...form,
      distribution_pct: Number(form.distribution_pct) || 0,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Número adicionado");
    qc.invalidateQueries({ queryKey: ["pipeline_whatsapp_instances"] });
    onSaved();
  };

  const field = (label: string, key: keyof typeof form, placeholder?: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        className="h-8 text-xs"
        placeholder={placeholder}
        value={String(form[key])}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="rounded-lg border border-dashed p-3 space-y-3 bg-muted/20">
      <p className="text-xs font-medium text-muted-foreground">Novo número WhatsApp</p>
      <div className="grid grid-cols-2 gap-2">
        {field("Nome de exibição *", "instance_name", "ex: Vendas #1")}
        {field("Número (display)", "phone_number", "ex: 48996068686")}
        {field("instanceName Uazapi *", "uazapi_instance_name", "ex: RODRIGO")}
        {field("Token da instância *", "instance_token", "c6a355b6-...")}
        {field("Base URL", "base_url")}
        <div className="space-y-1">
          <Label className="text-xs">Distribuição %</Label>
          <Input
            className="h-8 text-xs"
            type="number"
            min={0}
            max={100}
            value={form.distribution_pct}
            onChange={e => setForm(f => ({ ...f, distribution_pct: Number(e.target.value) }))}
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={save}>Salvar</Button>
      </div>
    </div>
  );
}

function PipelineSection({ pipeline, instances }: { pipeline: Pipeline; instances: Instance[] }) {
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const qc = useQueryClient();

  const deleteInstance = async (id: string) => {
    const { error } = await supabase.from("pipeline_whatsapp_instances").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Número removido");
    qc.invalidateQueries({ queryKey: ["pipeline_whatsapp_instances"] });
  };

  const toggleActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from("pipeline_whatsapp_instances").update({ active }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["pipeline_whatsapp_instances"] });
  };

  const changePct = async (id: string, distribution_pct: number) => {
    const { error } = await supabase.from("pipeline_whatsapp_instances").update({ distribution_pct }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["pipeline_whatsapp_instances"] });
  };

  return (
    <div className="rounded-xl border bg-card">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-emerald-600" />
          <span className="font-medium text-sm">{pipeline.name}</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{instances.length} número{instances.length !== 1 ? "s" : ""}</Badge>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          {instances.length > 0 && <DistributionBar instances={instances} />}

          <div className="space-y-1.5 mt-2">
            {instances.map(inst => (
              <InstanceRow
                key={inst.id}
                inst={inst}
                onDelete={deleteInstance}
                onToggleActive={toggleActive}
                onChangePct={changePct}
              />
            ))}
          </div>

          {adding ? (
            <AddInstanceForm
              pipelineId={pipeline.id}
              onCancel={() => setAdding(false)}
              onSaved={() => setAdding(false)}
            />
          ) : (
            <Button variant="outline" size="sm" className="w-full text-xs mt-1" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar número
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function WhatsAppInstancesSettings() {
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

  const { data: instances = [] } = useQuery<Instance[]>({
    queryKey: ["pipeline_whatsapp_instances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_whatsapp_instances")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const byPipeline = (pid: string) => instances.filter(i => i.pipeline_id === pid);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Números WhatsApp por Fluxo</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Cada fluxo pode ter um ou mais números. A distribuição (%) define qual número recebe novas conversas.
        </p>
      </div>
      {pipelines.map(p => (
        <PipelineSection key={p.id} pipeline={p} instances={byPipeline(p.id)} />
      ))}
      {pipelines.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum fluxo ativo encontrado.</p>
      )}
    </div>
  );
}
