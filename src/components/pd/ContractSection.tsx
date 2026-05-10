import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calculator, CheckCircle2, CreditCard, FileText, Landmark, Loader2, Plus, QrCode, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSaveContractData, type ContractInstallment } from "@/hooks/useContractData";
import {
  generateContractPdf,
  type ContractPdfData,
  type ContractDimension,
  type ContractProductRow,
} from "@/lib/generateContractPdf";
import { fmtBRL, EBOOK_MAPPING, DIMENSIONS_MAPPING } from "@/lib/contractMappings";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PaymentMethod = "pix" | "transferencia" | "cartao";

interface Props {
  pdId: string;
  contractNumber: string;
  client: ContractPdfData["client"];
  items: ContractPdfData["items"];
  total: number;
  initialBairro?: string | null;
  initialContractDate?: string;
  initialInstallments?: ContractInstallment[];
  initialPaymentMethod?: PaymentMethod;
  initialInstallmentsCount?: number;
  exportedBy?: string;
}

// ── tipos internos ─────────────────────────────────────────────────────────────

interface ItemRow {
  code: string;
  description: string;
  equipValue: string; // valor que aparece na coluna "Valor Uni." do equipamento
  qty: string;        // quantidade
  hasEbook: boolean;
  ebookCode: string;
  ebookDesc: string;
  ebookValue: string; // valor que aparece na coluna "Valor Uni." do e-book
  isBreinde: boolean;
}

// ── helpers ────────────────────────────────────────────────────────────────────

function parseBRL(s: string): number {
  return parseFloat(s.replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-1">
      {children}
    </p>
  );
}

function fmtInstDate(d: Date): string {
  return [
    String(d.getDate()).padStart(2, "0"),
    String(d.getMonth() + 1).padStart(2, "0"),
    d.getFullYear(),
  ].join(".");
}

