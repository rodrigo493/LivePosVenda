import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";
import { PREVIEW_ROWS } from "@/constants/limits";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Order matters: first 6 columns map to these fields in order as fallback
const FIELD_ORDER = ["service_date", "client_name", "device", "problem_reported", "solution_provided", "service_status"];

const HEADER_ALIASES: Record<string, string[]> = {
  service_date: ["inicio do atendimento", "inicio", "data do atendimento", "data", "date"],
  client_name: ["nome do cliente", "nome", "cliente"],
  device: ["aparelho", "equipamento", "device", "produto"],
  problem_reported: ["problema relatado", "problema", "problem"],
  solution_provided: ["solucao apresentada", "solucao", "solution"],
  service_status: ["status do atendimento", "status", "situacao"],
};

// Matching priorities: longer alias matches first to avoid "cliente" matching before "problema relatado"
function matchField(normalizedHeader: string): string | null {
  let bestMatch: { field: string; aliasLen: number } | null = null;
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const normAlias = normalize(alias);
      if (normalizedHeader.includes(normAlias)) {
        if (!bestMatch || normAlias.length > bestMatch.aliasLen) {
          bestMatch = { field, aliasLen: normAlias.length };
        }
      }
    }
  }
  return bestMatch?.field || null;
}

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function mapHeaders(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const usedFields = new Set<string>();

  // First pass: match by best (longest) alias match
  for (const header of headers) {
    if (header.startsWith("__EMPTY")) continue; // skip empty xlsx columns
    const norm = normalize(header);
    const field = matchField(norm);
    if (field && !usedFields.has(field)) {
      map[header] = field;
      usedFields.add(field);
    }
  }

  // Second pass: if not all fields matched, use column position as fallback
  if (usedFields.size < FIELD_ORDER.length) {
    headers.forEach((header, idx) => {
      if (!map[header] && idx < FIELD_ORDER.length && !usedFields.has(FIELD_ORDER[idx])) {
        map[header] = FIELD_ORDER[idx];
        usedFields.add(FIELD_ORDER[idx]);
      }
    });
  }

  return map;
}

function parseDate(value: any): string | null {
  if (!value) return null;
  if (typeof value === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    const d = new Date(excelEpoch.getTime() + value * 86400000);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const str = String(value);
  const parts = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (parts) {
    const day = parseInt(parts[1]);
    const month = parseInt(parts[2]) - 1;
    let year = parseInt(parts[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function readFile(file: File): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "", range: 1 });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
    reader.readAsArrayBuffer(file);
  });
}

