import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { motion } from "framer-motion";
import Papa from "papaparse";

const COLUMN_MAP: Record<string, string> = {
  inicio_atendimento: "reference_date",
  data_atendimento: "reference_date",
  data: "reference_date",
  nome_cliente: "client_name",
  cliente: "client_name",
  nome: "client_name",
  produto: "product",
  equipamento: "product",
  modelo: "product",
  vendedor_ou_responsavel: "responsible",
  responsavel: "responsible",
  vendedor: "responsible",
  tipo_problema: "problem_type",
  tipo_de_problema: "problem_type",
  categoria_problema: "problem_type",
  problema_relatado_cliente: "problem_description",
  problema_relatado: "problem_description",
  descricao_problema: "problem_description",
  problema: "problem_description",
  tipo_falha: "failure_type",
  tipo_de_falha: "failure_type",
  solucao_apresentada_cliente: "solution",
  solucao_apresentada: "solution",
  solucao: "solution",
  setor_responsavel: "responsible_sector",
  setor: "responsible_sector",
  status_atendimento: "status",
  status: "status",
  tipo_resolucao: "resolution_type",
  tipo_de_resolucao: "resolution_type",
  numero_nota_fiscal: "invoice_number",
  nota_fiscal: "invoice_number",
  envio_pecas: "parts_sent",
  pecas_enviadas: "parts_sent",
  pecas: "parts_sent",
  custo_frete: "freight_cost",
  frete: "freight_cost",
};

const TARGET_FIELDS = [
  { value: "reference_date", label: "Data do Atendimento" },
  { value: "client_name", label: "Nome do Cliente" },
  { value: "product", label: "Produto/Equipamento" },
  { value: "responsible", label: "Responsável" },
  { value: "problem_type", label: "Tipo de Problema" },
  { value: "problem_description", label: "Problema Relatado" },
  { value: "failure_type", label: "Tipo de Falha" },
  { value: "solution", label: "Solução Apresentada" },
  { value: "responsible_sector", label: "Setor Responsável" },
  { value: "status", label: "Status" },
  { value: "resolution_type", label: "Tipo de Resolução" },
  { value: "invoice_number", label: "Nota Fiscal" },
  { value: "parts_sent", label: "Peças Enviadas" },
  { value: "freight_cost", label: "Custo de Frete" },
];

type Step = "upload" | "mapping" | "preview" | "importing" | "done";

type RowValidation = {
  row: Record<string, any>;
  mapped: Record<string, any>;
  index: number;
  status: "valid" | "warning" | "error";
  issues: string[];
};

