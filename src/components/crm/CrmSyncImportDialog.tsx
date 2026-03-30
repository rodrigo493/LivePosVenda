import { useState, useRef, useMemo } from "react";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Search, AlertTriangle, UserX, Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface CrmSyncImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STAGE_MAP: Record<string, string> = {
  "sem atendimento": "sem_atendimento",
  "primeiro contato": "primeiro_contato",
  "em análise": "em_analise",
  "em analise": "em_analise",
  "separação de peças": "separacao_pecas",
  "separacao de pecas": "separacao_pecas",
  "concluído": "concluido",
  "concluido": "concluido",
  "sem interação": "sem_interacao",
  "sem interacao": "sem_interacao",
};

function normalizeStage(raw: string): string | null {
  const key = raw.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [pattern, stage] of Object.entries(STAGE_MAP)) {
    const norm = pattern.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (key === norm || key.includes(norm)) return stage;
  }
  return null;
}

function normalizePhone(phone: string | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "").slice(-11);
}

function parseDate(val: string | undefined): string | null {
  if (!val || !val.trim()) return null;
  const parts = val.trim().split(/[\/\-\.]/);
  if (parts.length === 3 && parts[0].length <= 2) {
    const d = new Date(`${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}T12:00:00`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const d = new Date(val.trim());
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
}

// Fix common mojibake patterns (UTF-8 bytes read as Latin1/Windows-1252)
// Instead of a static map (which can itself get garbled), we use a
// re-encoding strategy: encode the string back to Latin1 bytes, then
// decode those bytes as UTF-8.
function fixMojibake(text: string): string {
  try {
    // Check if text contains typical mojibake indicator: \u00C3 followed by another char
    if (!/\u00C3[\u0080-\u00BF]/.test(text)) return text;
    // Re-encode: treat each char code as a byte, then decode as UTF-8
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      bytes[i] = text.charCodeAt(i) & 0xFF;
    }
    const decoded = new TextDecoder("utf-8").decode(bytes);
    // Verify it produced valid text (no replacement chars)
    if (!decoded.includes("\uFFFD")) return decoded;
  } catch { /* fall through */ }
  return text;
}

// Normalize header for comparison: lowercase, no accents, no special chars
function normalizeHeader(h: string): string {
  return fixMojibake(h).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
}

// Column candidates with normalized aliases
const COLUMN_ALIASES: Record<string, string[]> = {
  nome: ["nome", "name", "cliente", "empresa"],
  etapa: ["etapa", "stage", "estagio", "funil"],
  responsavel: ["responsavel", "responsable", "owner", "atendente"],
  ultimoContato: ["data do ultimo contato", "ultimo contato", "ultimo_contato", "last contact"],
  proximaTarefa: ["data da proxima tarefa", "proxima tarefa", "proxima_tarefa", "next task"],
  telefone: ["telefone", "phone", "contatos", "tel", "celular", "whatsapp"],
  email: ["email", "e-mail", "mail"],
  dataCriacao: ["data de criacao", "data criacao", "data_criacao", "created", "criado em"],
  primeiroContato: ["data do primeiro contato", "primeiro contato", "primeiro_contato", "first contact"],
};

function findCol(headers: string[], key: string): string | null {
  const aliases = COLUMN_ALIASES[key] || [];
  for (const h of headers) {
    const norm = normalizeHeader(h);
    for (const alias of aliases) {
      const normAlias = alias.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      if (norm === normAlias || norm.includes(normAlias) || normAlias.includes(norm)) return h;
    }
  }
  return null;
}

// Detect delimiter from raw text
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  if (tabs > commas && tabs > semicolons) return "\t";
  if (semicolons > commas) return ";";
  return ",";
}

