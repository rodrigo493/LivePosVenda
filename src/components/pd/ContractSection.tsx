import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSaveContractData, type ContractInstallment } from "@/hooks/useContractData";
import { generateContractPdf, type ContractPdfData, type ContractItem } from "@/lib/generateContractPdf";
import { fmtBRL, EBOOK_MAPPING, DIMENSIONS_MAPPING } from "@/lib/contractMappings";

interface Props {
  pdId: string;
  contractNumber: string;
  client: ContractPdfData["client"];
  items: ContractPdfData["items"];
  total: number;
  initialBairro?: string | null;
  initialInstallments?: ContractInstallment[];
  exportedBy?: string;
}

// ── helpers ────────────────────────────────────────────────────────────────────

function parseBRL(s: string): number {
  return parseFloat(s.replace(/[^0-9,]/g, "").replace(",", ".")) || 0;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-1">
      {children}
    </p>
  );
}

/** Formata Date → "DD.MM.YYYY" */
function fmtInstDate(d: Date): string {
  return [
    String(d.getDate()).padStart(2, "0"),
    String(d.getMonth() + 1).padStart(2, "0"),
    d.getFullYear(),
  ].join(".");
}

/** Interpreta "DD/MM/YYYY" ou "DD.MM.YYYY" → Date (ou hoje se inválido) */
function parseInstDate(s: string): Date {
  const parts = s.trim().split(/[\/\.]/);
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts.map(Number);
    const d = new Date(yyyy, mm - 1, dd);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

/** Preenche datas vazias ou sobrescreve todas (overwrite=true):
 *  1ª parcela = startDate, demais = +30 dias cada */
function applyDates(
  insts: ContractInstallment[],
  startDate: Date,
  overwrite = false
): ContractInstallment[] {
  return insts.map((inst, i) => {
    if (!overwrite && inst.data.trim()) return inst;
    const d = new Date(startDate);
    d.setDate(d.getDate() + i * 30);
    return { ...inst, data: fmtInstDate(d) };
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
  initialInstallments,
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

  // ── itens (preço editável) ─────────────────────────────────────────────────
  const [editableItems, setEditableItems] = useState<ContractItem[]>(
    items.map((it) => ({ ...it }))
  );

  const updateItemPrice = (index: number, raw: string) => {
    const n = parseBRL(raw) || parseFloat(raw.replace(",", ".")) || 0;
    setEditableItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, unitPrice: n } : it))
    );
  };

  // ── obs / data ─────────────────────────────────────────────────────────────
  const [obs, setObs] = useState("EQUIPAMENTO PADRÃO LIVE");
  const [contractDate, setContractDate] = useState("");

  // ── parcelas (auto-preenche datas ao montar) ───────────────────────────────
  const [installments, setInstallments] = useState<ContractInstallment[]>(() =>
    applyDates(initialInstallments ?? [], new Date(), false)
  );

  const addInstallment = () =>
    setInstallments((prev) => {
      const lastDate = prev.length > 0 ? parseInstDate(prev[prev.length - 1].data) : new Date();
      const nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + 30);
      return [
        ...prev,
        { parcela: prev.length + 1, data: fmtInstDate(nextDate), valor: "", forma: "" },
      ];
    });

  const removeInstallment = (index: number) =>
    setInstallments((prev) =>
      prev.filter((_, i) => i !== index).map((inst, i) => ({ ...inst, parcela: i + 1 }))
    );

  const updateInstallment = (
    index: number,
    field: keyof ContractInstallment,
    value: string | number
  ) =>
    setInstallments((prev) =>
      prev.map((inst, i) => (i === index ? { ...inst, [field]: value } : inst))
    );

  /** Recalcula todas as datas a partir da data do contrato (ou hoje) */
  const recalcDates = () => {
    const start = contractDate.trim() ? parseInstDate(contractDate) : new Date();
    setInstallments((prev) => applyDates(prev, start, true));
  };

  // ── dimensões derivadas ────────────────────────────────────────────────────
  const dimRows = (() => {
    const seen = new Set<string>();
    const rows: { name: string; weight: string; dims: string }[] = [];
    for (const item of editableItems) {
      if (item.isBreinde) continue;
      const dim = DIMENSIONS_MAPPING[item.code.toUpperCase().trim()];
      if (dim && !seen.has(dim.name)) {
        seen.add(dim.name);
        rows.push(dim);
      }
    }
    return rows;
  })();

  // ── total calculado ────────────────────────────────────────────────────────
  const calcTotal = editableItems.reduce(
    (sum, it) => sum + (it.isBreinde ? 0 : it.unitPrice * it.quantity),
    0
  );

  // ── helpers UI ─────────────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const saveContractData = useSaveContractData();

  const setField =
    (field: keyof typeof comprador) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setComprador((prev) => ({ ...prev, [field]: e.target.value }));

  // ── gerar PDF ─────────────────────────────────────────────────────────────
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

      const pdfData: ContractPdfData = {
        contractNumber,
        date,
        contractDate: contractDate.trim() || undefined,
        obs: obs.trim() || undefined,
        client: { ...comprador, bairro },
        items: editableItems,
        total: calcTotal,
        installments,
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
            <Input value={comprador.razaoSocial} onChange={setField("razaoSocial")} placeholder="Nome da empresa ou próprio nome" className="h-8 text-sm" />
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

      {/* ── 2. Itens + E-books (60/40) ────────────────────────────────── */}
      <div className="space-y-2">
        <SectionTitle>2. Itens do Contrato (equipamento + e-book)</SectionTitle>
        <p className="text-xs text-muted-foreground">
          Edite o valor unitário. E-book = 40% do valor; Equipamento = 60%.
        </p>

        <div className="border rounded overflow-hidden text-xs">
          {/* cabeçalho */}
          <div className="grid grid-cols-[56px_1fr_52px_110px_90px_90px] gap-2 bg-muted/50 px-3 py-1.5 font-medium text-muted-foreground">
            <span>Código</span>
            <span>Descrição</span>
            <span className="text-center">Qtd</span>
            <span className="text-right">Valor Unit.</span>
            <span className="text-right">Equip. (60%)</span>
            <span className="text-right">E-book (40%)</span>
          </div>

          {editableItems.map((item, i) => {
            const codeKey = item.code.toUpperCase().trim();
            const ebook = EBOOK_MAPPING[codeKey];
            const hasEbook = !!ebook && !item.isBreinde;
            const equipVal = item.isBreinde ? null : hasEbook ? item.unitPrice * 0.6 : item.unitPrice;
            const ebookVal = hasEbook ? item.unitPrice * 0.4 : null;

            return (
              <div key={i} className="border-t">
                {/* linha do equipamento */}
                <div className="grid grid-cols-[56px_1fr_52px_110px_90px_90px] gap-2 px-3 py-2 items-center">
                  <span className="font-mono text-muted-foreground truncate">{item.code || "—"}</span>
                  <span className="truncate">{item.description}</span>
                  <span className="text-center">{item.quantity}</span>
                  <div>
                    <Input
                      value={item.unitPrice === 0 && !item.isBreinde ? "" : String(item.unitPrice)}
                      onChange={(e) => updateItemPrice(i, e.target.value)}
                      placeholder="0,00"
                      className="h-7 text-xs text-right"
                      disabled={item.isBreinde}
                    />
                  </div>
                  <span className="text-right font-medium">
                    {item.isBreinde ? <span className="text-blue-500 italic">BRINDE</span> : fmtBRL(equipVal!)}
                  </span>
                  <span className="text-right text-muted-foreground">
                    {hasEbook ? fmtBRL(ebookVal!) : "—"}
                  </span>
                </div>
                {/* linha do e-book */}
                {hasEbook && (
                  <div className="grid grid-cols-[56px_1fr_52px_110px_90px_90px] gap-2 px-3 py-1 items-center bg-muted/20 text-muted-foreground italic">
                    <span className="font-mono text-[10px]">{ebook.code}</span>
                    <span className="text-[10px]">{ebook.desc}</span>
                    <span className="text-center text-[10px]">1</span>
                    <span />
                    <span />
                    <span className="text-right text-[10px] font-medium not-italic text-foreground">{fmtBRL(ebookVal!)}</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* total */}
          <div className="grid grid-cols-[56px_1fr_52px_110px_90px_90px] gap-2 px-3 py-2 border-t bg-muted/30 font-semibold">
            <span className="col-span-4 text-right text-muted-foreground">Total</span>
            <span className="col-span-2 text-right">{fmtBRL(calcTotal)}</span>
          </div>
        </div>
      </div>

      {/* ── OBS ──────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          OBS.
        </Label>
        <Textarea
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Observações do contrato"
          className="text-sm min-h-[56px] resize-none"
          rows={2}
        />
      </div>

      {/* ── Dimensões dos equipamentos ────────────────────────────────── */}
      {dimRows.length > 0 && (
        <div className="space-y-2">
          <SectionTitle>Dimensões (embaladas para transporte)</SectionTitle>
          <div className="border rounded overflow-hidden text-xs">
            <div className="grid grid-cols-[1fr_80px_100px] gap-2 bg-muted/50 px-3 py-1.5 font-medium text-muted-foreground">
              <span>Equipamento</span>
              <span className="text-center">Peso</span>
              <span className="text-center">C × L × A (m)</span>
            </div>
            {dimRows.map((dim, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_100px] gap-2 px-3 py-1.5 border-t">
                <span>{dim.name}</span>
                <span className="text-center">{dim.weight}</span>
                <span className="text-center font-mono">{dim.dims}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Dimensões automáticas baseadas no código do produto. Verifique antes de gerar.
          </p>
        </div>
      )}

      {/* ── Parcelas / Condições de Pagamento ────────────────────────── */}
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
              title="Recalcula todas as datas: 1ª = data do contrato, demais +30 dias"
            >
              <RefreshCw className="h-3 w-3 mr-1" /> Datas
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={addInstallment} className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" /> Parcela
            </Button>
          </div>
        </div>

        {installments.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhuma parcela — vincule um orçamento ao PD para auto-preencher.</p>
        ) : (
          <div className="space-y-1.5">
            <div className="grid grid-cols-[36px_1fr_1fr_1fr_32px] gap-2 px-1">
              <span className="text-xs text-muted-foreground text-center">Nº</span>
              <span className="text-xs text-muted-foreground">Data</span>
              <span className="text-xs text-muted-foreground">Valor</span>
              <span className="text-xs text-muted-foreground">Forma</span>
              <span />
            </div>
            {installments.map((inst, i) => (
              <div key={i} className="grid grid-cols-[36px_1fr_1fr_1fr_32px] gap-2 items-center">
                <span className="text-sm text-center font-medium">{inst.parcela}</span>
                <Input
                  value={inst.data}
                  onChange={(e) => updateInstallment(i, "data", e.target.value)}
                  placeholder="24.10.2025"
                  className="h-8 text-sm"
                />
                <Input
                  value={inst.valor}
                  onChange={(e) => updateInstallment(i, "valor", e.target.value)}
                  placeholder="R$ 9.102,50"
                  className="h-8 text-sm"
                />
                <Input
                  value={inst.forma}
                  onChange={(e) => updateInstallment(i, "forma", e.target.value)}
                  placeholder="Bolepix"
                  className="h-8 text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => removeInstallment(i)}
                >
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
