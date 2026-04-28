// src/components/crm/AutomationRow.tsx
import { Zap, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
];

const VARIABLES = [
  { label: "{{cliente_nome}}", key: "{{cliente_nome}}" },
  { label: "{{tecnico_nome}}", key: "{{tecnico_nome}}" },
  { label: "{{tecnico_telefone}}", key: "{{tecnico_telefone}}" },
  { label: "{{etapa_nome}}", key: "{{etapa_nome}}" },
  { label: "{{funil_nome}}", key: "{{funil_nome}}" },
  { label: "{{ticket_numero}}", key: "{{ticket_numero}}" },
];

function VariableChips({ onInsert }: { onInsert: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {VARIABLES.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => onInsert(v.key)}
          className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors font-mono"
        >
          {v.label}
        </button>
      ))}
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
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      {/* Linha principal */}
      <div className="flex items-center gap-2">
        <Zap className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
        <span className="text-xs text-muted-foreground flex-shrink-0">Ao entrar na etapa</span>
        <span className="text-xs text-muted-foreground flex-shrink-0">→</span>

        <select
          value={automation.action_type}
          onChange={(e) => handleActionTypeChange(e.target.value as AutomationActionType)}
          className="flex-1 min-w-0 h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
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
            automation.is_active ? "bg-primary" : "bg-input"
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
          className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Delay */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Executar após</span>
        <input
          type="number"
          min={0}
          value={automation.delay_minutes}
          onChange={(e) =>
            onChange({ ...automation, delay_minutes: Math.max(0, Number(e.target.value)) })
          }
          className="h-6 w-16 rounded border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="text-[10px] text-muted-foreground">min</span>
      </div>

      {/* Campos de config por action_type */}
      {automation.action_type === "whatsapp_message" && (
        <div className="space-y-1.5">
          <Input
            value={(cfg.to as string) ?? ""}
            onChange={(e) => handleConfigChange("to", e.target.value)}
            placeholder="Para: número ou {{tecnico_telefone}}"
            className="h-7 text-xs font-mono"
          />
          <VariableChips
            onInsert={(v) =>
              handleConfigChange("to", ((cfg.to as string) ?? "") + v)
            }
          />
          <textarea
            value={(cfg.message as string) ?? ""}
            onChange={(e) => handleConfigChange("message", e.target.value)}
            placeholder="Mensagem..."
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <VariableChips
            onInsert={(v) =>
              handleConfigChange("message", ((cfg.message as string) ?? "") + v)
            }
          />
        </div>
      )}

      {automation.action_type === "create_task" && (
        <div className="space-y-1.5">
          <Input
            value={(cfg.title as string) ?? ""}
            onChange={(e) => handleConfigChange("title", e.target.value)}
            placeholder="Título da tarefa"
            className="h-7 text-xs"
          />
          <VariableChips
            onInsert={(v) =>
              handleConfigChange("title", ((cfg.title as string) ?? "") + v)
            }
          />
          <textarea
            value={(cfg.description as string) ?? ""}
            onChange={(e) => handleConfigChange("description", e.target.value)}
            placeholder="Descrição (opcional)"
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <Input
            value={(cfg.squad_user_id as string) ?? ""}
            onChange={(e) => handleConfigChange("squad_user_id", e.target.value)}
            placeholder="ID do usuário no Squad (responsável)"
            className="h-7 text-xs font-mono"
          />
        </div>
      )}

      {automation.action_type === "notify_user" && (
        <div className="space-y-1.5">
          <Input
            value={(cfg.squad_user_id as string) ?? ""}
            onChange={(e) => handleConfigChange("squad_user_id", e.target.value)}
            placeholder="ID do usuário no Squad"
            className="h-7 text-xs font-mono"
          />
          <textarea
            value={(cfg.message as string) ?? ""}
            onChange={(e) => handleConfigChange("message", e.target.value)}
            placeholder="Mensagem para o workspace"
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <VariableChips
            onInsert={(v) =>
              handleConfigChange("message", ((cfg.message as string) ?? "") + v)
            }
          />
        </div>
      )}

      {automation.action_type === "move_stage" && (
        <p className="text-xs text-muted-foreground italic">
          Configurar após criar a automação
        </p>
      )}

      {automation.action_type === "send_email" && (
        <div className="space-y-1.5">
          <Input
            value={(cfg.subject as string) ?? ""}
            onChange={(e) => handleConfigChange("subject", e.target.value)}
            placeholder="Assunto"
            className="h-7 text-xs"
          />
          <textarea
            value={(cfg.body as string) ?? ""}
            onChange={(e) => handleConfigChange("body", e.target.value)}
            placeholder="Corpo do e-mail"
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>
      )}
    </div>
  );
}
