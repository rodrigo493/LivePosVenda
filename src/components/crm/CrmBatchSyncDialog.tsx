import { useState } from "react";
import { Upload, CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SyncReport {
  updated: number;
  notFound: string[];
  conflicts: string[];
  stageChanges: number;
  errors: string[];
  details: { name: string; status: string; stage?: string; ticketNumber?: string }[];
}

function parseEntries(text: string): { name: string; stage: string }[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l.includes("|"))
    .map((l) => {
      const [name, stage] = l.split("|").map((s) => s.trim());
      return { name, stage };
    })
    .filter((e) => e.name && e.stage);
}

export function CrmBatchSyncDialog({ open, onOpenChange }: Props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);
  const qc = useQueryClient();

  const entries = parseEntries(text);

  const handleSync = async () => {
    if (!entries.length) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-batch-sync", {
        body: { entries },
      });
      if (error) throw error;
      setReport(data as SyncReport);
      qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      toast.success(`Sincronização concluída: ${(data as SyncReport).updated} atualizados`);
    } catch (err: any) {
      toast.error("Erro na sincronização: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setText("");
    setReport(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> Sincronização em lote do CRM
          </DialogTitle>
        </DialogHeader>

        {!report ? (
          <div className="space-y-4 flex-1 overflow-auto">
            <p className="text-sm text-muted-foreground">
              Cole a lista no formato <code className="text-xs bg-muted px-1 rounded">Nome | ETAPA</code>, uma por linha.
            </p>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Luciana Oliveira | SEM ATENDIMENTO\nEleonora | CONCLUÍDO\n..."}
              rows={12}
              className="font-mono text-xs"
            />
            <div className="flex items-center justify-between">
              <Badge variant="secondary">{entries.length} entradas detectadas</Badge>
              <Button onClick={handleSync} disabled={loading || !entries.length}>
                {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sincronizando...</> : "Sincronizar"}
              </Button>
            </div>
          </div>
        ) : (
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{report.updated}</p>
                  <p className="text-[11px] text-muted-foreground">Atualizados</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold text-orange-500">{report.stageChanges}</p>
                  <p className="text-[11px] text-muted-foreground">Etapas alteradas</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold text-muted-foreground">{report.notFound.length}</p>
                  <p className="text-[11px] text-muted-foreground">Não encontrados</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold text-destructive">{report.conflicts.length}</p>
                  <p className="text-[11px] text-muted-foreground">Conflitos</p>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-1">
                <p className="text-xs font-semibold mb-2">Detalhes</p>
                {report.details.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-1 border-b last:border-0">
                    {d.status === "atualizado" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                    {d.status === "não encontrado" && <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    {d.status === "sem ticket" && <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />}
                    {d.status === "conflito" && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                    <span className="flex-1 truncate">{d.name}</span>
                    {d.ticketNumber && <Badge variant="outline" className="text-[9px] h-4">{d.ticketNumber}</Badge>}
                    <Badge variant={d.status === "atualizado" ? "default" : "secondary"} className="text-[9px] h-4">
                      {d.status}
                    </Badge>
                  </div>
                ))}
              </div>

              {report.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-destructive">Erros</p>
                  {report.errors.map((e, i) => (
                    <p key={i} className="text-[11px] text-destructive">{e}</p>
                  ))}
                </div>
              )}

              <Button variant="outline" className="w-full" onClick={reset}>Nova sincronização</Button>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
