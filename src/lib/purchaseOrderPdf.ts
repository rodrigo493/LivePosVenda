// src/lib/purchaseOrderPdf.ts
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PurchaseOrder, PurchaseOrderItem } from "@/types/purchaseOrder";

/** Gera o PDF da solicitação de cotação (sem preços) e retorna o documento jsPDF. */
export function buildPurchaseOrderPdf(po: PurchaseOrder, items: PurchaseOrderItem[]): jsPDF {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("Solicitação de Cotação", 14, 20);
  doc.setFontSize(10);
  doc.text(`Pedido: ${po.order_number}`, 14, 30);
  doc.text(`Fornecedor: ${po.nomus_fornecedor_nome ?? "—"}`, 14, 36);
  doc.text(`Data: ${po.data_emissao ?? "—"}`, 14, 42);

  autoTable(doc, {
    startY: 50,
    head: [["#", "Produto", "Quantidade"]],
    body: items.map((it, i) => [
      String(i + 1),
      it.produto_descricao ?? it.produto_codigo ?? "—",
      String(it.quantidade ?? 0),
    ]),
  });

  if (po.observacoes) {
    const y = (doc as any).lastAutoTable.finalY + 10;
    doc.text("Observações:", 14, y);
    doc.text(doc.splitTextToSize(po.observacoes, 180), 14, y + 6);
  }
  return doc;
}

/** Faz o download do PDF. */
export function downloadPurchaseOrderPdf(po: PurchaseOrder, items: PurchaseOrderItem[]): void {
  buildPurchaseOrderPdf(po, items).save(`${po.order_number}.pdf`);
}

/** Retorna o PDF como base64 (sem o prefixo data URI) para envio por e-mail. */
export function purchaseOrderPdfBase64(po: PurchaseOrder, items: PurchaseOrderItem[]): string {
  const dataUri = buildPurchaseOrderPdf(po, items).output("datauristring");
  return dataUri.split(",")[1] ?? "";
}
