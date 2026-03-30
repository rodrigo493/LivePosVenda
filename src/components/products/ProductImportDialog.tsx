import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Papa from "papaparse";

interface ProductImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const COLUMN_MAP: Record<string, string> = {
  codigo_produto: "code",
  codigo_secundario: "secondary_code",
  descricao: "name",
  unidade: "unit",
  tipo_produto: "product_type",
  grupo_produto: "product_group",
  familia_produto: "family",
  status: "status",
  categoria: "category",
  subcategoria: "subcategory",
  fornecedor: "supplier",
  custo_base: "base_cost",
  nome: "name",
  codigo: "code",
  code: "code",
  name: "name",
  ressuprimento: "ressuprimento",
};

type Step = "upload" | "preview" | "importing" | "done";

export function ProductImportDialog({ open, onOpenChange }: ProductImportDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState({ imported: 0, updated: 0, skipped: 0, errors: [] as string[] });
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const qc = useQueryClient();
  const reset = () => {
    setStep("upload");
    setRows([]);
    setHeaders([]);
    setMapping({});
    setResult({ imported: 0, updated: 0, skipped: 0, errors: [] });
    setFileName("");
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const h = results.meta.fields || [];
        setHeaders(h);
        setRows(results.data as Record<string, any>[]);
        // Auto-map
        const autoMap: Record<string, string> = {};
        h.forEach((col) => {
          const normalized = col.toLowerCase().trim().replace(/\s+/g, "_");
          if (COLUMN_MAP[normalized]) autoMap[col] = COLUMN_MAP[normalized];
        });
        setMapping(autoMap);
        setStep("preview");
      },
    });
  };

  const targetFields = ["code", "secondary_code", "name", "unit", "product_type", "product_group", "family", "category", "subcategory", "supplier", "base_cost", "status", "ressuprimento"];

  const handleImport = async () => {
    setStep("importing");
    let imported = 0, updated = 0, skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const mapped: Record<string, any> = {};
      Object.entries(mapping).forEach(([src, dst]) => {
        if (row[src] !== undefined && row[src] !== "") mapped[dst] = row[src];
      });

      if (!mapped.code || !mapped.name) {
        errors.push(`Linha ${i + 2}: código ou nome vazio`);
        skipped++;
        continue;
      }

      if (mapped.base_cost) mapped.base_cost = parseFloat(String(mapped.base_cost).replace(",", ".")) || 0;
      if (mapped.status) {
        mapped.status = mapped.status.toLowerCase().includes("inat") ? "inativo" : "ativo";
      }

      // Check existing
      const { data: existing } = await supabase.from("products").select("id").eq("code", mapped.code).maybeSingle();
      if (existing) {
        const { error } = await supabase.from("products").update(mapped).eq("id", existing.id);
        if (error) { errors.push(`Linha ${i + 2}: ${error.message}`); skipped++; } else updated++;
      } else {
        const { error } = await supabase.from("products").insert([mapped] as any);
        if (error) { errors.push(`Linha ${i + 2}: ${error.message}`); skipped++; } else imported++;
      }
    }

    // Log import
    await supabase.from("import_logs").insert({
      user_id: user?.id,
      file_name: fileName,
      total_rows: rows.length,
      imported_rows: imported,
      updated_rows: updated,
      skipped_rows: skipped,
      errors: errors as any,
    });

    setResult({ imported, updated, skipped, errors });
    setStep("done");
    qc.invalidateQueries({ queryKey: ["products"] });
    toast.success(`Importação concluída: ${imported} novos, ${updated} atualizados`);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Importar Peças (CSV/Planilha)</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Upload className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Selecione um arquivo CSV exportado do ERP Nomus</p>
            <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleFile} />
            <Button onClick={() => fileRef.current?.click()}>Selecionar Arquivo</Button>
            <p className="text-xs text-muted-foreground">Colunas esperadas: codigo_produto, descricao, unidade, tipo_produto, grupo_produto, familia_produto, status</p>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <p className="text-sm"><strong>{rows.length}</strong> registros encontrados em <strong>{fileName}</strong></p>
            
            {/* Column mapping */}
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Mapeamento de Colunas</p>
              <div className="grid grid-cols-2 gap-2">
                {headers.map((h) => (
                  <div key={h} className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-muted px-2 py-1 rounded truncate max-w-[120px]">{h}</span>
                    <span className="text-xs">→</span>
                    <select
                      className="text-xs border rounded px-2 py-1 bg-background flex-1"
                      value={mapping[h] || ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}
                    >
                      <option value="">Ignorar</option>
                      {targetFields.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview table */}
            <div className="overflow-x-auto max-h-48 border rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    {headers.slice(0, 8).map((h) => <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b">
                      {headers.slice(0, 8).map((h) => <td key={h} className="px-2 py-1 truncate max-w-[150px]">{row[h]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={reset}>Cancelar</Button>
              <Button onClick={handleImport} disabled={!mapping.code && !Object.values(mapping).includes("code")}>
                Importar {rows.length} Registros
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Importando registros...</p>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" /> Importação Concluída
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold font-mono">{result.imported}</p>
                <p className="text-xs text-muted-foreground">Novos</p>
              </div>
              <div className="bg-blue-500/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold font-mono">{result.updated}</p>
                <p className="text-xs text-muted-foreground">Atualizados</p>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold font-mono">{result.skipped}</p>
                <p className="text-xs text-muted-foreground">Ignorados</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="bg-destructive/10 rounded-lg p-3 max-h-32 overflow-y-auto">
                <p className="text-xs font-semibold flex items-center gap-1 mb-1"><AlertCircle className="h-3 w-3" /> Erros ({result.errors.length})</p>
                {result.errors.map((e, i) => <p key={i} className="text-xs text-muted-foreground">{e}</p>)}
              </div>
            )}
            <Button className="w-full" onClick={() => { reset(); onOpenChange(false); }}>Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
