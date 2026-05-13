// src/components/crm/AutomationRow.tsx
import { useEffect, useState } from "react";
import { ticketStatusLabels } from "@/constants/statusLabels";
import { Zap, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { AutomationActionType } from "@/hooks/useStageAutomations";

interface LocalAutomation {
  id: string;
  trigger_type: string;
  action_type: AutomationActionType;
  action_config: Record<string, unknown>;
  is_active: boolean;
  delay_minutes: number;
}

interface AutomationRowProps {
  automation: LocalAutomation;
  onChange: (updated: LocalAutomation) => void;
  onDelete: () => void;
}

const ACTION_OPTIONS: { value: AutomationActionType; label: string }[] = [
  { value: "whatsapp_message", label: "📱 Enviar WhatsApp" },
  { value: "create_task", label: "✅ Criar tarefa" },
  { value: "notify_user", label: "🔔 Notificar usuário" },
  { value: "move_stage", label: "➡️ Mover para etapa" },
  { value: "send_email", label: "📧 Enviar e-mail" },
  { value: "create_copy", label: "📋 Criar Cópia do Card" },
  { value: "create_copy_if_status", label: "📋 Cópia Condicional por Status" },
];

const VARIABLES = [
  { label: "{{cliente_nome}}", key: "{{cliente_nome}}" },
  { label: "{{tecnico_nome}}", key: "{{tecnico_nome}}" },
  { label: "{{tecnico_telefone}}", key: "{{tecnico_telefone}}" },
  { label: "{{etapa_nome}}", key: "{{etapa_nome}}" },
  { label: "{{funil_nome}}", key: "{{funil_nome}}" },
  { label: "{{ticket_numero}}", key: "{{ticket_numero}}" },
];

const inputDark = "h-7 text-xs bg-zinc-800 border-zinc-600 text-zinc-100 placeholder:text-zinc-500";
const textareaDark = "w-full rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none";

function VariableChips({ onInsert }: { onInsert: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {VARIABLES.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => onInsert(v.key)}
          className="px-1.5 py-0.5 rounded text-[10px] bg-amber-900/40 text-amber-400 hover:bg-amber-900/60 transition-colors font-mono"
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

function PipelineStageSelector({
  cfg,
  onCfgChange,
  onPipelineSelect,
  pipelinePlaceholder,
  stagePlaceholder,
}: {
  cfg: Record<string, unknown>;
  onCfgChange: (key: string, value: unknown) => void;
  onPipelineSelect: (pipelineId: string) => void;
  pipelinePlaceholder: string;
  stagePlaceholder: string;
}) {
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; label: string }[]>([]);
  const selectedPipelineId = (cfg.target_pipeline_id as string) ?? "";
  const selectedStageId = (cfg.target_stage_id as string) ?? "";

  useEffect(() => {
    (supabase as any)
      .from("pipelines")
      .select("id, name")
      .order("name")
      .then(({ data }: { data: { id: string; name: string }[] | null }) => {
        setPipelines(data ?? []);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedPipelineId) {
      setStages([]);
      return;
    }
    (supabase as any)
      .from("pipeline_stages")
      .select("id, label")
      .eq("pipeline_id", selectedPipelineId)
      .order("position", { ascending: true })
      .then(({ data }: { data: { id: string; label: string }[] | null }) => {
        setStages(data ?? []);
      })
      .catch(console.error);
  }, [selectedPipelineId]);

  return (
    <div className="space-y-1.5">
      <select
        value={selectedPipelineId}
        onChange={(e) => onPipelineSelect(e.target.value)}
        className="w-full h-7 rounded-md border border-zinc-600 bg-zinc-800 px-2 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-primary/50"
      >
        <option value="" className="bg-zinc-800">{pipelinePlaceholder}</option>
        {pipelines.map((p) => (
          <option key={p.id} value={p.id} className="bg-zinc-800">
            {p.name}
          </option>
        ))}
      </select>
      <select
        value={selectedStageId}
        onChange={(e) => onCfgChange("target_stage_id", e.target.value)}
        disabled={!selectedPipelineId}
        className="w-full h-7 rounded-md border border-zinc-600 bg-zinc-800 px-2 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <option value="" className="bg-zinc-800">{stagePlaceholder}</option>
        {stages.map((s) => (
          <option key={s.id} value={s.id} className="bg-zinc-800">
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CopyConfigSection({
  cfg,
  onCfgChange,
  onPipelineSelect,
}: {
  cfg: Record<string, unknown>;
  onCfgChange: (key: string, value: unknown) => void;
  onPipelineSelect: (pipelineId: string) => void;
}) {
  return (
    <PipelineStageSelector
      cfg={cfg}
      onCfgChange={onCfgChange}
      onPipelineSelect={onPipelineSelect}
      pipelinePlaceholder="Selecionar funil destino"
      stagePlaceholder="Selecionar etapa destino"
    />
  );
}

const TICKET_STATUS_OPTIONS = Object.entries(ticketStatusLabels).map(([value, label]) => ({
  value,
  label,
}));

function ConditionalCopyConfigSection({
  cfg,
  onCfgChange,
  onPipelineSelect,
}: {
  cfg: Record<string, unknown>;
  onCfgChange: (key: string, value: unknown) => void;
  onPipelineSelect: (pipelineId: string) => void;
}) {
  const selectedStatus = (cfg.required_status as string) ?? "";
  return (
    <div className="space-y-1.5">
      <select
        value={selectedStatus}
        onChange={(e) => onCfgChange("required_status", e.target.value)}
        className="w-full h-7 rounded-md border border-zinc-600 bg-zinc-800 px-2 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-primary/50"
      >
        <option value="" className="bg-zinc-800">Qualquer status (sempre copiar)</option>
        {TICKET_STATUS_OPTIONS.map((s) => (
          <option key={s.value} value={s.value} className="bg-zinc-800">
            {s.label}
          </option>
        ))}
      </select>
      <PipelineStageSelector
        cfg={cfg}
        onCfgChange={onCfgChange}
        onPipelineSelect={onPipelineSelect}
        pipelinePlaceholder="Selecionar funil destino"
        stagePlaceholder="Selecionar etapa destino"
      />
    </div>
  );
}

export function AutomationRow({ automation, onChange, onDelete }: AutomationRowProps) {
  function handleActionTypeChange(newType: AutomationActionType) {
    onChange({ ...automation, action_type: newType, action_config: {} });
  }

  function handleConfigChange(key: string, value: unknown) {
    onChange({
      ...automation,
      action_config: { ...automation.action_config, [key]: value },
    });
  }

  function toggleActive() {
    onChange({ ...automation, is_active: !automation.is_active });
  }

  const cfg = automation.action_config;

  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-800/50 p-3 space-y-2">
      {/* Linha principal */}
      <div className="flex items-center gap-2">
        <Zap className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
        <span className="text-xs text-zinc-400 flex-shrink-0">Ao entrar na etapa</span>
        <span className="text-xs text-zinc-600 flex-shrink-0">→</span>

        <select
          value={automation.action_type}
          onChange={(e) => handleActionTypeChange(e.target.value as AutomationActionType)}
          className="flex-1 min-w-0 h-7 rounded-md border border-zinc-600 bg-zinc-800 px-2 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-primary/50"
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-zinc-800">
              {opt.label}
            </option>
          ))}
        </select>

        {/* Toggle is_active */}
        <button
          type="button"
          onClick={toggleActive}
          title={automation.is_active ? "Desativar" : "Ativar"}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none ${
            automation.is_active ? "bg-primary" : "bg-zinc-700"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
              automation.is_active ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0 text-zinc-500 hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Delay */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-zinc-400">Executar após</span>
        <input
          type="number"
          min={0}
          value={automation.delay_minutes}
          onChange={(e) =>
            onChange({ ...automation, delay_minutes: Math.max(0, Number(e.target.value)) })
          }
          className="h-6 w-16 rounded border border-zinc-600 bg-zinc-800 px-2 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <span className="text-[10px] text-zinc-400">min</span>
      </div>

      {/* Campos de config por action_type */}
      {automation.action_type === "whatsapp_message" && (
        <div className="space-y-1.5">
          <Input
            value={(cfg.to as string) ?? ""}
            onChange={(e) => handleConfigChange("to", e.target.value)}
            placeholder="Para: número ou {{tecnico_telefone}}"
            className={`${inputDark} font-mono`}
          />
          <VariableChips
            onInsert={(v) => handleConfigChange("to", ((cfg.to as string) ?? "") + v)}
          />
          <textarea
            value={(cfg.message as string) ?? ""}
            onChange={(e) => handleConfigChange("message", e.target.value)}
            placeholder="Mensagem..."
            rows={3}
            className={textareaDark}
          />
          <VariableChips
            onInsert={(v) => handleConfigChange("message", ((cfg.message as string) ?? "") + v)}
          />
        </div>
      )}

      {automation.action_type === "create_task" && (
        <div className="space-y-1.5">
          <Input
            value={(cfg.title as string) ?? ""}
            onChange={(e) => handleConfigChange("title", e.target.value)}
            placeholder="Título da tarefa"
            className={inputDark}
          />
          <VariableChips
            onInsert={(v) => handleConfigChange("title", ((cfg.title as string) ?? "") + v)}
          />
          <textarea
            value={(cfg.description as string) ?? ""}
            onChange={(e) => handleConfigChange("description", e.target.value)}
            placeholder="Descrição (opcional)"
            rows={2}
            className={textareaDark}
          />
          <Input
            value={(cfg.squad_user_id as string) ?? ""}
            onChange={(e) => handleConfigChange("squad_user_id", e.target.value)}
            placeholder="ID do usuário no Squad (responsável)"
            className={`${inputDark} font-mono`}
          />
        </div>
      )}

      {automation.action_type === "notify_user" && (
        <div className="space-y-1.5">
          <Input
            value={(cfg.squad_user_id as string) ?? ""}
            onChange={(e) => handleConfigChange("squad_user_id", e.target.value)}
            placeholder="ID do usuário no Squad"
            className={`${inputDark} font-mono`}
          />
          <textarea
            value={(cfg.message as string) ?? ""}
            onChange={(e) => handleConfigChange("message", e.target.value)}
            placeholder="Mensagem para o workspace"
            rows={2}
            className={textareaDark}
          />
          <VariableChips
            onInsert={(v) => handleConfigChange("message", ((cfg.message as string) ?? "") + v)}
          />
        </div>
      )}

      {automation.action_type === "move_stage" && (
        <PipelineStageSelector
          cfg={cfg}
          onCfgChange={handleConfigChange}
          onPipelineSelect={(pipelineId) =>
            onChange({
              ...automation,
              action_config: {
                ...automation.action_config,
                target_pipeline_id: pipelineId,
                target_stage_id: "",
              },
            })
          }
          pipelinePlaceholder="Selecionar funil de destino"
          stagePlaceholder="Selecionar etapa de destino"
        />
      )}

      {automation.action_type === "send_email" && (
        <div className="space-y-1.5">
          <Input
            value={(cfg.subject as string) ?? ""}
            onChange={(e) => handleConfigChange("subject", e.target.value)}
            placeholder="Assunto"
            className={inputDark}
          />
          <textarea
            value={(cfg.body as string) ?? ""}
            onChange={(e) => handleConfigChange("body", e.target.value)}
            placeholder="Corpo do e-mail"
            rows={3}
            className={textareaDark}
          />
        </div>
      )}

      {automation.action_type === "create_copy" && (
        <CopyConfigSection
          cfg={cfg}
          onCfgChange={handleConfigChange}
          onPipelineSelect={(pipelineId) =>
            onChange({
              ...automation,
              action_config: {
                ...automation.action_config,
                target_pipeline_id: pipelineId,
                target_stage_id: "",
              },
            })
          }
        />
      )}

      {automation.action_type === "create_copy_if_status" && (
        <ConditionalCopyConfigSection
          cfg={cfg}
          onCfgChange={handleConfigChange}
          onPipelineSelect={(pipelineId) =>
            onChange({
              ...automation,
              action_config: {
                ...automation.action_config,
                target_pipeline_id: pipelineId,
                target_stage_id: "",
              },
            })
          }
        />
      )}
    </div>
  );
}
