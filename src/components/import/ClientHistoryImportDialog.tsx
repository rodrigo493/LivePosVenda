import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCreateClientHistory } from "@/hooks/useClientHistory";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Upload, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { PREVIEW_ROWS } from "@/constants/limits";

interface Props {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const HEADER_ALIASES: Record<string, string[]> = {
  service_date: ["data do atendimento", "data", "date", "data atendimento"],
  device: ["aparelho", "equipamento", "device", "produto", "aparelho com o"],
  problem_reported: ["problema relatado pelo cliente", "problema relatado", "problema", "problem"],
  solution_provided: ["solução apresentada ao cliente", "solução apresentada", "solução", "solucao", "solution"],
  service_status: ["status do atendimento", "status", "situação", "situacao"],
};

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function mapHeaders(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const header of headers) {
    const norm = normalize(header);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((a) => norm.includes(normalize(a)))) {
        map[header] = field;
        break;
      }
    }
  }
  return map;
}

function parseDate(value: any): string | null {
  if (!value) return null;
  // Handle Excel serial date numbers
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

function readFile(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
    reader.readAsArrayBuffer(file);
  });
}

export function ClientHistoryImportDialog({ clientId, open, onOpenChange }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [headerMap, setHeaderMap] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const createHistory = useCreateClientHistory();
  const { user } = useAuth();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);

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

    const records = allRows.map((row) => {
      const mapped: Record<string, any> = {};
      for (const [header, field] of Object.entries(headerMap)) {
        mapped[field] = row[header] || null;
      }
      return {
        client_id: clientId,
        service_date: parseDate(mapped.service_date) || new Date().toISOString(),
        device: mapped.device ? String(mapped.device) : null,
        problem_reported: mapped.problem_reported ? String(mapped.problem_reported) : null,
        solution_provided: mapped.solution_provided ? String(mapped.solution_provided) : null,
        service_status: mapped.service_status ? String(mapped.service_status) : "concluido",
        created_by: user?.id || null,
      };
    });

    try {
      for (let i = 0; i < records.length; i += 50) {
        await createHistory.mutateAsync(records.slice(i, i + 50));
      }
      toast.success(`${records.length} registros importados com sucesso!`);
      onOpenChange(false);
      setFile(null);
      setPreview([]);
      setAllRows([]);
    } catch (err: any) {
      toast.error("Erro ao importar: " + (err.message || "Erro desconhecido"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar Histórico via Excel/CSV
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Selecione um arquivo <strong>.xlsx</strong> ou <strong>.csv</strong> com as colunas:
            <strong> Data do Atendimento, Aparelho, Problema Relatado, Solução Apresentada, Status do Atendimento</strong>.
          </p>

          <div className="flex items-center gap-3">
            <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
            <Button variant="outline" onClick={() => inputRef.current?.click()} className="gap-2">
              <Upload className="h-4 w-4" /> Selecionar Arquivo
            </Button>
            {file && <span className="text-sm text-muted-foreground">{file.name}</span>}
          </div>

          {preview.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Pré-visualização (primeiros 5 registros):</p>
              <div className="overflow-x-auto rounded-lg border text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {Object.keys(preview[0]).map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">
                          {h}
                          {headerMap[h] && (
                            <span className="ml-1 text-primary">→ {headerMap[h]}</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="px-3 py-2 max-w-[150px] truncate">{v || "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">Total: {allRows.length} registros encontrados</p>
            </div>
          )}

          {preview.length > 0 && (
            <div className="flex justify-end">
              <Button onClick={handleImport} disabled={importing} className="gap-2">
                {importing ? "Importando..." : `Confirmar Importação (${allRows.length})`}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
