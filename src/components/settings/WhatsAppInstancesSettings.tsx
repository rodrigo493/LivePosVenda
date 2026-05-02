import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Pencil, X, Check, ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { useAllUsers, UserSummary } from "@/hooks/useUserAccess";

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
  user_id: string | null;
}

const EMPTY_FORM = {
  instance_name: "",
  phone_number: "",
  uazapi_instance_name: "",
  instance_token: "",
  base_url: "https://liveuni.uazapi.com",
  distribution_pct: 0,
  active: true,
  user_id: "",
};

function UserSelect({ value, onChange, users }: { value: string; onChange: (v: string) => void; users: UserSummary[] }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">Usuário vinculado</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Nenhum (sem vínculo)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" className="text-xs">Nenhum (sem vínculo)</SelectItem>
          {users.map(u => (
            <SelectItem key={u.user_id} value={u.user_id} className="text-xs">
              {u.full_name || u.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DistributionBar({ instances, onDistributeEqually }: { instances: Instance[]; onDistributeEqually?: () => void }) {
  const active = instances.filter(i => i.active);
  const total = active.reduce((s, i) => s + i.distribution_pct, 0);
  const ok = total === 100;
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Total de distribuição</span>
        <div className="flex items-center gap-2">
          {onDistributeEqually && active.length > 0 && (
            <button
              onClick={onDistributeEqually}
              className="rounded px-2 py-0.5 text-[10px] font-medium bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
              title="Divide 100% igualmente entre os números ativos"
            >
              Distribuir por igual
            </button>
          )}
          <span className={ok ? "text-emerald-600 font-medium" : "text-amber-500 font-medium"}>
            {total}% {ok ? "✓" : `— faltam ${100 - total}%`}
          </span>
        </div>
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
  onUpdate,
}: {
  inst: Instance;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onChangePct: (id: string, pct: number) => void;
  onUpdate: (id: string, data: Partial<Omit<Instance, "id" | "pipeline_id">>) => Promise<void>;
}) {
  const { data: users = [] } = useAllUsers();
  const [editing, setEditing] = useState(false);
  const [editingFull, setEditingFull] = useState(false);
  const [pct, setPct] = useState(String(inst.distribution_pct));
  const [form, setForm] = useState({
    instance_name: inst.instance_name,
    phone_number: inst.phone_number ?? "",
    uazapi_instance_name: inst.uazapi_instance_name,
    instance_token: inst.instance_token,
    base_url: inst.base_url,
    distribution_pct: inst.distribution_pct,
    active: inst.active,
    user_id: inst.user_id ?? "",
  });

  const linkedUser = users.find(u => u.user_id === inst.user_id);

  const savePct = () => {
    const n = parseInt(pct, 10);
    if (isNaN(n) || n < 0 || n > 100) { toast.error("Percentual deve ser entre 0 e 100"); return; }
    onChangePct(inst.id, n);
    setEditing(false);
  };

  const saveFull = async () => {
    if (!form.instance_name.trim() || !form.uazapi_instance_name.trim() || !form.instance_token.trim()) {
      toast.error("Preencha nome, instanceName e token");
      return;
    }
    await onUpdate(inst.id, {
      ...form,
      distribution_pct: Number(form.distribution_pct) || 0,
      user_id: form.user_id && form.user_id !== "none" ? form.user_id : null,
    });
    setEditingFull(false);
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

  const openEdit = () => {
    setForm({
      instance_name: inst.instance_name,
      phone_number: inst.phone_number ?? "",
      uazapi_instance_name: inst.uazapi_instance_name,
      instance_token: inst.instance_token,
      base_url: inst.base_url,
      distribution_pct: inst.distribution_pct,
      active: inst.active,
      user_id: inst.user_id ?? "",
    });
    setEditingFull(true);
  };

  if (editingFull) {
    return (
      <div className="rounded-lg border border-primary/30 p-3 space-y-3 bg-muted/20">
        <p className="text-xs font-medium text-muted-foreground">Editar número WhatsApp</p>
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
          <UserSelect
            value={form.user_id || "none"}
            onChange={v => setForm(f => ({ ...f, user_id: v }))}
            users={users}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => setEditingFull(false)}>Cancelar</Button>
          <Button size="sm" onClick={saveFull}>Salvar alterações</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${inst.active ? "bg-background" : "bg-muted/40 opacity-60"}`}>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{inst.instance_name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {inst.phone_number && <span className="mr-2">{inst.phone_number}</span>}
          <span className="font-mono">{inst.uazapi_instance_name}</span>
          {linkedUser && <span className="ml-2 text-primary/70">· {linkedUser.full_name || linkedUser.email}</span>}
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

      <button onClick={openEdit} className="text-muted-foreground hover:text-foreground transition-colors" title="Editar">
        <Pencil className="h-3.5 w-3.5" />
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
  const { data: users = [] } = useAllUsers();
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
      user_id: form.user_id && form.user_id !== "none" ? form.user_id : null,
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
        <UserSelect
          value={form.user_id || "none"}
          onChange={v => setForm(f => ({ ...f, user_id: v }))}
          users={users}
        />
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
    if (!window.confirm("Remover este número do fluxo?")) return;
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

  const updateInstance = async (id: string, data: Partial<Omit<Instance, "id" | "pipeline_id">>) => {
    const { error } = await supabase.from("pipeline_whatsapp_instances").update(data).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Número atualizado");
    qc.invalidateQueries({ queryKey: ["pipeline_whatsapp_instances"] });
  };

  const distributeEqually = async () => {
    const active = instances.filter(i => i.active);
    if (active.length === 0) return;
    const base = Math.floor(100 / active.length);
    const remainder = 100 % active.length;
    const updates = active.map((inst, idx) =>
      supabase.from("pipeline_whatsapp_instances")
        .update({ distribution_pct: base + (idx < remainder ? 1 : 0) })
        .eq("id", inst.id)
    );
    const results = await Promise.all(updates);
    const firstError = results.find(r => r.error);
    if (firstError?.error) { toast.error(firstError.error.message); return; }
    toast.success("Distribuição igualada");
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
          {instances.length > 0 && <DistributionBar instances={instances} onDistributeEqually={distributeEqually} />}

          <div className="space-y-1.5 mt-2">
            {instances.map(inst => (
              <InstanceRow
                key={inst.id}
                inst={inst}
                onDelete={deleteInstance}
                onToggleActive={toggleActive}
                onChangePct={changePct}
                onUpdate={updateInstance}
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