function parseInstDate(s: string): Date {
  const parts = s.trim().split(/[\/\.]/);
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts.map(Number);
    const d = new Date(yyyy, mm - 1, dd);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

function applyDates(insts: ContractInstallment[], startDate: Date, overwrite = false): ContractInstallment[] {
  return insts.map((inst, i) => {
    if (!overwrite && inst.data.trim()) return inst;
    const d = new Date(startDate);
    d.setDate(d.getDate() + i * 30);
    return { ...inst, data: fmtInstDate(d) };
  });
}

function deriveDims(items: ContractPdfData["items"]): ContractDimension[] {
  const seen = new Set<string>();
  const rows: ContractDimension[] = [];
  for (const item of items) {
    if (item.isBreinde) continue;
    const dim = DIMENSIONS_MAPPING[item.code.toUpperCase().trim()];
    if (dim && !seen.has(dim.name)) {
      seen.add(dim.name);
      rows.push({ ...dim });
    }
  }
  return rows;
}

function buildItemRows(items: ContractPdfData["items"]): ItemRow[] {
  return items.map((item) => {
    const ebook = EBOOK_MAPPING[item.code.toUpperCase().trim()];
    const hasEbook = !!ebook && !item.isBreinde;
    return {
      code: item.code,
      description: item.description,
      equipValue: item.isBreinde
        ? "BRINDE"
        : fmtBRL(hasEbook ? item.unitPrice * 0.6 : item.unitPrice),
      qty: String(item.quantity),
      hasEbook,
      ebookCode: ebook?.code ?? "",
      ebookDesc: ebook?.desc ?? "",
      ebookValue: hasEbook ? fmtBRL(item.unitPrice * 0.4) : "",
      isBreinde: item.isBreinde,
    };
  });
}

// ── component ──────────────────────────────────────────────────────────────────

export function ContractSection({
  pdId,
  contractNumber,
  client,
  items,
  total,
  initialBairro,
  initialContractDate = "",
  initialInstallments,
  initialPaymentMethod = "pix",
  initialInstallmentsCount = 1,
  exportedBy,
}: Props) {
  // ── comprador ──────────────────────────────────────────────────────────────
  const [comprador, setComprador] = useState({
    name:          client.name,
    cpfCnpj:       client.cpfCnpj,
    razaoSocial:   client.razaoSocial,
    email:         client.email,
    phone:         client.phone,
    address:       client.address,
    addressNumber: client.addressNumber,
    city:          client.city,
    state:         client.state,
    zipCode:       client.zipCode,
  });
  const [bairro, setBairro] = useState(initialBairro ?? "");
  const setField =
    (f: keyof typeof comprador) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setComprador((prev) => ({ ...prev, [f]: e.target.value }));

  // ── itens (duas linhas por produto, tudo editável) ─────────────────────────
  const [itemRows, setItemRows] = useState<ItemRow[]>(() => buildItemRows(items));

  const updateRow = (i: number, patch: Partial<ItemRow>) =>
    setItemRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const calcTotal = itemRows.reduce((sum, r) => {
    if (r.isBreinde) return sum;
    const qty = parseInt(r.qty) || 1;
    return sum + parseBRL(r.equipValue) * qty + parseBRL(r.ebookValue);
  }, 0);

  // ── dimensões (editáveis) ──────────────────────────────────────────────────
  const [editableDims, setEditableDims] = useState<ContractDimension[]>(() => deriveDims(items));
  const updateDim = (i: number, patch: Partial<ContractDimension>) =>
    setEditableDims((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  const addDim = () =>
    setEditableDims((prev) => [...prev, { name: "", weight: "", dims: "" }]);
  const removeDim = (i: number) =>
    setEditableDims((prev) => prev.filter((_, idx) => idx !== i));

  // ── forma de pagamento / calculadora ──────────────────────────────────────
  const [payMethod, setPayMethod] = useState<PaymentMethod>(initialPaymentMethod);
  const [numParcelas, setNumParcelas] = useState(initialInstallmentsCount);
  const [cardBrand, setCardBrand] = useState("");
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcOptions, setCalcOptions] = useState<string[] | null>(null);

  const handleCalculateInstallment = async () => {
    if (!cardBrand) { toast.error("Selecione a bandeira do cartão primeiro"); return; }
    setCalcLoading(true);
    setCalcOptions(null);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calculate-installment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
          body: JSON.stringify({ total: calcTotal, brand: cardBrand, secret: "livecare-sheets-2026" }),
        }
      );
      const json = await resp.json();
      if (json.options?.length) setCalcOptions(json.options);
      else toast.error(json.error || "Erro ao calcular parcelamento");
    } catch {
      toast.error("Erro ao conectar com a planilha");
    } finally {
      setCalcLoading(false);
    }
  };

  const applyCalcOption = (opt: string) => {
    const m = opt.match(/^(\d+)x de (.+)$/);
    if (!m) { toast.error("Formato de parcela inválido"); return; }
    const n = parseInt(m[1]);
    const valor = m[2].trim();
    const start = contractDate.trim() ? parseInstDate(contractDate) : new Date();
    const newInsts: ContractInstallment[] = Array.from({ length: n }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i * 30);
      return { parcela: i + 1, data: fmtInstDate(d), valor, forma: "Cartão" };
    });
    setInstallments(newInsts);
    setCalcOptions(null);
    toast.success(`${n} parcelas preenchidas em "3. Condições de Pagamento".`);
  };

  const applyPayment = () => {
    const start = contractDate.trim() ? parseInstDate(contractDate) : new Date();
    let newInsts: ContractInstallment[] = [];
    if (payMethod === "cartao") {
      const valorParcela = calcTotal / (numParcelas || 1);
      newInsts = Array.from({ length: numParcelas }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i * 30);
        return { parcela: i + 1, data: fmtInstDate(d), valor: fmtBRL(valorParcela), forma: "Cartão" };
      });
    } else {
      const forma = payMethod === "pix" ? "PIX" : "Transferência (TED/DOC)";
      newInsts = [{ parcela: 1, data: fmtInstDate(start), valor: fmtBRL(calcTotal), forma }];
    }
    setInstallments(newInsts);
    toast.success("Parcelas preenchidas em \"3. Condições de Pagamento\".");
  };

  // ── obs / data ─────────────────────────────────────────────────────────────
  const [obs, setObs] = useState("EQUIPAMENTO PADRÃO LIVE");
  const [contractDate, setContractDate] = useState(initialContractDate);

  // ── parcelas ───────────────────────────────────────────────────────────────
  const [installments, setInstallments] = useState<ContractInstallment[]>(() =>
    applyDates(initialInstallments ?? [], new Date(), false)
  );
  const addInstallment = () =>
    setInstallments((prev) => {
      const lastDate =
        prev.length > 0 ? parseInstDate(prev[prev.length - 1].data) : new Date();
      const nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + 30);
      return [...prev, { parcela: prev.length + 1, data: fmtInstDate(nextDate), valor: "", forma: "" }];
    });
  const removeInstallment = (i: number) =>
    setInstallments((prev) =>
      prev.filter((_, idx) => idx !== i).map((inst, idx) => ({ ...inst, parcela: idx + 1 }))
    );
  const updateInstallment = (i: number, field: keyof ContractInstallment, value: string | number) =>
    setInstallments((prev) =>
      prev.map((inst, idx) => (idx === i ? { ...inst, [field]: value } : inst))
    );
  const recalcDates = () => {
    const start = contractDate.trim() ? parseInstDate(contractDate) : new Date();
    setInstallments((prev) => applyDates(prev, start, true));
  };

  // ── gerar PDF ─────────────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const saveContractData = useSaveContractData();

  const handleGenerate = async () => {
    if (!bairro.trim()) {
      toast.error("Preencha o bairro antes de gerar o contrato.");
      return;
    }
    if (installments.length === 0) {
      toast.error("Adicione pelo menos uma parcela antes de gerar o contrato.");
      return;
    }

    setGenerating(true);
    try {
      await saveContractData.mutateAsync({ pdId, bairro, installments });

      const today = new Date();
      const date = `${String(today.getDate()).padStart(2, "0")}/${String(
        today.getMonth() + 1
      ).padStart(2, "0")}/${today.getFullYear()}`;

      // Monta linhas exatamente como editadas pelo usuário
      const customProductRows: ContractProductRow[] = [];
      for (const r of itemRows) {
        customProductRows.push({
          code: r.code,
          description: r.description,
          value: r.equipValue,
          qty: (parseInt(r.qty) || 1).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
        });
        if (r.hasEbook || r.ebookCode) {
          customProductRows.push({
            code: r.ebookCode,
            description: r.ebookDesc,
            value: r.ebookValue,
            qty: "1,00",
          });
        }
      }

      const pdfData: ContractPdfData = {
        contractNumber,
        date,
        contractDate: contractDate.trim() || undefined,
        obs: obs.trim() || undefined,
        client: { ...comprador, bairro },
        items,
        total: calcTotal,
        installments,
        customProductRows,
        customDimensions: editableDims.filter((d) => d.name.trim()),
        exportedBy,
      };

      const doc = generateContractPdf(pdfData);
      doc.save(`Contrato_${contractNumber}.pdf`);
      toast.success("Contrato gerado com sucesso!");
    } catch {
      toast.error("Erro ao gerar o contrato.");
    } finally {
      setGenerating(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="border rounded-lg p-4 space-y-6 bg-muted/20">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        Dados do Contrato
      </h3>

      {/* ── 1. Dados do Comprador ──────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionTitle>1. Dados do Comprador</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Nome / Responsável</Label>
            <Input value={comprador.name} onChange={setField("name")} placeholder="Nome do comprador" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Razão Social</Label>
            <Input value={comprador.razaoSocial} onChange={setField("razaoSocial")} placeholder="Nome da empresa" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">CPF / CNPJ</Label>
            <Input value={comprador.cpfCnpj} onChange={setField("cpfCnpj")} placeholder="000.000.000-00" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">E-mail</Label>
            <Input value={comprador.email} onChange={setField("email")} placeholder="email@exemplo.com" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Telefone</Label>
            <Input value={comprador.phone} onChange={setField("phone")} placeholder="(11) 99999-9999" className="h-8 text-sm" />
          </div>
        </div>

        <SectionTitle>Endereço de Entrega</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex gap-2 sm:col-span-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Rua / Logradouro</Label>
              <Input value={comprador.address} onChange={setField("address")} placeholder="Rua, Av..." className="h-8 text-sm" />
            </div>
            <div className="w-24 space-y-1">
              <Label className="text-xs">Nº</Label>
              <Input value={comprador.addressNumber} onChange={setField("addressNumber")} placeholder="123" className="h-8 text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Bairro</Label>
            <Input value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Ex: Centro" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cidade</Label>
            <Input value={comprador.city} onChange={setField("city")} placeholder="Cidade" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Estado (UF)</Label>
            <Input value={comprador.state} onChange={setField("state")} placeholder="SP" className="h-8 text-sm max-w-[80px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">CEP</Label>
            <Input value={comprador.zipCode} onChange={setField("zipCode")} placeholder="00000-000" className="h-8 text-sm max-w-[140px]" />
          </div>
        </div>
      </div>

      {/* ── 2. Itens — igual ao PDF, tudo editável ───────────────────── */}
      <div className="space-y-2">
        <SectionTitle>2. Itens do Contrato</SectionTitle>

        <div className="border rounded overflow-hidden text-xs">
          {/* cabeçalho igual ao contrato */}
          <div className="grid grid-cols-[60px_1fr_100px_56px] gap-1 bg-muted/50 px-2 py-1.5 font-semibold text-muted-foreground">
            <span>Código</span>
            <span>Descrição</span>
            <span className="text-right">Valor Uni.</span>
            <span className="text-center">Quant.</span>
          </div>

          {itemRows.map((row, i) => (
            <div key={i} className="border-t">
              {/* linha do equipamento — tudo editável */}
              <div className="grid grid-cols-[60px_1fr_100px_56px] gap-1 px-2 py-1.5 items-center">
                <Input
                  value={row.code}
                  onChange={(e) => updateRow(i, { code: e.target.value })}
                  className="h-7 text-[11px] font-mono px-1"
                />
                <Input
                  value={row.description}
                  onChange={(e) => updateRow(i, { description: e.target.value })}
                  className="h-7 text-[11px] px-1"
                />
                <Input
                  value={row.equipValue}
                  onChange={(e) => updateRow(i, { equipValue: e.target.value })}
                  placeholder="R$ 0,00"
                  className="h-7 text-[11px] text-right px-1"
                  disabled={row.isBreinde}
                />
                <Input
                  value={row.qty}
                  onChange={(e) => updateRow(i, { qty: e.target.value })}
                  placeholder="1"
                  className="h-7 text-[11px] text-center px-1"
                />
              </div>

              {/* linha do e-book — tudo editável */}
              {row.hasEbook && (
                <div className="grid grid-cols-[60px_1fr_100px_56px] gap-1 px-2 py-1 items-center bg-muted/15">
                  <Input
                    value={row.ebookCode}
                    onChange={(e) => updateRow(i, { ebookCode: e.target.value })}
                    className="h-7 text-[10px] font-mono px-1 text-muted-foreground"
                  />
                  <Input
                    value={row.ebookDesc}
                    onChange={(e) => updateRow(i, { ebookDesc: e.target.value })}
                    className="h-7 text-[10px] px-1 text-muted-foreground italic"
                  />
                  <Input
                    value={row.ebookValue}
                    onChange={(e) => updateRow(i, { ebookValue: e.target.value })}
                    placeholder="R$ 0,00"
                    className="h-7 text-[10px] text-right px-1"
                  />
                  <span className="text-[10px] text-center text-muted-foreground">1,00</span>
                </div>
              )}
            </div>
          ))}

          {/* total */}
          <div className="grid grid-cols-[60px_1fr_100px_56px] gap-1 px-2 py-2 border-t bg-muted/30 font-semibold">
            <span className="col-span-2 text-right text-muted-foreground text-xs pr-2">Total</span>
            <span className="text-right text-xs">{fmtBRL(calcTotal)}</span>
            <span />
          </div>
        </div>
      </div>

      {/* ── OBS ──────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">OBS.</Label>
        <Textarea
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Observações do contrato"
          className="text-sm min-h-[52px] resize-none"
          rows={2}
        />
      </div>

      {/* ── Forma de Pagamento / Calculadora ─────────────────────────── */}
      <div className="space-y-3">
        <SectionTitle>Forma de Pagamento</SectionTitle>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { key: "pix",          label: "À vista — PIX",          sub: "Pagamento via PIX",              Icon: QrCode     },
              { key: "transferencia",label: "Transferência bancária",  sub: "TED ou DOC para conta",          Icon: Landmark   },
              { key: "cartao",       label: "Cartão — Parcelado",      sub: "Parcelamento com juros",         Icon: CreditCard },
            ] as const
          ).map(({ key, label, sub, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setPayMethod(key)}
              className={`flex items-start gap-2 rounded-lg border p-3 text-left text-xs transition-colors
                ${payMethod === key
                  ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400"
                  : "border-border bg-background hover:bg-muted/40 text-foreground"}`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${payMethod === key ? "text-orange-500" : "text-muted-foreground"}`} />
              <span>
                <span className="block font-semibold leading-tight">{label}</span>
                <span className="block text-muted-foreground leading-tight mt-0.5">{sub}</span>
              </span>
            </button>
          ))}
        </div>

        {payMethod === "cartao" && (
          <div className="space-y-3">
            {/* Bandeira + botão calcular */}
            <div className="flex flex-wrap items-center gap-3">
              <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={cardBrand} onValueChange={setCardBrand}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="Bandeira do cartão..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visa_master">Visa / Mastercard</SelectItem>
                  <SelectItem value="elo">Elo</SelectItem>
                  <SelectItem value="hipercard">Hipercard / Demais</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                disabled={!cardBrand || calcLoading}
                onClick={handleCalculateInstallment}
              >
                {calcLoading
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Calculando...</>
                  : <><Calculator className="h-3 w-3" /> Calcular Parcelamento</>}
              </Button>
            </div>

            {/* Grid de opções da planilha */}
            {calcOptions && (
              <div className="bg-muted/40 rounded-xl border p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Selecione a condição — clique para preencher as parcelas:
                  </p>
                  <button
                    type="button"
                    onClick={() => setCalcOptions(null)}
                    className="text-[10px] text-primary hover:underline font-medium"
                  >
                    Fechar
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                  {calcOptions.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => applyCalcOption(opt)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs text-left transition-all border-border bg-background hover:border-primary/50 hover:bg-primary/5 font-mono"
                    >
                      <CheckCircle2 className="h-3 w-3 text-muted-foreground shrink-0" />
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Fallback manual */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>Ou sem juros (simulação):</span>
              <Input
                type="number"
                min={1}
                max={48}
                value={numParcelas}
                onChange={(e) => setNumParcelas(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-7 w-14 text-center text-xs"
              />
              <span>x = <strong className="text-foreground font-mono">{fmtBRL(calcTotal / (numParcelas || 1))}</strong></span>
              <Button type="button" size="sm" variant="outline" onClick={applyPayment} className="h-7 text-xs">
                Aplicar
              </Button>
            </div>
          </div>
        )}

        {payMethod !== "cartao" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {payMethod === "pix" ? <QrCode className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
              <span>
                Pagamento único de <strong className="text-foreground font-mono">{fmtBRL(calcTotal)}</strong>{" "}
                via {payMethod === "pix" ? "PIX" : "Transferência (TED/DOC)"}
              </span>
            </div>
            <Button type="button" size="sm" onClick={applyPayment} className="h-8 text-xs">
              Aplicar ao contrato → preencher parcelas
            </Button>
          </div>
        )}
      </div>

      {/* ── Dimensões (editáveis) ─────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionTitle>Dimensões dos Equipamentos (embalados)</SectionTitle>
          <Button type="button" variant="outline" size="sm" onClick={addDim} className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" /> Linha
          </Button>
        </div>

        {editableDims.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            Nenhuma dimensão — verifique o código do produto ou adicione manualmente.
          </p>
        ) : (
          <div className="border rounded overflow-hidden text-xs">
            <div className="grid grid-cols-[1fr_88px_108px_28px] gap-1 bg-muted/50 px-2 py-1.5 font-semibold text-muted-foreground">
              <span>Equipamento</span>
              <span className="text-center">Peso</span>
              <span className="text-center">C × L × A (m)</span>
              <span />
            </div>
            {editableDims.map((dim, i) => (
              <div key={i} className="grid grid-cols-[1fr_88px_108px_28px] gap-1 px-2 py-1 border-t items-center">
                <Input value={dim.name} onChange={(e) => updateDim(i, { name: e.target.value })} placeholder="Nome do equipamento" className="h-7 text-xs px-1" />
                <Input value={dim.weight} onChange={(e) => updateDim(i, { weight: e.target.value })} placeholder="75,00 Kg" className="h-7 text-xs text-center px-1" />
                <Input value={dim.dims} onChange={(e) => updateDim(i, { dims: e.target.value })} placeholder="1,10x0,80x1,21" className="h-7 text-xs text-center font-mono px-1" />
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeDim(i)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 3. Parcelas ───────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle>3. Condições de Pagamento (parcelas)</SectionTitle>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={recalcDates}
              className="h-7 text-xs"
              title="Recalcula datas: 1ª = data do contrato, demais +30 dias"
            >
              <RefreshCw className="h-3 w-3 mr-1" /> Datas
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={addInstallment} className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" /> Parcela
            </Button>
          </div>
        </div>

        {installments.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            Nenhuma parcela — vincule um orçamento ao PD para auto-preencher.
          </p>
        ) : (
          <div className="space-y-1.5">
            <div className="grid grid-cols-[32px_1fr_1fr_1fr_30px] gap-1 px-1">
              <span className="text-xs text-muted-foreground text-center">Nº</span>
              <span className="text-xs text-muted-foreground">Data</span>
              <span className="text-xs text-muted-foreground">Valor</span>
              <span className="text-xs text-muted-foreground">Forma</span>
              <span />
            </div>
            {installments.map((inst, i) => (
              <div key={i} className="grid grid-cols-[32px_1fr_1fr_1fr_30px] gap-1 items-center">
                <span className="text-xs text-center font-semibold">{inst.parcela}</span>
                <Input value={inst.data} onChange={(e) => updateInstallment(i, "data", e.target.value)} placeholder="24.10.2025" className="h-8 text-sm" />
                <Input value={inst.valor} onChange={(e) => updateInstallment(i, "valor", e.target.value)} placeholder="R$ 9.102,50" className="h-8 text-sm" />
                <Input value={inst.forma} onChange={(e) => updateInstallment(i, "forma", e.target.value)} placeholder="Bolepix" className="h-8 text-sm" />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeInstallment(i)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Data do Contrato ─────────────────────────────────────────── */}
      <div className="space-y-1 max-w-[220px]">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Data do Contrato
        </Label>
        <Input
          value={contractDate}
          onChange={(e) => setContractDate(e.target.value)}
          placeholder={new Date().toLocaleDateString("pt-BR")}
          className="h-8 text-sm"
        />
        <p className="text-xs text-muted-foreground">Em branco = data de hoje</p>
      </div>

      {/* ── Botão gerar ──────────────────────────────────────────────── */}
      <div className="pt-1">
        <Button
          type="button"
          onClick={handleGenerate}
          disabled={generating || saveContractData.isPending}
          size="sm"
        >
          <FileText className="h-4 w-4 mr-2" />
          {generating ? "Gerando PDF..." : "Gerar Contrato PDF"}
        </Button>
      </div>
    </div>
  );
}
