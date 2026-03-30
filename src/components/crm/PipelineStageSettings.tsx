import { useState, useEffect } from "react";
import { Kanban, Save, AlertTriangle, Clock, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { usePipelineSettings } from "@/hooks/usePipelineSettings";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";

export function PipelineStageSettings({ disabled }: { disabled: boolean }) {
  const { data: stages, isLoading } = usePipelineSettings();
  const qc = useQueryClient();
  const [local, setLocal] = useState<Record<string, { delay: string; color: string }>>({});

  useEffect(() => {
    if (stages) {
      const map: Record<string, { delay: string; color: string }> = {};
      stages.forEach((s) => {
        map[s.key] = { delay: String(s.delayDays), color: s.color };
      });
      setLocal(map);
    }
  }, [stages]);

  const saveMutation = useMutation({
    mutationFn: async ({ stageKey, delay, color }: { stageKey: string; delay: string; color: string }) => {
      const updates = [
        supabase.from("system_settings").update({ value: JSON.stringify(delay) }).eq("key", `pipeline_delay_${stageKey}`),
        supabase.from("system_settings").update({ value: JSON.stringify(color) }).eq("key", `pipeline_color_${stageKey}`),
      ];
      const results = await Promise.all(updates);
      results.forEach((r) => { if (r.error) throw r.error; });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline-settings"] });
      qc.invalidateQueries({ queryKey: ["system_settings"] });
      toast.success("Configuração salva!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao salvar");
    },
  });

  if (isLoading || !stages) {
    return <p className="text-sm text-muted-foreground">Carregando configurações do pipeline...</p>;
  }

  const hasChanges = (key: string) => {
    const stage = stages.find((s) => s.key === key);
    if (!stage || !local[key]) return false;
    return local[key].delay !== String(stage.delayDays) || local[key].color !== stage.color;
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Configure o tempo (em dias) para que um atendimento seja considerado <strong>atrasado</strong> em cada etapa, além da cor de identificação.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {stages.map((stage, i) => {
          const l = local[stage.key] || { delay: "2", color: stage.color };
          const changed = hasChanges(stage.key);

          return (
            <motion.div
              key={stage.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="p-4 rounded-xl border bg-muted/30 hover:bg-muted/50 transition-colors space-y-3"
            >
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                <span className="text-sm font-semibold">{stage.label}</span>
                {changed && (
                  <Badge variant="outline" className="text-[9px] h-4 ml-auto border-primary/40 text-primary">
                    alterado
                  </Badge>
                )}
              </div>

              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-[11px] flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" /> Dias para atraso
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    max="999"
                    value={l.delay}
                    onChange={(e) => setLocal({ ...local, [stage.key]: { ...l, delay: e.target.value } })}
                    disabled={disabled}
                    className="h-8 text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {Number(l.delay) >= 999 ? (
                      "Atraso desativado nesta etapa"
                    ) : (
                      <>
                        <AlertTriangle className="h-2.5 w-2.5 inline mr-0.5 text-destructive" />
                        Destacar como atrasado após <strong>{l.delay}</strong> dia{Number(l.delay) > 1 ? "s" : ""} sem interação
                      </>
                    )}
                  </p>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] flex items-center gap-1 text-muted-foreground">
                    <Palette className="h-3 w-3" /> Cor da etapa
                  </Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="text"
                      value={l.color}
                      onChange={(e) => setLocal({ ...local, [stage.key]: { ...l, color: e.target.value } })}
                      disabled={disabled}
                      className="h-8 text-xs flex-1 font-mono"
                    />
                    <div className="h-8 w-8 rounded-md border shrink-0" style={{ backgroundColor: l.color }} />
                  </div>
                </div>
              </div>

              {changed && !disabled && (
                <Button
                  size="sm"
                  className="w-full gap-1 h-7 text-xs"
                  onClick={() => saveMutation.mutate({ stageKey: stage.key, delay: l.delay, color: l.color })}
                  disabled={saveMutation.isPending}
                >
                  <Save className="h-3 w-3" /> Salvar
                </Button>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
