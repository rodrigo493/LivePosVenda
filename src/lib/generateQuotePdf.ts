import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type DocumentType = "quote" | "pa" | "pg";

const HEADER_LABELS: Record<DocumentType, string> = {
  quote: "ORÇAMENTO",
  pa: "PEDIDO DE ACESSÓRIO",
  pg: "PEDIDO DE GARANTIA",
};

interface QuotePdfData {
  quoteNumber: string;
  date: string;
  validUntil?: string;
  company: { name: string; phone?: string; email?: string };
  client: { name: string; equipment?: string; serial?: string };
  items: {
    code: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    isWarranty: boolean;
  }[];
  subtotal: number;
  freight: number;
  discount: number;
  totalCharged: number;
  warrantyTotal: number;
  notes?: string;
  docType?: DocumentType;
  paymentMethod?: string | null;
  installments?: number | null;
}

export function generateQuotePdf(data: QuotePdfData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(data.company.name, 14, 20);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  if (data.company.phone) doc.text(`Tel: ${data.company.phone}`, 14, 26);
  if (data.company.email) doc.text(`Email: ${data.company.email}`, 14, 31);

  // Document header right-aligned
  const headerLabel = HEADER_LABELS[data.docType ?? "quote"];
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(headerLabel, pageWidth - 14, 20, { align: "right" });
  doc.setFontSize(11);
  doc.text(data.quoteNumber, pageWidth - 14, 27, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Data: ${data.date}`, pageWidth - 14, 33, { align: "right" });
  if (data.validUntil) doc.text(`Validade: ${data.validUntil}`, pageWidth - 14, 38, { align: "right" });

  // Divider
  doc.setDrawColor(200);
  doc.line(14, 42, pageWidth - 14, 42);

  // Client info
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Cliente:", 14, 50);
  doc.setFont("helvetica", "normal");
  doc.text(data.client.name, 40, 50);
  if (data.client.equipment) {
    doc.setFont("helvetica", "bold");
    doc.text("Equipamento:", 14, 56);
    doc.setFont("helvetica", "normal");
    doc.text(`${data.client.equipment}${data.client.serial ? ` - S/N ${data.client.serial}` : ""}`, 50, 56);
  }

  // Items table
  const tableBody = data.items.map((item) => [
    item.code,
    item.description,
    item.isWarranty ? "Garantia" : "",
    item.quantity.toString(),
    item.isWarranty ? "—" : `R$ ${item.unitPrice.toFixed(2)}`,
    item.isWarranty ? "Coberto" : `R$ ${item.total.toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: 62,
    head: [["Código", "Descrição", "Tipo", "Qtd", "Valor Unit.", "Total"]],
    body: tableBody,
    theme: "striped",
    headStyles: { fillColor: [41, 37, 36], textColor: [255, 255, 255], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 25 },
      2: { cellWidth: 20 },
      3: { cellWidth: 15, halign: "center" },
      4: { cellWidth: 25, halign: "right" },
      5: { cellWidth: 25, halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.raw) {
        const raw = data.row.raw as string[];
        if (raw[2] === "Garantia") {
          data.cell.styles.textColor = [22, 163, 74];
          data.cell.styles.fontStyle = "italic";
        }
      }
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 150;

  // Summary
  const summaryY = finalY + 10;
  const rightCol = pageWidth - 14;

  doc.setFontSize(9);
  if (data.warrantyTotal > 0) {
    doc.setFont("helvetica", "normal");
    doc.text("Itens cobertos por garantia:", rightCol - 60, summaryY);
    doc.setTextColor(22, 163, 74);
    doc.text(`R$ ${data.warrantyTotal.toFixed(2)}`, rightCol, summaryY, { align: "right" });
    doc.setTextColor(0);
  }

  const subY = summaryY + (data.warrantyTotal > 0 ? 7 : 0);
  doc.text("Subtotal:", rightCol - 60, subY);
  doc.text(`R$ ${data.subtotal.toFixed(2)}`, rightCol, subY, { align: "right" });

  if (data.freight > 0) {
    doc.text("Frete:", rightCol - 60, subY + 6);
    doc.text(`R$ ${data.freight.toFixed(2)}`, rightCol, subY + 6, { align: "right" });
  }
  if (data.discount > 0) {
    doc.text("Desconto:", rightCol - 60, subY + 12);
    doc.text(`- R$ ${data.discount.toFixed(2)}`, rightCol, subY + 12, { align: "right" });
  }

  const totalY = subY + 18;
  doc.setDrawColor(200);
  doc.line(rightCol - 65, totalY - 2, rightCol, totalY - 2);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL:", rightCol - 60, totalY + 4);
  doc.text(`R$ ${data.totalCharged.toFixed(2)}`, rightCol, totalY + 4, { align: "right" });

  // Payment method
  const PAYMENT_LABELS: Record<string, string> = {
    pix: "À vista — PIX",
    transferencia: "Transferência bancária (TED/DOC)",
    cartao_parcelado: "Parcelamento no cartão com juros",
  };
  let afterTotalY = totalY + 14;
  if (data.paymentMethod) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("Forma de pagamento:", 14, afterTotalY);
    doc.setFont("helvetica", "normal");
    let payLabel = PAYMENT_LABELS[data.paymentMethod] ?? data.paymentMethod;
    if (data.paymentMethod === "cartao_parcelado" && data.installments && data.installments >= 2) {
      payLabel += ` — ${data.installments}x de R$ ${(data.totalCharged / data.installments).toFixed(2)} (+ juros da operadora)`;
    }
    doc.text(payLabel, 60, afterTotalY);
    afterTotalY += 10;
  }

  // Notes/footer
  if (data.notes) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("Observações:", 14, afterTotalY);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(data.notes, pageWidth - 28);
    doc.text(lines, 14, afterTotalY + 5);
  }

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 15;
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text("Documento gerado automaticamente pelo sistema Live Care.", 14, footerY);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, pageWidth - 14, footerY, { align: "right" });

  return doc;
}
