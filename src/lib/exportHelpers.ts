import * as XLSX from "xlsx";
import type jsPDF from "jspdf";

export type ExportItem = {
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  isWarranty: boolean;
};

export type ExportDocument = {
  title: string;
  number: string;
  date: string;
  clientName: string;
  equipment?: string;
  serial?: string;
  items: ExportItem[];
  subtotal: number;
  freight: number;
  discount: number;
  totalCharged: number;
  warrantyTotal: number;
  notes?: string;
};

export function exportDocumentToExcel(doc: ExportDocument) {
  const headerRows: (string | number)[][] = [
    [doc.title, doc.number],
    ["Data", doc.date],
    ["Cliente", doc.clientName],
  ];
  if (doc.equipment) headerRows.push(["Equipamento", doc.equipment]);
  if (doc.serial) headerRows.push(["Série", doc.serial]);
  headerRows.push([]);

  const itemRows: (string | number)[][] = [
    ["Código", "Descrição", "Tipo", "Qtd", "Valor Unit.", "Total"],
    ...doc.items.map((item) => [
      item.code,
      item.description,
      item.isWarranty ? "Garantia" : "Cobrado",
      item.quantity,
      item.isWarranty ? 0 : item.unitPrice,
      item.isWarranty ? 0 : item.total,
    ]),
  ];

  const totalsRows: (string | number)[][] = [
    [],
    ["Subtotal", "", "", "", "", doc.subtotal],
  ];
  if (doc.freight > 0) totalsRows.push(["Frete", "", "", "", "", doc.freight]);
  if (doc.discount > 0) totalsRows.push(["Desconto", "", "", "", "", -doc.discount]);
  if (doc.warrantyTotal > 0) totalsRows.push(["Itens cobertos por garantia", "", "", "", "", doc.warrantyTotal]);
  totalsRows.push(["TOTAL COBRADO", "", "", "", "", doc.totalCharged]);

  if (doc.notes) {
    totalsRows.push([]);
    totalsRows.push(["Observações", doc.notes]);
  }

  const aoa = [...headerRows, ...itemRows, ...totalsRows];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [{ wch: 18 }, { wch: 40 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, doc.number || "Documento");
  XLSX.writeFile(wb, `${doc.number || "documento"}.xlsx`);
}

export function printPdf(pdfDoc: jsPDF) {
  const blobUrl = pdfDoc.output("bloburl") as unknown as string;
  const win = window.open(blobUrl, "_blank", "noopener,noreferrer");
  if (!win) return;
  win.opener = null;
  win.addEventListener("load", () => {
    try {
      win.focus();
      win.print();
    } catch {
      // some browsers block print, user can still click print inside the viewer
    }
  });
}
