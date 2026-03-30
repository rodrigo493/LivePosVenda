import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Upload, CheckCircle, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";

const STAGE_MAP: Record<string, string> = {
  "sem atendimento": "sem_atendimento",
  "primeiro contato": "primeiro_contato",
  "em analise": "em_analise",
  "em análise": "em_analise",
  "separacao de pecas": "separacao_pecas",
  "separação de peças": "separacao_pecas",
  "separação de pecas": "separacao_pecas",
  "concluido": "concluido",
  "concluído": "concluido",
  "sem interacao": "sem_interacao",
  "sem interação": "sem_interacao",
};

function normalizeStage(raw: string): string {
  const key = raw.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Try with accents first
  const withAccents = raw.trim().toLowerCase();
  if (STAGE_MAP[withAccents]) return STAGE_MAP[withAccents];
  // Try normalized
  for (const [k, v] of Object.entries(STAGE_MAP)) {
    const normK = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normK === key) return v;
  }
  return "sem_atendimento";
}

function parseExcelDate(value: any): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") {
    const d = XLSX.SSF.parse_date_code(value);
    return new Date(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, d.S || 0).toISOString();
  }
  const str = String(value).trim();
  // Try DD/MM/YY or DD/MM/YYYY
  const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (brMatch) {
    let year = parseInt(brMatch[3]);
    if (year < 100) year += 2000;
    return new Date(year, parseInt(brMatch[2]) - 1, parseInt(brMatch[1])).toISOString();
  }
  // Try M/D/YY (US format from Excel)
  const usMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (usMatch) {
    let year = parseInt(usMatch[3]);
    if (year < 100) year += 2000;
    return new Date(year, parseInt(usMatch[1]) - 1, parseInt(usMatch[2])).toISOString();
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

interface ParsedRow {
  name: string;
  date: string;
  stage: string;
  stageLabel: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PipelineExcelImportDialog({ open, onOpenChange }: Props) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const qc = useQueryClient();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });

      const parsed: ParsedRow[] = json
        .map((row: any) => {
          const keys = Object.keys(row);
          const name = String(row[keys[0]] || "").trim();
          const dateRaw = row[keys[1]];
          const stageRaw = String(row[keys[2]] || "").trim();
          if (!name) return null;
          const stage = normalizeStage(stageRaw);
          return {
            name,
            date: parseExcelDate(dateRaw),
            stage,
            stageLabel: stageRaw || "Sem atendimento",
          };
        })
        .filter(Boolean) as ParsedRow[];

      setRows(parsed);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!rows.length || !user) return;
    setImporting(true);
    let created = 0;
    let skipped = 0;

    try {
      for (const row of rows) {
        // Check if client exists by name
        const { data: existing } = await supabase
          .from("clients")
          .select("id, name")
          .ilike("name", row.name)
          .limit(1);

        let clientId: string;

        if (existing && existing.length > 0) {
          clientId = existing[0].id;
        } else {
          const { data: newClient, error: clientErr } = await supabase
            .from("clients")
            .insert({ name: row.name, created_by: user.id })
            .select("id")
            .single();
          if (clientErr) {
            skipped++;
            continue;
          }
          clientId = newClient.id;
        }

        // Check if ticket already exists for this client in pipeline
        const { data: existingTicket } = await supabase
          .from("tickets")
          .select("id")
          .eq("client_id", clientId)
          .not("status", "eq", "fechado")
          .limit(1);

        if (existingTicket && existingTicket.length > 0) {
          // Update pipeline stage
          await supabase
            .from("tickets")
            .update({
              pipeline_stage: row.stage,
              last_interaction_at: row.date,
            })
            .eq("id", existingTicket[0].id);
          created++;
          continue;
        }

        // For "concluido" stage, create closed ticket + history record
        const isConcluido = row.stage === "concluido";

        // Create ticket
        const { error: ticketErr } = await (supabase as any)
          .from("tickets")
          .insert({
            client_id: clientId,
            equipment_id: null,
            ticket_type: "assistencia",
            title: `Atendimento - ${row.name}`,
            ticket_number: "",
            pipeline_stage: row.stage,
            status: isConcluido ? "fechado" : "aberto",
            closed_at: isConcluido ? row.date : null,
            created_by: user.id,
            created_at: row.date,
            last_interaction_at: row.date,
          });

        if (ticketErr) {
          skipped++;
        } else {
          // Create history record for concluido imports
          if (isConcluido) {
            await (supabase as any).from("client_service_history").insert({
              client_id: clientId,
              service_date: row.date,
              problem_reported: `Atendimento - ${row.name}`,
              service_status: "concluido",
              created_by: user.id,
            });
          }
          created++;
        }
      }

      setResult({ created, skipped });
      qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client_service_history"] });
      toast.success(`Importação concluída: ${created} cards criados, ${skipped} ignorados`);
    } catch (err: any) {
      toast.error(err.message || "Erro na importação");
    } finally {
      setImporting(false);
    }
  };

  const handleClose = (o: boolean) => {
    if (!o) {
      setRows([]);
      setResult(null);
      if (fileRef.current) fileRef.current.value = "";
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar Leads do Pipeline
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Selecione um arquivo Excel com as colunas: <strong>Nome</strong>, <strong>Data Criação</strong>, <strong>Etapa do Funil</strong>.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFile}
            className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
          />

          {rows.length > 0 && !result && (
            <>
              <div className="rounded-lg border max-h-[350px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs text-muted-foreground">#</th>
                      <th className="text-left px-3 py-2 text-xs text-muted-foreground">Nome</th>
                      <th className="text-left px-3 py-2 text-xs text-muted-foreground">Data</th>
                      <th className="text-left px-3 py-2 text-xs text-muted-foreground">Etapa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-1.5 font-medium">{r.name}</td>
                        <td className="px-3 py-1.5">
                          {new Date(r.date).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-3 py-1.5">{r.stageLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{rows.length} registros encontrados</span>
                <Button onClick={handleImport} disabled={importing} className="gap-1.5">
                  <Upload className="h-4 w-4" />
                  {importing ? "Importando..." : "Importar para o Pipeline"}
                </Button>
              </div>
            </>
          )}

          {result && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-primary" />
                <span><strong>{result.created}</strong> cards criados/atualizados</span>
              </div>
              {result.skipped > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span><strong>{result.skipped}</strong> registros ignorados</span>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => handleClose(false)} className="mt-2">
                Fechar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
