import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSaveContractData, type ContractInstallment } from "@/hooks/useContractData";
import { generateContractPdf, type ContractPdfData } from "@/lib/generateContractPdf";
import { fmtBRL } from "@/lib/contractMappings";

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
  const [contractDate, setContractDate] = useState("");
  const [obs, setObs] = useState("EQUIPAMENTO PADRÃO LIVE");
  const [installments, setInstallments] = useState<ContractInstallment[]>(
    initialInstallments ?? []
  );
  const [generating, setGenerating] = useState(false);

  const saveContractData = useSaveContractData();

  const setField = (field: keyof typeof comprador) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setComprador((prev) => ({ ...prev, [field]: e.target.value }));

  const addInstallment = () =>
    setInstallments((prev) => [
      ...prev,
      { parcela: prev.length + 1, data: "", valor: "", forma: "" },
    ]);

  const removeInstallment = (index: number) =>
    setInstallments((prev) =>
      prev.filter((_, i) => i !== index).map((inst, i) => ({ ...inst, parcela: i + 1 }))
    );

  const updateInstallment = (index: number, field: keyof ContractInstallment, value: string | number) =>
    setInstallments((prev) =>
      prev.map((inst, i) => (i === index ? { ...inst, [field]: value } : inst))
    );

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
        items,
        total,
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

  return (
    <div className="border rounded-lg p-4 space-y-5 bg-muted/20">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        Dados do Contrato
      </h3>

      {/* ── Dados do Comprador ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Dados do Comprador
        </p>

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

        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-1">
          Endereço de Entrega
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Rua ocupa ~3/4 e Nº ocupa ~1/4 */}
          <div className="space-y-1 flex gap-2 sm:col-span-2">
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

      {/* ── Itens do Contrato (preview) ───────────────────────────────── */}
      {items.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Itens do Contrato
          </p>
          <div className="border rounded text-xs overflow-hidden">
            <div className="grid grid-cols-[60px_1fr_50px_90px] gap-2 bg-muted/40 px-3 py-1.5 font-medium text-muted-foreground">
              <span>Código</span>
              <span>Descrição</span>
              <span className="text-center">Qtd</span>
              <span className="text-right">Valor</span>
            </div>
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-[60px_1fr_50px_90px] gap-2 px-3 py-1.5 border-t">
                <span className="font-mono text-muted-foreground">{item.code || "—"}</span>
                <span>{item.description}</span>
                <span className="text-center">{item.quantity}</span>
                <span className="text-right">
                  {item.isBreinde ? "BRINDE" : fmtBRL(item.unitPrice * item.quantity)}
                </span>
              </div>
            ))}
            <div className="grid grid-cols-[60px_1fr_50px_90px] gap-2 px-3 py-1.5 border-t bg-muted/20 font-semibold">
              <span className="col-span-3 text-right text-muted-foreground">Total</span>
              <span className="text-right">{fmtBRL(total)}</span>
            </div>
          </div>
        </div>
      )}

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

      {/* ── Parcelas ──────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Parcelas do Contrato
          </p>
          <Button type="button" variant="outline" size="sm" onClick={addInstallment} className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" /> Parcela
          </Button>
        </div>

        {installments.length > 0 && (
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

      {/* ── Data de assinatura ───────────────────────────────────────── */}
      <div className="space-y-1 max-w-[220px]">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Data do Contrato
        </Label>
        <Input
          value={contractDate}
          onChange={(e) => setContractDate(e.target.value)}
          placeholder={`${new Date().toLocaleDateString("pt-BR")}`}
          className="h-8 text-sm"
        />
        <p className="text-xs text-muted-foreground">Deixe em branco para usar a data de hoje</p>
      </div>

      {/* ── Botão gerar ───────────────────────────────────────────────── */}
      <div className="pt-1">
        <Button type="button" onClick={handleGenerate} disabled={generating || saveContractData.isPending} size="sm">
          <FileText className="h-4 w-4 mr-2" />
          {generating ? "Gerando PDF..." : "Gerar Contrato PDF"}
        </Button>
      </div>
    </div>
  );
}