export function BulkHistoryImportDialog({ open, onOpenChange }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [allRows, setAllRows] = useState<Record<string, any>[]>([]);
  const [preview, setPreview] = useState<Record<string, any>[]>([]);
  const [headerMap, setHeaderMap] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; linked: number; skipped: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);

    try {
      const rows = await readFile(f);
      if (rows.length === 0) {
        toast.error("Arquivo vazio ou sem dados válidos");
        return;
      }
      const headers = Object.keys(rows[0]);
      const map = mapHeaders(headers);
      setHeaderMap(map);
      setAllRows(rows);
      setPreview(rows.slice(0, PREVIEW_ROWS));
    } catch (err: any) {
      toast.error("Erro ao ler arquivo: " + (err.message || "formato inválido"));
    }
  };

  const handleImport = async () => {
    if (!allRows.length) return;
    setImporting(true);
    setResult(null);

    try {
      // Map all rows
      const mapped = allRows.map((row) => {
        const r: Record<string, any> = {};
        for (const [header, field] of Object.entries(headerMap)) {
          r[field] = row[header] ?? null;
        }
        return r;
      });

      // Get unique client names
      const clientNames = [...new Set(
        mapped.map((r) => String(r.client_name || "").trim()).filter(Boolean)
      )];

      // Fetch existing clients
      const { data: existingClients } = await supabase
        .from("clients")
        .select("id, name");

      const clientMap = new Map<string, string>();
      for (const c of existingClients || []) {
        clientMap.set(normalize(c.name), c.id);
      }

      let created = 0;
      // Create missing clients
      for (const name of clientNames) {
        if (!clientMap.has(normalize(name))) {
          const { data: newClient, error } = await supabase
            .from("clients")
            .insert({ name, created_by: user?.id })
            .select("id")
            .single();
          if (!error && newClient) {
            clientMap.set(normalize(name), newClient.id);
            created++;
          }
        }
      }

      // Build history records
      let skipped = 0;
      const records: any[] = [];
      // Track last known client name for rows without one
      let lastClientName = "";

      for (const r of mapped) {
        const rawName = String(r.client_name || "").trim();
        const clientName = rawName || lastClientName;
        if (rawName) lastClientName = rawName;

        const clientId = clientMap.get(normalize(clientName));
        if (!clientId) {
          skipped++;
          continue;
        }

        records.push({
          client_id: clientId,
          service_date: parseDate(r.service_date) || new Date().toISOString(),
          device: r.device ? String(r.device) : null,
          problem_reported: r.problem_reported ? String(r.problem_reported) : null,
          solution_provided: r.solution_provided ? String(r.solution_provided) : null,
          service_status: r.service_status ? String(r.service_status) : "concluido",
          created_by: user?.id || null,
        });
      }

      // Insert in batches
      for (let i = 0; i < records.length; i += 50) {
        const { error } = await supabase
          .from("client_service_history")
          .insert(records.slice(i, i + 50));
        if (error) throw error;
      }

      setResult({ created, linked: records.length, skipped });
      toast.success(`${records.length} registros importados!`);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client_service_history"] });
    } catch (err: any) {
      toast.error("Erro ao importar: " + (err.message || "Erro desconhecido"));
    } finally {
      setImporting(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setFile(null);
      setPreview([]);
      setAllRows([]);
      setResult(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar Histórico em Massa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Importe uma planilha <strong>.xlsx</strong> ou <strong>.csv</strong> com as colunas:
            <strong> Nome do Cliente, Data do Atendimento, Aparelho, Problema Relatado, Solução, Status</strong>.
            Clientes que não existirem serão criados automaticamente.
          </p>

          <div className="flex items-center gap-3">
            <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
            <Button variant="outline" onClick={() => inputRef.current?.click()} className="gap-2">
              <Upload className="h-4 w-4" /> Selecionar Arquivo
            </Button>
            {file && <span className="text-sm text-muted-foreground">{file.name}</span>}
          </div>

          {preview.length > 0 && !result && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Pré-visualização (primeiros 5 registros):</p>
              <div className="overflow-x-auto rounded-lg border text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {Object.keys(preview[0]).map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                          {h}
                          {headerMap[h] && (
                            <span className="ml-1 text-primary text-[10px]">→ {headerMap[h]}</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        {Object.entries(row).map(([key, v], j) => {
                          let display = String(v) || "—";
                          if (v instanceof Date && !isNaN(v.getTime())) {
                            const dd = String(v.getDate()).padStart(2, "0");
                            const mm = String(v.getMonth() + 1).padStart(2, "0");
                            const yyyy = v.getFullYear();
                            const hh = String(v.getHours()).padStart(2, "0");
                            const min = String(v.getMinutes()).padStart(2, "0");
                            display = `${dd}/${mm}/${yyyy} ${hh}:${min}`;
                          }
                          return <td key={j} className="px-3 py-2 max-w-[200px] truncate">{display}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">Total: <strong>{allRows.length}</strong> registros encontrados</p>
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-primary font-medium">
                <CheckCircle2 className="h-5 w-5" /> Importação concluída!
              </div>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>✅ <strong>{result.created}</strong> novos clientes criados</li>
                <li>✅ <strong>{result.linked}</strong> registros de histórico importados</li>
                {result.skipped > 0 && (
                  <li className="flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5 text-warning" />
                    <strong>{result.skipped}</strong> registros ignorados (sem nome de cliente)
                  </li>
                )}
              </ul>
            </div>
          )}

          {preview.length > 0 && !result && (
            <div className="flex justify-end">
              <Button onClick={handleImport} disabled={importing} className="gap-2">
                {importing ? "Importando..." : `Importar ${allRows.length} Registros`}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
