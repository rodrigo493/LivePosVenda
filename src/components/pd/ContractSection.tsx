import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSaveContractData, type ContractInstallment } from "@/hooks/useContractData";
import { generateContractPdf, type ContractPdfData } from "@/lib/generateContractPdf";

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
  const [bairro, setBairro] = useState(initialBairro ?? "");
  const [installments, setInstallments] = useState<ContractInstallment[]>(
    initialInstallments ?? []
  );
  const [generating, setGenerating] = useState(false);

  const saveContractData = useSaveContractData();

  const addInstallment = () => {
    setInstallments((prev) => [
      ...prev,
      { parcela: prev.length + 1, data: "", valor: "", forma: "" },
    ]);
  };

  const removeInstallment = (index: number) => {
    setInstallments((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((inst, i) => ({ ...inst, parcela: i + 1 }))
    );
  };

  const updateInstallment = (
    index: number,
    field: keyof ContractInstallment,
    value: string | number
  ) => {
    setInstallments((prev) =>
      prev.map((inst, i) => (i === index ? { ...inst, [field]: value } : inst))
    );
  };

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
        client: { ...client, bairro },
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
    <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        Dados do Contrato
      </h3>

      {/* Bairro */}
      <div className="space-y-1.5">
        <Label htmlFor="contract-bairro">Bairro (endereço de entrega)</Label>
        <Input
          id="contract-bairro"
          value={bairro}
          onChange={(e) => setBairro(e.target.value)}
          placeholder="Ex: Centro, Jardim das Flores..."
          className="max-w-xs"
        />
      </div>

      {/* Editor de parcelas */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Parcelas do contrato</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addInstallment}
            className="h-7 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Parcela
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
              <div
                key={i}
                className="grid grid-cols-[36px_1fr_1fr_1fr_32px] gap-2 items-center"
              >
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

      {/* Botão gerar */}
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
