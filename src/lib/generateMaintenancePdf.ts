import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface MaintenancePdfData {
  modelName: string;
  component: string;
  intervalMonths: number;
  recommendation?: string;
  procedure?: string;
  parts: {
    code: string;
    name: string;
    quantity: number;
    notes?: string;
  }[];
  company: { name: string; phone?: string; email?: string };
  clientName?: string;
  equipmentSerial?: string;
}

export function generateMaintenancePdf(data: MaintenancePdfData) {
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

  // Title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("PROCEDIMENTO DE MANUTENÇÃO PREVENTIVA", pageWidth - 14, 20, { align: "right" });

  // Divider
  doc.setDrawColor(200);
  doc.line(14, 36, pageWidth - 14, 36);

  // Info block
  let y = 44;
  doc.setFontSize(10);

  const addInfoLine = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, 55, y);
    y += 6;
  };

  addInfoLine("Modelo", data.modelName);
  addInfoLine("Componente", data.component);
  addInfoLine("Intervalo", `${data.intervalMonths} meses`);
  if (data.clientName) addInfoLine("Cliente", data.clientName);
  if (data.equipmentSerial) addInfoLine("Equipamento", data.equipmentSerial);
  if (data.recommendation) {
    addInfoLine("Recomendação", "");
    y -= 6;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(data.recommendation, pageWidth - 69);
    doc.text(lines, 55, y);
    y += lines.length * 5 + 4;
  }

  // Parts table
  if (data.parts.length > 0) {
    y += 4;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("PEÇAS NECESSÁRIAS", 14, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [["Código", "Peça", "Qtd", "Observações"]],
      body: data.parts.map((p) => [p.code, p.name, p.quantity.toString(), p.notes || "—"]),
      theme: "striped",
      headStyles: { fillColor: [41, 37, 36], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 30 },
        2: { cellWidth: 20, halign: "center" },
      },
    });

    y = (doc as any).lastAutoTable?.finalY || y + 30;
  }

  // Procedure steps
  if (data.procedure) {
    y += 8;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("PROCEDIMENTO", 14, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    const procedureLines = doc.splitTextToSize(data.procedure, pageWidth - 28);
    
    // Check if we need a new page
    if (y + procedureLines.length * 4.5 > doc.internal.pageSize.getHeight() - 25) {
      doc.addPage();
      y = 20;
    }

    doc.text(procedureLines, 14, y);
  }

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 15;
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text("Documento gerado automaticamente pelo sistema Live Care.", 14, footerY);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, pageWidth - 14, footerY, { align: "right" });

  return doc;
}