const HistoricalImportPage = () => {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [validatedRows, setValidatedRows] = useState<RowValidation[]>([]);
  const [result, setResult] = useState({ imported: 0, skipped: 0, errors: [] as string[], clients_created: 0, tickets_created: 0 });
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const reset = () => {
    setStep("upload");
    setRows([]);
    setHeaders([]);
    setMapping({});
    setValidatedRows([]);
    setResult({ imported: 0, skipped: 0, errors: [], clients_created: 0, tickets_created: 0 });
    setFileName("");
    setProgress(0);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
      complete: (results) => {
        const h = results.meta.fields || [];
        setHeaders(h);
        setRows(results.data as Record<string, any>[]);
        const autoMap: Record<string, string> = {};
        h.forEach((col) => {
          const normalized = col.toLowerCase().trim().replace(/\s+/g, "_").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (COLUMN_MAP[normalized]) autoMap[col] = COLUMN_MAP[normalized];
        });
        setMapping(autoMap);
        setStep("mapping");
      },
    });
  };

  const handleValidate = () => {
    const validated: RowValidation[] = rows.map((row, index) => {
      const mapped: Record<string, any> = {};
      Object.entries(mapping).forEach(([src, dst]) => {
        if (row[src] !== undefined && row[src] !== "") mapped[dst] = row[src];
      });

      const issues: string[] = [];
      if (!mapped.client_name) issues.push("Cliente não informado");
      if (!mapped.problem_description && !mapped.problem_type) issues.push("Problema não informado");
      if (mapped.reference_date) {
        const d = new Date(mapped.reference_date);
        if (isNaN(d.getTime())) {
          // Try BR format
          const parts = String(mapped.reference_date).split("/");
          if (parts.length === 3) {
            mapped.reference_date = `${parts[2]}-${parts[1]}-${parts[0]}`;
          } else {
            issues.push("Data inválida");
          }
        }
      }
      if (mapped.freight_cost) {
        mapped.freight_cost = parseFloat(String(mapped.freight_cost).replace(",", ".")) || 0;
      }

      const status = issues.some(i => i.includes("Cliente")) ? "error" as const :
        issues.length > 0 ? "warning" as const : "valid" as const;

      return { row, mapped, index: index + 2, status, issues };
    });

    setValidatedRows(validated);
    setStep("preview");
  };

  const handleImport = async () => {
    setStep("importing");
    let imported = 0, skipped = 0, clientsCreated = 0, ticketsCreated = 0;
    const errors: string[] = [];
    const rowsToImport = validatedRows.filter(r => r.status !== "error");

    // Cache clients to avoid duplicate lookups
    const clientCache = new Map<string, string>();

    for (let i = 0; i < rowsToImport.length; i++) {
      const { mapped, index } = rowsToImport[i];
      setProgress(Math.round(((i + 1) / rowsToImport.length) * 100));

      try {
        // 1. Find or create client
        let clientId: string | null = null;
        const clientName = String(mapped.client_name || "").trim();

        if (clientCache.has(clientName.toLowerCase())) {
          clientId = clientCache.get(clientName.toLowerCase())!;
        } else if (clientName) {
          const { data: existing } = await supabase
            .from("clients")
            .select("id")
            .ilike("name", clientName)
            .limit(1);

          if (existing?.length) {
            clientId = existing[0].id;
          } else {
            const { data: newClient, error: cErr } = await supabase
              .from("clients")
              .insert({ name: clientName, notes: "Importado do histórico", status: "ativo" })
              .select("id")
              .single();
            if (cErr) {
              errors.push(`Linha ${index}: erro ao criar cliente - ${cErr.message}`);
              skipped++;
              continue;
            }
            clientId = newClient.id;
            clientsCreated++;
          }
          clientCache.set(clientName.toLowerCase(), clientId);
        }

        if (!clientId) {
          errors.push(`Linha ${index}: cliente não encontrado`);
          skipped++;
          continue;
        }

        // 2. Find or create equipment by product name
        let equipmentId: string | null = null;
        const productName = String(mapped.product || "").trim();

        if (productName) {
          // Try to find equipment model
          const { data: models } = await supabase
            .from("equipment_models")
            .select("id")
            .ilike("name", `%${productName}%`)
            .limit(1);

          let modelId: string | null = models?.[0]?.id || null;

          // Find equipment for this client with this model
          if (modelId) {
            const { data: equips } = await supabase
              .from("equipments")
              .select("id")
              .eq("client_id", clientId)
              .eq("model_id", modelId)
              .limit(1);
            equipmentId = equips?.[0]?.id || null;
          }

          // Create placeholder equipment if not found
          if (!equipmentId) {
            const { data: newEquip, error: eErr } = await supabase
              .from("equipments")
              .insert({
                serial_number: `HIST-${Date.now()}-${i}`,
                client_id: clientId,
                model_id: modelId,
                status: "historico",
                notes: `Importado: ${productName}`,
              })
              .select("id")
              .single();
            if (!eErr && newEquip) equipmentId = newEquip.id;
          }
        }

        // If still no equipment, create a generic one
        if (!equipmentId) {
          const { data: genEquip } = await supabase
            .from("equipments")
            .insert({
              serial_number: `HIST-GEN-${Date.now()}-${i}`,
              client_id: clientId,
              status: "historico",
              notes: "Equipamento genérico - importação histórica",
            })
            .select("id")
            .single();
          if (genEquip) equipmentId = genEquip.id;
        }

        if (!equipmentId) {
          errors.push(`Linha ${index}: erro ao criar equipamento`);
          skipped++;
          continue;
        }

        // 3. Create ticket
        const ticketStatus = (() => {
          const s = String(mapped.status || "").toLowerCase();
          if (s.includes("resolv") || s.includes("conclu") || s.includes("finaliz")) return "resolvido";
          if (s.includes("cancel")) return "fechado";
          if (s.includes("andamento") || s.includes("progress")) return "em_atendimento";
          return "fechado"; // historical records are typically closed
        })();

        const title = mapped.problem_description
          ? String(mapped.problem_description).slice(0, 200)
          : mapped.problem_type
            ? String(mapped.problem_type).slice(0, 200)
            : "Atendimento histórico importado";

        const { data: ticket, error: tErr } = await supabase
          .from("tickets")
          .insert({
            client_id: clientId,
            equipment_id: equipmentId,
            ticket_type: "assistencia" as const,
            title,
            description: [
              mapped.problem_description && `Problema: ${mapped.problem_description}`,
              mapped.failure_type && `Tipo de falha: ${mapped.failure_type}`,
              mapped.solution && `Solução: ${mapped.solution}`,
              mapped.responsible && `Responsável: ${mapped.responsible}`,
              mapped.responsible_sector && `Setor: ${mapped.responsible_sector}`,
              mapped.resolution_type && `Resolução: ${mapped.resolution_type}`,
              mapped.parts_sent && `Peças: ${mapped.parts_sent}`,
              mapped.freight_cost && `Frete: R$ ${mapped.freight_cost}`,
              mapped.invoice_number && `NF: ${mapped.invoice_number}`,
            ].filter(Boolean).join("\n"),
            problem_category: mapped.problem_type || mapped.failure_type || null,
            priority: "media",
            status: ticketStatus,
            ticket_number: "",
            origin: "importacao_planilha",
            channel: "historico",
            created_by: user?.id,
          } as any)
          .select("id")
          .single();

        if (tErr) {
          errors.push(`Linha ${index}: erro ao criar ticket - ${tErr.message}`);
          skipped++;
          continue;
        }

        ticketsCreated++;

        // 4. Create technical history entry
        if (ticket && equipmentId) {
          await supabase.from("technical_history").insert({
            equipment_id: equipmentId,
            event_type: "atendimento_historico",
            description: [
              mapped.problem_description || mapped.problem_type || "Atendimento histórico",
              mapped.solution && `Solução: ${mapped.solution}`,
            ].filter(Boolean).join(" | "),
            event_date: mapped.reference_date || new Date().toISOString(),
            reference_type: "ticket",
            reference_id: ticket.id,
            performed_by: user?.id,
            metadata: {
              origin: "importacao_planilha",
              failure_type: mapped.failure_type,
              resolution_type: mapped.resolution_type,
              parts_sent: mapped.parts_sent,
              freight_cost: mapped.freight_cost,
              invoice_number: mapped.invoice_number,
              responsible_sector: mapped.responsible_sector,
            },
          });
        }

        // 5. Save import record
        await supabase.from("historical_import_records").insert({
          source_file: fileName,
          source_row: index,
          client_name: mapped.client_name,
          product_name: mapped.product,
          problem_description: mapped.problem_description,
          solution: mapped.solution,
          status: mapped.status,
          reference_date: mapped.reference_date || null,
          ticket_id: ticket?.id,
          client_id: clientId,
          equipment_id: equipmentId,
          raw_data: mapped,
        });

        imported++;
      } catch (err: any) {
        errors.push(`Linha ${index}: ${err.message}`);
        skipped++;
      }
    }

    // Log import
    await supabase.from("import_logs").insert({
      user_id: user?.id,
      file_name: fileName,
      total_rows: rows.length,
      imported_rows: imported,
      skipped_rows: skipped,
      errors: errors as any,
      status: "completed",
    });

    setResult({ imported, skipped, errors, clients_created: clientsCreated, tickets_created: ticketsCreated });
    setStep("done");
    toast.success(`Importação concluída: ${imported} registros importados`);
  };

  const validCount = validatedRows.filter(r => r.status === "valid").length;
  const warningCount = validatedRows.filter(r => r.status === "warning").length;
  const errorCount = validatedRows.filter(r => r.status === "error").length;

  return (
    <div>
      <PageHeader
        title="Importar Histórico"
        description="Importe dados históricos de assistência técnica para alimentar o Live Care"
        icon={FileSpreadsheet}
        action={step !== "upload" && step !== "importing" && (
          <Button variant="outline" size="sm" onClick={reset}>Nova Importação</Button>
        )}
      />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-6">
        {/* UPLOAD */}
        {step === "upload" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Upload className="h-14 w-14 text-muted-foreground/50" />
            <div className="text-center">
              <p className="text-sm font-medium mb-1">Selecione a planilha do histórico de assistência</p>
              <p className="text-xs text-muted-foreground">Arquivo CSV ou TXT com separador ; ou ,</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleFile} />
            <Button onClick={() => fileRef.current?.click()} className="gap-2">
              <Upload className="h-4 w-4" /> Selecionar Arquivo
            </Button>
            <div className="bg-muted/50 rounded-lg p-4 max-w-md w-full">
              <p className="text-xs font-medium mb-2">Colunas esperadas:</p>
              <div className="flex flex-wrap gap-1.5">
                {["inicio_atendimento", "nome_cliente", "produto", "tipo_problema", "problema_relatado", "solucao", "status", "envio_pecas", "custo_frete"].map(c => (
                  <Badge key={c} variant="secondary" className="text-[10px] font-mono">{c}</Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MAPPING */}
        {step === "mapping" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm"><strong>{rows.length}</strong> linhas encontradas em <strong>{fileName}</strong></p>
              <Badge variant="secondary">{headers.length} colunas</Badge>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Mapeamento de Colunas</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {headers.map((h) => (
                  <div key={h} className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-muted px-2 py-1 rounded truncate max-w-[150px]" title={h}>{h}</span>
                    <span className="text-xs text-muted-foreground">→</span>
                    <select
                      className="text-xs border rounded px-2 py-1 bg-background flex-1"
                      value={mapping[h] || ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}
                    >
                      <option value="">Ignorar</option>
                      {TARGET_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    {mapping[h] && (
                      <button onClick={() => setMapping(m => { const n = {...m}; delete n[h]; return n; })} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Preview first rows */}
            <div className="overflow-x-auto max-h-48 border rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    {headers.slice(0, 8).map((h) => (
                      <th key={h} className="px-2 py-1 text-left font-medium truncate max-w-[120px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b">
                      {headers.slice(0, 8).map((h) => (
                        <td key={h} className="px-2 py-1 truncate max-w-[120px]">{row[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={reset}>Cancelar</Button>
              <Button onClick={handleValidate} disabled={!Object.values(mapping).includes("client_name")}>
                Validar e Pré-visualizar
              </Button>
            </div>
          </div>
        )}

        {/* PREVIEW / VALIDATION */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Resultado da Validação</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-primary/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold font-mono">{validCount}</p>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><CheckCircle2 className="h-3 w-3" /> Válidas</p>
              </div>
              <div className="bg-accent/30 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold font-mono">{warningCount}</p>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><AlertTriangle className="h-3 w-3" /> Alertas</p>
              </div>
              <div className="bg-destructive/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold font-mono">{errorCount}</p>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><AlertCircle className="h-3 w-3" /> Erros</p>
              </div>
            </div>

            {/* Issue details */}
            {(warningCount > 0 || errorCount > 0) && (
              <div className="max-h-48 overflow-y-auto border rounded-lg p-3 space-y-1">
                {validatedRows.filter(r => r.status !== "valid").slice(0, 50).map((r) => (
                  <div key={r.index} className="flex items-start gap-2 text-xs">
                    {r.status === "error" ? (
                      <AlertCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 text-accent-foreground shrink-0 mt-0.5" />
                    )}
                    <span>Linha {r.index}: {r.issues.join(", ")}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">
                Serão importadas <strong>{validCount + warningCount}</strong> linhas.
                {errorCount > 0 && <> {errorCount} linhas com erro serão ignoradas.</>}
                {" "}Clientes não encontrados serão criados automaticamente.
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setStep("mapping")}>Voltar</Button>
              <Button onClick={handleImport} disabled={validCount + warningCount === 0}>
                Importar {validCount + warningCount} Registros
              </Button>
            </div>
          </div>
        )}

        {/* IMPORTING */}
        {step === "importing" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="h-10 w-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium">Importando registros históricos...</p>
            <div className="w-64 bg-muted rounded-full h-2">
              <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{progress}% concluído</p>
          </div>
        )}

        {/* DONE */}
        {step === "done" && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <CheckCircle2 className="h-6 w-6 text-primary" /> Importação Concluída
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-primary/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold font-mono">{result.imported}</p>
                <p className="text-xs text-muted-foreground">Importados</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold font-mono">{result.clients_created}</p>
                <p className="text-xs text-muted-foreground">Clientes Criados</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold font-mono">{result.tickets_created}</p>
                <p className="text-xs text-muted-foreground">Tickets Criados</p>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <p className="text-2xl font-bold font-mono">{result.skipped}</p>
                <p className="text-xs text-muted-foreground">Ignorados</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="bg-destructive/10 rounded-lg p-3 max-h-40 overflow-y-auto">
                <p className="text-xs font-semibold flex items-center gap-1 mb-1"><AlertCircle className="h-3 w-3" /> Erros ({result.errors.length})</p>
                {result.errors.slice(0, 30).map((e, i) => <p key={i} className="text-xs text-muted-foreground">{e}</p>)}
                {result.errors.length > 30 && <p className="text-xs text-muted-foreground mt-1">... e mais {result.errors.length - 30} erros</p>}
              </div>
            )}
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">
                Os dados importados já estão disponíveis nos módulos de chamados, histórico técnico e relatórios.
                A IA de triagem também utilizará esses dados para melhorar a análise de novos atendimentos.
              </p>
            </div>
            <Button className="w-full" onClick={reset}>Nova Importação</Button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default HistoricalImportPage;
