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

      {/* Campos de config por action_type */}
      {automation.action_type === "whatsapp_message" && (
        <textarea
          value={(cfg.message as string) ?? ""}
          onChange={(e) => handleConfigChange("message", e.target.value)}
          placeholder="Mensagem..."
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      )}

      {automation.action_type === "create_task" && (
        <div className="space-y-1.5">
          <Input
            value={(cfg.title as string) ?? ""}
            onChange={(e) => handleConfigChange("title", e.target.value)}
            placeholder="Título da tarefa"
            className="h-7 text-xs"
          />
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={(cfg.due_days as number) ?? ""}
              onChange={(e) => handleConfigChange("due_days", Number(e.target.value))}
              placeholder="0"
              className="h-7 w-20 text-xs"
            />
            <span className="text-xs text-muted-foreground">dia(s) para vencer</span>
          </div>
        </div>
      )}

      {automation.action_type === "notify_user" && (
        <Input
          value={(cfg.message as string) ?? ""}
          onChange={(e) => handleConfigChange("message", e.target.value)}
          placeholder="Mensagem de notificação"
          className="h-7 text-xs"
        />
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