// Try to decode text with multiple encodings
async function readFileWithEncoding(file: File): Promise<{ text: string; encoding: string; wasFixed: boolean }> {
  // Try UTF-8 first
  let text = await file.text();
  let encoding = "UTF-8";
  let wasFixed = false;

  // Check for BOM
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
    encoding = "UTF-8 BOM";
  }

  // Check for mojibake indicators
  const hasMojibake = /Ã[£¡©­³ºª§¢´¼±¶¤¯‰""•‡ƒ]/.test(text);
  if (hasMojibake) {
    text = fixMojibake(text);
    wasFixed = true;
  }

  // If still garbled, try Latin1
  if (/ï¿½|�/.test(text)) {
    try {
      const buffer = await file.arrayBuffer();
      const latin1 = new TextDecoder("iso-8859-1").decode(buffer);
      if (!(/ï¿½|�/.test(latin1))) {
        text = latin1;
        encoding = "Latin1 (ISO-8859-1)";
        wasFixed = true;
      }
    } catch { /* keep UTF-8 */ }
  }

  return { text, encoding, wasFixed };
}

// Simple CSV parser that handles semicolons and quoted fields
function parseCsv(text: string, delimiter: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === delimiter && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.every(v => !v)) continue; // skip empty
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = values[j] || ""; });
    rows.push(row);
  }
  return { headers, rows };
}

type Step = "upload" | "matching" | "preview" | "importing" | "done";

interface CsvRow { [key: string]: string; }

interface MatchedRow {
  csvRow: CsvRow;
  csvName: string;
  csvPhone: string;
  csvEmail: string;
  csvStage: string;
  mappedStage: string | null;
  csvResponsavel: string;
  csvUltimoContato: string;
  csvProximaTarefa: string;
  csvDataCriacao: string;
  csvPrimeiroContato: string;
  matchType: "phone" | "email" | "name" | "none" | "conflict";
  clientId: string | null;
  clientName: string | null;
  ticketId: string | null;
  ticketNumber: string | null;
  responsavelId: string | null;
  selected: boolean;
}

type ResultStats = { updated: number; created: number; conflicts: number; skipped: number; tasksCreated: number; errors: string[] };

interface FileInfo { delimiter: string; encoding: string; wasFixed: boolean; colCount: number; rowCount: number; }

