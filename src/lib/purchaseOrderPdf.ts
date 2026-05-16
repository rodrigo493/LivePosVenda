// src/lib/purchaseOrderPdf.ts
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { LOGO_ORCAMENTO_B64 } from "@/assets/logo-orcamento-b64";
import type { PurchaseOrder, PurchaseOrderItem } from "@/types/purchaseOrder";

const COMPRAS_PHONE = "(19) 3608-4008";
const COMPRAS_EMAIL = "compras@liveuniverse.com.br";

const fmtDate = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
};

/** Gera o PDF da solicitação de cotação (sem preços) e retorna o documento jsPDF. */
export function buildPurchaseOrderPdf(po: PurchaseOrder, items: PurchaseOrderItem[]): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // ── Logo (metade da página — ~105 × 11.8mm) ───────────────────────────────
  // Aspect ratio: 5469 / 615 ≈ 8.89
  const logoW = pageWidth / 2;
  const logoH = Math.round((logoW / 8.89) * 10) / 10;
  doc.addImage(LOGO_ORCAMENTO_B64, "PNG", 14, 5, logoW, logoH);

  // ── Contato (abaixo da logo, lado esquerdo) ───────────────────────────────
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  const contactY = 5 + logoH + 4;
  doc.text(`Tel: ${COMPRAS_PHONE}   |   E-mail: ${COMPRAS_EMAIL}`, 14, contactY);
  doc.setTextColor(0);

  // ── Cabeçalho do documento (lado direito, ao lado da logo) ────────────────
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(41, 37, 36);
  doc.text("SOLICITAÇÃO DE COTAÇÃO", pageWidth - 14, 10, { align: "right" });
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`Nº ${po.order_number}`, pageWidth - 14, 17, { align: "right" });
  doc.text(`Data: ${fmtDate(po.data_emissao)}`, pageWidth - 14, 23, { align: "right" });
  if (po.data_entrega_padrao)
    doc.text(`Entrega: ${fmtDate(po.data_entrega_padrao)}`, pageWidth - 14, 29, { align: "right" });
  doc.setTextColor(0);

  // ── Divisor ───────────────────────────────────────────────────────────────
  const dividerY = Math.max(5 + logoH + 18, 35);
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(14, dividerY, pageWidth - 14, dividerY);

  // ── Info do fornecedor ────────────────────────────────────────────────────
  let infoY = dividerY + 8;
  doc.setFontSize(9);
  doc.setTextColor(0);

  doc.setFont("helvetica", "bold");
  doc.text("Fornecedor:", 14, infoY);
  doc.setFont("helvetica", "normal");
  doc.text(po.nomus_fornecedor_nome ?? "—", 42, infoY);

  if (po.nomus_contato_label) {
    doc.setFont("helvetica", "bold");
    doc.text("Contato:", 14, infoY + 6);
    doc.setFont("helvetica", "normal");
    doc.text(po.nomus_contato_label, 42, infoY + 6);
    infoY += 6;
  }
  if (po.nomus_comprador_nome) {
    doc.setFont("helvetica", "bold");
    doc.text("Comprador:", 14, infoY + 6);
    doc.setFont("helvetica", "normal");
    doc.text(po.nomus_comprador_nome, 42, infoY + 6);
    infoY += 6;
  }
  if (po.condicao_pagamento) {
    doc.setFont("helvetica", "bold");
    doc.text("Cond. pagamento:", 14, infoY + 6);
    doc.setFont("helvetica", "normal");
    doc.text(po.condicao_pagamento, 50, infoY + 6);
    infoY += 6;
  }

  // ── Tabela de itens ───────────────────────────────────────────────────────
  autoTable(doc, {
    startY: infoY + 10,
    head: [["#", "Código", "Descrição", "Qtd", "Un.", "Entrega"]],
    body: items.map((it, i) => [
      String(i + 1),
      it.produto_codigo ?? "—",
      it.produto_descricao ?? "—",
      String(it.quantidade ?? 0),
      it.unidade_medida_label ?? "—",
      fmtDate(it.data_entrega),
    ]),
    theme: "striped",
    headStyles: { fillColor: [41, 37, 36], textColor: [255, 255, 255], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 28 },
      3: { cellWidth: 16, halign: "center" },
      4: { cellWidth: 18, halign: "center" },
      5: { cellWidth: 26, halign: "center" },
    },
  });

  // ── Observações ───────────────────────────────────────────────────────────
  if (po.observacoes) {
    const y = ((doc as any).lastAutoTable?.finalY ?? infoY + 10) + 10;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("Observações:", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(po.observacoes, pageWidth - 28), 14, y + 5);
  }

  // ── Rodapé ────────────────────────────────────────────────────────────────
  const footerY = doc.internal.pageSize.getHeight() - 12;
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  doc.line(14, footerY - 3, pageWidth - 14, footerY - 3);
  doc.text("Documento gerado automaticamente — Setor de Compras / Live Universe", 14, footerY);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, pageWidth - 14, footerY, {
    align: "right",
  });

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
