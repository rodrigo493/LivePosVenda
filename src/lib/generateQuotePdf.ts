import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { LOGO_ORCAMENTO_B64 } from "@/assets/logo-orcamento-b64";

export type DocumentType = "quote" | "pa" | "pg" | "pd";

const HEADER_LABELS: Record<DocumentType, string> = {
  quote: "ORÇAMENTO",
  pa: "PEDIDO DE ACESSÓRIO",
  pg: "PEDIDO DE GARANTIA",
  pd: "PEDIDO DE VENDA",
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
    itemType?: string;
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
  exportedBy?: string;
}

export function generateQuotePdf(data: QuotePdfData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // ── Logo (metade da página — 105 × 11.8mm) ───────────────────────────────
  // Aspect ratio: 5469 / 615 ≈ 8.89
  const logoW = pageWidth / 2; // ~105mm
  const logoH = Math.round((logoW / 8.89) * 10) / 10;
  doc.addImage(LOGO_ORCAMENTO_B64, "PNG", 14, 5, logoW, logoH);

  // ── Contato (abaixo da logo, lado esquerdo) ───────────────────────────────
  const phone = data.company.phone || "(19) 3608-4008";
  const email = data.company.email || "posvenda@liveuni.com.br";
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Tel: ${phone}   |   E-mail: ${email}`, 14, 5 + logoH + 5);
  doc.setTextColor(0);

  // ── Cabeçalho do documento (lado direito, ao lado da logo) ────────────────
  const headerLabel = HEADER_LABELS[data.docType ?? "quote"];
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(41, 37, 36);
  doc.text(headerLabel, pageWidth - 14, 10, { align: "right" });
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`Nº ${data.quoteNumber}`, pageWidth - 14, 17, { align: "right" });
  doc.text(`Data: ${data.date}`, pageWidth - 14, 23, { align: "right" });
  if (data.validUntil) doc.text(`Validade: ${data.validUntil}`, pageWidth - 14, 28, { align: "right" });
  doc.setTextColor(0);

  // ── Divisor ───────────────────────────────────────────────────────────────
  const dividerY = 5 + logoH + 11;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(14, dividerY, pageWidth - 14, dividerY);

  // ── Info do cliente ───────────────────────────────────────────────────────
  const clientY = dividerY + 8;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("Cliente:", 14, clientY);
  doc.setFont("helvetica", "normal");
  doc.text(data.client.name, 36, clientY);
  if (data.client.equipment) {
    doc.setFont("helvetica", "bold");
    doc.text("Equipamento:", 14, clientY + 6);
    doc.setFont("helvetica", "normal");
    doc.text(
      `${data.client.equipment}${data.client.serial ? ` — S/N ${data.client.serial}` : ""}`,
      46,
      clientY + 6,
    );
  }

  // ── Tabela de itens ───────────────────────────────────────────────────────
  // frete e desconto ficam apenas no resumo financeiro — não duplicar na tabela
  const tableItems = data.items.filter(
    (item) => item.itemType !== "frete" && item.itemType !== "desconto"
  );

  const tableBody = tableItems.map((item) => [
    item.code,
    item.description,
    item.isWarranty ? "Garantia" : "",
    item.quantity.toString(),
    item.isWarranty ? "—" : `R$ ${item.unitPrice.toFixed(2)}`,
    item.isWarranty ? "Coberto" : `R$ ${item.total.toFixed(2)}`,
  ]);

  const tableStartY = clientY + (data.client.equipment ? 14 : 8);

  autoTable(doc, {
    startY: tableStartY,
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

  // ── Resumo financeiro ──────────────────────────────────────────────────────
  const summaryY = finalY + 10;
  const rightCol = pageWidth - 14;

  doc.setFontSize(9);
  if (data.warrantyTotal > 0) {
    doc.setFont("helvetica", "normal");
    doc.text("Itens cobertos por garantia:", rightCol - 65, summaryY);
    doc.setTextColor(22, 163, 74);
    doc.text(`R$ ${data.warrantyTotal.toFixed(2)}`, rightCol, summaryY, { align: "right" });
    doc.setTextColor(0);
  }

  const subY = summaryY + (data.warrantyTotal > 0 ? 7 : 0);
  doc.setFont("helvetica", "normal");
  doc.text("Subtotal:", rightCol - 65, subY);
  doc.text(`R$ ${data.subtotal.toFixed(2)}`, rightCol, subY, { align: "right" });

  if (data.freight > 0) {
    doc.text("Frete:", rightCol - 65, subY + 6);
    doc.text(`R$ ${data.freight.toFixed(2)}`, rightCol, subY + 6, { align: "right" });
  }
  if (data.discount > 0) {
    doc.text("Desconto:", rightCol - 65, subY + 12);
    doc.text(`- R$ ${data.discount.toFixed(2)}`, rightCol, subY + 12, { align: "right" });
  }

  const totalY = subY + 18;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(rightCol - 70, totalY - 2, rightCol, totalY - 2);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL:", rightCol - 65, totalY + 4);
  doc.text(`R$ ${data.totalCharged.toFixed(2)}`, rightCol, totalY + 4, { align: "right" });

  // ── Forma de pagamento ─────────────────────────────────────────────────────
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
    if (
      data.paymentMethod === "cartao_parcelado" &&
      data.installments &&
      data.installments >= 2
    ) {
      payLabel += ` — ${data.installments}x de R$ ${(data.totalCharged / data.installments).toFixed(2)} (+ juros da operadora)`;
    }
    doc.text(payLabel, 58, afterTotalY);
    afterTotalY += 10;
  }

  // ── Observações ───────────────────────────────────────────────────────────
  if (data.notes) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("Observações:", 14, afterTotalY);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(data.notes, pageWidth - 28);
    doc.text(lines, 14, afterTotalY + 5);
  }

  // ── Rodapé ────────────────────────────────────────────────────────────────
  const footerY = doc.internal.pageSize.getHeight() - 12;
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  doc.line(14, footerY - 3, pageWidth - 14, footerY - 3);
  doc.text("Documento gerado automaticamente — Live Care / Live Universe", 14, footerY);
  const rightFooter = data.exportedBy
    ? `Exportado por: ${data.exportedBy}   |   ${new Date().toLocaleString("pt-BR")}`
    : `Gerado em: ${new Date().toLocaleString("pt-BR")}`;
  doc.text(rightFooter, pageWidth - 14, footerY, { align: "right" });

  return doc;
}