export function CrmSyncImportDialog({ open, onOpenChange }: CrmSyncImportDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [matched, setMatched] = useState<MatchedRow[]>([]);
  const [result, setResult] = useState<ResultStats>({ updated: 0, created: 0, conflicts: 0, skipped: 0, tasksCreated: 0, errors: [] });
  const [fileName, setFileName] = useState("");
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [options, setOptions] = useState({ updateExisting: true, createMissing: true, skipConflicts: true });
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const qc = useQueryClient();

  const [colMap, setColMap] = useState<Record<string, string | null>>({});

  const reset = () => {
    setStep("upload"); setRows([]); setHeaders([]); setMatched([]);
    setResult({ updated: 0, created: 0, conflicts: 0, skipped: 0, tasksCreated: 0, errors: [] });
    setFileName(""); setColMap({}); setFileInfo(null);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const { text, encoding, wasFixed } = await readFileWithEncoding(file);
    const delimiter = detectDelimiter(text);
    const { headers: h, rows: r } = parseCsv(text, delimiter);

    // Fix mojibake in headers
    const cleanHeaders = h.map(fixMojibake);

    // Re-key rows with cleaned headers
    const cleanRows = r.map(row => {
      const clean: CsvRow = {};
      h.forEach((origH, i) => { clean[cleanHeaders[i]] = row[origH] || ""; });
      return clean;
    });

    setHeaders(cleanHeaders);
    setRows(cleanRows);
    setFileInfo({ delimiter: delimiter === ";" ? "Ponto e vírgula (;)" : delimiter === "\t" ? "Tab" : "Vírgula (,)", encoding, wasFixed, colCount: cleanHeaders.length, rowCount: cleanRows.length });

    // Auto-map
    const map: Record<string, string | null> = {};
    for (const key of Object.keys(COLUMN_ALIASES)) {
      map[key] = findCol(cleanHeaders, key);
    }
    setColMap(map);
    setStep("matching");
  };

  const colFields = [
    { key: "nome", label: "Nome" },
    { key: "etapa", label: "Etapa" },
    { key: "responsavel", label: "Responsável" },
    { key: "ultimoContato", label: "Último contato" },
    { key: "proximaTarefa", label: "Próxima tarefa" },
    { key: "telefone", label: "Telefone" },
    { key: "email", label: "Email" },
    { key: "dataCriacao", label: "Data criação" },
    { key: "primeiroContato", label: "Primeiro contato" },
  ];

  const runMatching = async () => {
    const toastId = toast.loading("Localizando registros...");

    // Fetch all clients and active tickets
    const { data: clients } = await supabase.from("clients").select("id, name, phone, whatsapp, email");
    const { data: tickets } = await supabase.from("tickets").select("id, ticket_number, client_id, pipeline_stage, assigned_to").not("status", "eq", "fechado");
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email");

    const clientList = clients || [];
    const ticketList = tickets || [];
    const profileList = profiles || [];

    const results: MatchedRow[] = [];

    for (const row of rows) {
      const csvName = (colMap.nome ? row[colMap.nome] : "") || "";
      const csvPhone = normalizePhone(colMap.telefone ? row[colMap.telefone] : "");
      const csvEmail = ((colMap.email ? row[colMap.email] : "") || "").toLowerCase().trim();
      const csvStage = (colMap.etapa ? row[colMap.etapa] : "") || "";
      const csvResponsavel = (colMap.responsavel ? row[colMap.responsavel] : "") || "";
      const csvUltimoContato = (colMap.ultimoContato ? row[colMap.ultimoContato] : "") || "";
      const csvProximaTarefa = (colMap.proximaTarefa ? row[colMap.proximaTarefa] : "") || "";
      const csvDataCriacao = (colMap.dataCriacao ? row[colMap.dataCriacao] : "") || "";
      const csvPrimeiroContato = (colMap.primeiroContato ? row[colMap.primeiroContato] : "") || "";

      let matchType: MatchedRow["matchType"] = "none";
      let matchedClients: typeof clientList = [];

      // 1. Phone
      if (csvPhone) {
        const byPhone = clientList.filter((c) => normalizePhone(c.phone) === csvPhone || normalizePhone(c.whatsapp) === csvPhone);
        if (byPhone.length === 1) { matchedClients = byPhone; matchType = "phone"; }
        else if (byPhone.length > 1) { matchedClients = byPhone; matchType = "conflict"; }
      }

      // 2. Email
      if (matchType === "none" && csvEmail) {
        const byEmail = clientList.filter((c) => c.email?.toLowerCase().trim() === csvEmail);
        if (byEmail.length === 1) { matchedClients = byEmail; matchType = "email"; }
        else if (byEmail.length > 1) { matchedClients = byEmail; matchType = "conflict"; }
      }

      // 3. Name
      if (matchType === "none" && csvName) {
        const norm = csvName.toLowerCase().trim();
        const byName = clientList.filter((c) => c.name.toLowerCase().trim() === norm);
        if (byName.length === 1) { matchedClients = byName; matchType = "name"; }
        else if (byName.length > 1) { matchedClients = byName; matchType = "conflict"; }
      }

      const clientId = matchedClients.length === 1 ? matchedClients[0].id : null;
      const clientName = matchedClients.length === 1 ? matchedClients[0].name : null;

      // Find active ticket for this client
      let ticketId: string | null = null;
      let ticketNumber: string | null = null;
      if (clientId) {
        const clientTickets = ticketList.filter((t) => t.client_id === clientId);
        if (clientTickets.length >= 1) {
          ticketId = clientTickets[0].id;
          ticketNumber = clientTickets[0].ticket_number;
        }
      }

      // Match responsavel to profile
      let responsavelId: string | null = null;
      if (csvResponsavel) {
        const normResp = csvResponsavel.toLowerCase().trim();
        const match = profileList.find((p) => p.full_name.toLowerCase().trim() === normResp || p.email?.toLowerCase().trim() === normResp);
        if (match) responsavelId = match.user_id;
      }

      results.push({
        csvRow: row, csvName, csvPhone, csvEmail, csvStage,
        mappedStage: normalizeStage(csvStage),
        csvResponsavel, csvUltimoContato, csvProximaTarefa, csvDataCriacao, csvPrimeiroContato,
        matchType, clientId, clientName, ticketId, ticketNumber, responsavelId,
        selected: matchType !== "conflict",
      });
    }

    setMatched(results);
    toast.dismiss(toastId);
    setStep("preview");
  };

  const stats = useMemo(() => {
    const found = matched.filter((m) => m.clientId);
    const notFound = matched.filter((m) => !m.clientId && m.matchType !== "conflict");
    const conflicts = matched.filter((m) => m.matchType === "conflict");
    return { found: found.length, notFound: notFound.length, conflicts: conflicts.length, total: matched.length };
  }, [matched]);

  const handleImport = async () => {
    setStep("importing");
    let updated = 0, created = 0, conflicts = 0, skipped = 0, tasksCreated = 0;
    const errors: string[] = [];

    for (const m of matched) {
      if (!m.selected) { skipped++; continue; }

      if (m.matchType === "conflict") {
        if (options.skipConflicts) { conflicts++; continue; }
      }

      const lastInteraction = parseDate(m.csvUltimoContato);
      const nextTaskDate = parseDate(m.csvProximaTarefa);

      if (m.clientId && m.ticketId && options.updateExisting) {
        // Update existing ticket
        const updateData: Record<string, any> = {};
        if (m.mappedStage) updateData.pipeline_stage = m.mappedStage;
        if (lastInteraction) updateData.last_interaction_at = lastInteraction;
        if (m.responsavelId) updateData.assigned_to = m.responsavelId;
        updateData.origin = "crm_importado";
        updateData.updated_at = new Date().toISOString();

        const { error } = await supabase.from("tickets").update(updateData).eq("id", m.ticketId);
        if (error) { errors.push(`${m.csvName}: ${error.message}`); skipped++; continue; }

        // Log in technical history
        const { data: ticket } = await supabase.from("tickets").select("equipment_id").eq("id", m.ticketId).single();
        if (ticket?.equipment_id) {
          await supabase.from("technical_history").insert({
            equipment_id: ticket.equipment_id,
            event_type: "importacao_crm",
            description: `Etapa atualizada por importação do CRM em ${new Date().toLocaleDateString("pt-BR")}. Nova etapa: ${m.csvStage}`,
            reference_type: "ticket",
            reference_id: m.ticketId,
          });
        }

        // Create follow-up task if next task date exists
        if (nextTaskDate) {
          await supabase.from("tasks").insert({
            title: "Follow-up CRM importado",
            description: `Tarefa criada automaticamente pela importação do CRM. Cliente: ${m.csvName}`,
            ticket_id: m.ticketId,
            client_id: m.clientId,
            assigned_to: m.responsavelId || user?.id || "",
            due_date: nextTaskDate.split("T")[0],
            priority: "media",
            created_by: user?.id,
          });
          tasksCreated++;
        }

        updated++;
      } else if (!m.clientId && options.createMissing) {
        // Create minimal client
        const { data: newClient, error: clientErr } = await supabase.from("clients").insert({
          name: m.csvName || "Cliente importado",
          phone: m.csvPhone || null,
          email: m.csvEmail || null,
          notes: `Importado do CRM em ${new Date().toLocaleDateString("pt-BR")}`,
          created_by: user?.id,
        }).select().single();

        if (clientErr) { errors.push(`Criar ${m.csvName}: ${clientErr.message}`); skipped++; continue; }
        created++;
      } else {
        skipped++;
      }
    }

    // Log import
    await supabase.from("import_logs").insert({
      user_id: user?.id,
      file_name: fileName,
      total_rows: matched.length,
      imported_rows: created,
      updated_rows: updated,
      skipped_rows: skipped + conflicts,
      errors: errors as any,
    });

    setResult({ updated, created, conflicts, skipped, tasksCreated, errors });
    setStep("done");
    qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    toast.success(`Sincronização concluída: ${updated} atualizados, ${created} novos`);
  };

  const matchBadge = (type: MatchedRow["matchType"]) => {
    switch (type) {
      case "phone": return <Badge className="bg-emerald-500/15 text-emerald-700 text-[10px]">📞 Telefone</Badge>;
      case "email": return <Badge className="bg-blue-500/15 text-blue-700 text-[10px]">✉️ Email</Badge>;
      case "name": return <Badge className="bg-amber-500/15 text-amber-700 text-[10px]">👤 Nome</Badge>;
      case "conflict": return <Badge variant="destructive" className="text-[10px]">⚠️ Conflito</Badge>;
      case "none": return <Badge variant="outline" className="text-[10px]">Novo</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Sincronizar Etapas do CRM
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1: Upload */}
        {step === "upload" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Upload className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Selecione o CSV exportado do CRM para sincronizar as etapas dos clientes já existentes no Live Care.
            </p>
            <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleFile} />
            <Button onClick={() => fileRef.current?.click()}>Selecionar Arquivo CSV</Button>
            <p className="text-xs text-muted-foreground">Colunas esperadas: Nome, Etapa, Responsável, Telefone, Email, Data do último contato</p>
          </div>
        )}

        {/* STEP 2: Column mapping */}
        {step === "matching" && (
          <div className="space-y-4">
            <p className="text-sm"><strong>{rows.length}</strong> registros encontrados em <strong>{fileName}</strong></p>

            {/* File diagnostics */}
            {fileInfo && (
              <div className="bg-muted/50 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div><span className="text-muted-foreground">Delimitador:</span> <strong>{fileInfo.delimiter}</strong></div>
                <div><span className="text-muted-foreground">Encoding:</span> <strong>{fileInfo.encoding}</strong></div>
                <div><span className="text-muted-foreground">Colunas:</span> <strong>{fileInfo.colCount}</strong></div>
                <div><span className="text-muted-foreground">Linhas:</span> <strong>{fileInfo.rowCount}</strong></div>
                {fileInfo.wasFixed && (
                  <div className="col-span-full flex items-center gap-1 text-primary">
                    <Info className="h-3 w-3" /> Correção automática de codificação aplicada
                  </div>
                )}
              </div>
            )}

            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Mapeamento de Colunas</p>
              <div className="grid grid-cols-2 gap-2">
                {colFields.map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <span className="text-xs font-medium min-w-[110px]">{f.label}</span>
                    <span className="text-xs text-muted-foreground">→</span>
                    <select
                      className="text-xs border rounded px-2 py-1 bg-background flex-1"
                      value={colMap[f.key] || ""}
                      onChange={(e) => setColMap((m) => ({ ...m, [f.key]: e.target.value || null }))}
                    >
                      <option value="">Não mapeado</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview table */}
            <div className="overflow-x-auto max-h-40 border rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    {headers.slice(0, 8).map((h) => <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 4).map((row, i) => (
                    <tr key={i} className="border-b">
                      {headers.slice(0, 8).map((h) => <td key={h} className="px-2 py-1 truncate max-w-[120px]">{row[h]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={reset}>Cancelar</Button>
              <Button onClick={runMatching} disabled={!colMap.nome}>
                <Search className="h-4 w-4 mr-1" /> Localizar Registros
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Preview matches */}
        {step === "preview" && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold font-mono">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold font-mono text-emerald-600">{stats.found}</p>
                <p className="text-xs text-muted-foreground">Encontrados</p>
              </div>
              <div className="bg-blue-500/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold font-mono text-blue-600">{stats.notFound}</p>
                <p className="text-xs text-muted-foreground">Novos</p>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold font-mono text-amber-600">{stats.conflicts}</p>
                <p className="text-xs text-muted-foreground">Conflitos</p>
              </div>
            </div>

            {/* Options */}
            <div className="flex gap-4 items-center bg-muted/50 rounded-lg p-3">
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={options.updateExisting} onCheckedChange={(c) => setOptions((o) => ({ ...o, updateExisting: !!c }))} />
                Atualizar existentes
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={options.createMissing} onCheckedChange={(c) => setOptions((o) => ({ ...o, createMissing: !!c }))} />
                Criar ausentes
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={options.skipConflicts} onCheckedChange={(c) => setOptions((o) => ({ ...o, skipConflicts: !!c }))} />
                Ignorar conflitos
              </label>
            </div>

            {/* Match list */}
            <div className="overflow-y-auto max-h-[340px] border rounded-lg">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr className="border-b">
                    <th className="px-2 py-1.5 text-left w-8"></th>
                    <th className="px-2 py-1.5 text-left">CSV Nome</th>
                    <th className="px-2 py-1.5 text-left">Match</th>
                    <th className="px-2 py-1.5 text-left">Cliente Live Care</th>
                    <th className="px-2 py-1.5 text-left">Etapa CSV</th>
                    <th className="px-2 py-1.5 text-left">Etapa Mapeada</th>
                    <th className="px-2 py-1.5 text-left">Responsável</th>
                  </tr>
                </thead>
                <tbody>
                  {matched.map((m, i) => (
                    <tr key={i} className={`border-b ${m.matchType === "conflict" ? "bg-destructive/5" : ""}`}>
                      <td className="px-2 py-1">
                        <Checkbox
                          checked={m.selected}
                          onCheckedChange={(c) => {
                            setMatched((prev) => prev.map((r, j) => j === i ? { ...r, selected: !!c } : r));
                          }}
                        />
                      </td>
                      <td className="px-2 py-1 font-medium truncate max-w-[140px]">{m.csvName}</td>
                      <td className="px-2 py-1">{matchBadge(m.matchType)}</td>
                      <td className="px-2 py-1 truncate max-w-[140px]">
                        {m.clientName || <span className="text-muted-foreground italic">—</span>}
                        {m.ticketNumber && <span className="ml-1 text-muted-foreground">({m.ticketNumber})</span>}
                      </td>
                      <td className="px-2 py-1">{m.csvStage}</td>
                      <td className="px-2 py-1">
                        {m.mappedStage ? (
                          <Badge variant="outline" className="text-[10px]">{m.mappedStage}</Badge>
                        ) : (
                          <span className="text-destructive text-[10px]">❌ Não mapeada</span>
                        )}
                      </td>
                      <td className="px-2 py-1 truncate max-w-[100px]">
                        {m.csvResponsavel}
                        {m.responsavelId ? (
                          <CheckCircle2 className="inline h-3 w-3 text-emerald-500 ml-1" />
                        ) : m.csvResponsavel ? (
                          <UserX className="inline h-3 w-3 text-amber-500 ml-1" />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setStep("matching")}>Voltar</Button>
              <Button onClick={handleImport}>
                Sincronizar {matched.filter((m) => m.selected).length} Registros
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: Importing */}
        {step === "importing" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Sincronizando registros...</p>
          </div>
        )}

        {/* STEP 5: Done */}
        {step === "done" && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" /> Sincronização Concluída
            </div>
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: "Atualizados", value: result.updated, color: "bg-emerald-500/10" },
                { label: "Criados", value: result.created, color: "bg-blue-500/10" },
                { label: "Conflitos", value: result.conflicts, color: "bg-amber-500/10" },
                { label: "Ignorados", value: result.skipped, color: "bg-muted/50" },
                { label: "Tarefas", value: result.tasksCreated, color: "bg-purple-500/10" },
              ].map((s) => (
                <div key={s.label} className={`${s.color} rounded-lg p-3 text-center`}>
                  <p className="text-2xl font-bold font-mono">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
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
