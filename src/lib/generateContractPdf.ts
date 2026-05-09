import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { LOGO_ORCAMENTO_B64 } from "@/assets/logo-orcamento-b64";
import { EBOOK_MAPPING, DIMENSIONS_MAPPING, valorPorExtenso, fmtBRL } from "@/lib/contractMappings";

export interface ContractInstallment {
  parcela: number;
  data: string;   // "24.10.2025"
  valor: string;  // "R$ 9.102,50"
  forma: string;  // "Bolepix"
}

export interface ContractItem {
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  isBreinde: boolean; // true = mostra "BRINDE" no lugar do preço
}

export interface ContractPdfData {
  contractNumber: string;
  date: string; // "09/05/2026"
  client: {
    name: string;           // contact_person (PJ) ou name (PF)
    cpfCnpj: string;        // document
    razaoSocial: string;    // name da empresa ou próprio nome
    email: string;
    phone: string;
    address: string;        // rua
    addressNumber: string;  // nº
    bairro: string;
    city: string;
    state: string;
    zipCode: string;
  };
  contractDate?: string;    // data editável — padrão: hoje
  obs?: string;             // observação livre na tabela de produtos
  items: ContractItem[];
  total: number;
  installments: ContractInstallment[];
  exportedBy?: string;
}

// Cor padrão da marca — mesma do orçamento
const BRAND_COLOR: [number, number, number] = [41, 37, 36];

function addPageHeader(doc: jsPDF, pageWidth: number) {
  const logoW = pageWidth / 2;
  const logoH = Math.round((logoW / 8.89) * 10) / 10;
  doc.addImage(LOGO_ORCAMENTO_B64, "PNG", 14, 5, logoW, logoH);
  return logoH;
}

function addDivider(doc: jsPDF, y: number, pageWidth: number) {
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(14, y, pageWidth - 14, y);
}

type Clause = { title: string; text: string };

const CLAUSES_OBJETO: Clause[] = [
  {
    title: "2.1",
    text: "Todos os produtos são equipamentos de mecanoterapia e seus eventuais acessórios destinados exclusivamente para a prática de atividades de fisioterapia e pilates e deverão ser utilizados exclusivamente sob orientação e supervisão de profissional habilitado nas áreas de fisioterapia e/ou educação física.",
  },
  {
    title: "2.2",
    text: "A utilização comercial dos equipamentos poderá, a qualquer tempo, estar sujeita às regulamentações profissionais das áreas de fisioterapia, educação física ou outras, as quais deverão ser observadas pelo Comprador.",
  },
  {
    title: "2.3",
    text: "O Comprador se responsabiliza pelos eventuais danos causados pela utilização dos aparelhos sem orientação e supervisão de profissional habilitado ou sem a observação das normas profissionais aplicáveis.",
  },
];

const CLAUSES_PRECO: Clause[] = [
  {
    title: "4. Forma de pagamento:",
    text: "Comprador poderá optar pelo pagamento através de cartão de crédito ou Bolepix.",
  },
  {
    title: "4.1",
    text: "Comprador poderá optar por financiar a aquisição dos equipamentos através de terceiros e, nesta hipótese, caso seja necessária a realização de pagamento diretamente do terceiro para a Vendedora, o Comprador deverá informar a Vendedora sobre a data e forma do pagamento a ser realizado.",
  },
  {
    title: "4.2",
    text: "Em caso de pagamento parcelado no cartão de crédito, os juros serão arcados pelo Comprador conforme tabela da operadora de cartão.",
  },
  {
    title: "4.3",
    text: "O Comprador está ciente de que o pagamento via Bolepix (boleto bancário com PIX integrado) poderá ter prazo de compensação de até 1 (um) dia útil.",
  },
  {
    title: "4.4",
    text: "Sobre os atrasos nos pagamentos incidirão multa de 2% (dois por cento) e juros moratórios de 1% a.m. (um por cento ao mês), sem prejuízo do ressarcimento de todas as despesas inerentes à cobrança administrativa ou judicial, inclusive honorários advocatícios.",
  },
  {
    title: "5. Da Produção e Remessa dos Equipamentos:",
    text: "Os equipamentos serão encaminhados para produção após a compensação do pagamento da primeira parcela e serão produzidos no prazo estimado conforme descrito no item 6. Os equipamentos serão enviados para o Comprador somente após a quitação total do pedido, independente da forma de pagamento escolhida.",
  },
  {
    title: "5.1",
    text: "As mercadorias serão disponibilizadas para coleta por transportadora eleita pelo Comprador, após quitação total do frete pelo Comprador.",
  },
  {
    title: "6. Prazo de produção:",
    text: "Prazo de produção de 60 dias. Durante este prazo, o equipamento deverá estar totalmente quitado para faturamento e disponibilização para coleta pela transportadora.",
  },
  {
    title: "7. Da Propriedade dos Equipamentos:",
    text: "A propriedade dos equipamentos é transferida ao Comprador somente após a quitação integral do valor contratado. Até lá, os bens pertencem à Vendedora.",
  },
  {
    title: "8. Das Obrigações do Comprador:",
    text: "O Comprador se obriga a: (a) efetuar os pagamentos nas datas acordadas; (b) fornecer endereço correto para entrega; (c) receber os equipamentos e assinar comprovante de entrega.",
  },
  {
    title: "9. Da Rescisão:",
    text: "O presente contrato poderá ser rescindido por qualquer das partes, por descumprimento das obrigações contratuais pela outra parte, após notificação por escrito com prazo mínimo de 05 (cinco) dias úteis para regularização.",
  },
  {
    title: "9.1",
    text: "O contrato poderá ser rescindido voluntariamente por qualquer uma das partes em qualquer período anterior à remessa das mercadorias mediante comunicação por escrito à parte contrária com incidência de multa de 10% (dez por cento) do valor total do contrato.",
  },
  {
    title: "10. Da Garantia:",
    text: "A Vendedora oferecerá garantia contratual: (a) 12 meses para estruturas do chassi; (b) 6 meses para rolamentos; (c) 3 meses para elásticos, rodinhas e peças plásticas.",
  },
  {
    title: "11. Da Assistência Técnica:",
    text: "A assistência técnica durante o período de garantia será prestada pela Vendedora mediante agendamento prévio. Defeitos causados por mau uso, acidentes ou modificações não autorizadas não são cobertos pela garantia.",
  },
  {
    title: "12. Das Disposições Gerais:",
    text: "Este contrato representa o acordo integral entre as partes, substituindo quaisquer entendimentos anteriores. Qualquer alteração deverá ser feita por escrito e assinada por ambas as partes.",
  },
  {
    title: "13. Foro competente:",
    text: "Fica eleito o foro da comarca de São José do Rio Pardo, SP, para dirimir quaisquer dúvidas relativas a este contrato.",
  },
];

function addClauseGroup(doc: jsPDF, startY: number, pageWidth: number, clauses: Clause[]): number {
  const margin = 14;
  const textWidth = pageWidth - margin * 2;
  let y = startY;

  doc.setFontSize(8);

  for (const clause of clauses) {
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND_COLOR);
    doc.text(clause.title, margin, y);
    y += 4.5;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    const lines = doc.splitTextToSize(clause.text, textWidth);
    doc.text(lines, margin, y);
    y += lines.length * 4.2 + 4;
  }

  return y;
}

export function generateContractPdf(data: ContractPdfData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // ── Logo (mesma do orçamento) ─────────────────────────────────────────────
  const logoH = addPageHeader(doc, pageWidth);

  // ── Cabeçalho direito ─────────────────────────────────────────────────────
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND_COLOR);
  doc.text("CONTRATO DE COMPRA E VENDA", pageWidth - margin, 10, { align: "right" });
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`Contrato Nº ${data.contractNumber}`, pageWidth - margin, 17, { align: "right" });
  doc.text(`Data: ${data.date}`, pageWidth - margin, 23, { align: "right" });
  doc.setTextColor(0);

  // ── Divisor ───────────────────────────────────────────────────────────────
  const divY = Math.max(5 + logoH + 18, 35);
  addDivider(doc, divY, pageWidth);

  // ── Vendedor (fixo) ───────────────────────────────────────────────────────
  let y = divY + 7;
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("Vendedor:", margin, y);
  doc.setFont("helvetica", "normal");
  const vendedorText =
    "TS Fitness LTDA, CNPJ nº 48.033.353/0001-14, com sede na Rodovia Deputado Eduardo Vicente Nasser - SN - KM 267 - Zona Rural, São José do Rio Pardo-SP, CEP: 13.729-899.";
  const vendedorLines = doc.splitTextToSize(vendedorText, pageWidth - margin - 36);
  doc.text(vendedorLines, margin + 22, y);
  y += vendedorLines.length * 4.5 + 5;

  // ── Seção 1: Qualificação do Comprador ────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND_COLOR);
  doc.text("1. Qualificação e informações do Comprador", margin, y);
  y += 7;

  doc.setFontSize(8.5);
  doc.setTextColor(0);

  const compFields: [string, string][] = [
    ["Nome:",           data.client.name],
    ["CPF/CNPJ:",       data.client.cpfCnpj],
    ["Razão Social:",   data.client.razaoSocial],
    ["E-mail:",         data.client.email],
    ["Telefone:",       data.client.phone],
  ];

  for (const [label, value] of compFields) {
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value || "—", margin + 28, y);
    y += 5.5;
  }

  y += 3;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND_COLOR);
  doc.text("Endereço para o contrato e entrega:", margin, y);
  y += 6;
  doc.setTextColor(0);

  const ruaStr = [data.client.address, data.client.addressNumber ? `nº ${data.client.addressNumber}` : ""].filter(Boolean).join(", ");
  const addrFields: [string, string][] = [
    ["Rua:",     ruaStr],
    ["Bairro:",  data.client.bairro],
    ["Cidade:",  data.client.city],
    ["Estado:",  data.client.state],
    ["CEP:",     data.client.zipCode],
  ];

  for (const [label, value] of addrFields) {
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value || "—", margin + 20, y);
    y += 5.5;
  }

  // ── CONSIDERANDO (resumido) ───────────────────────────────────────────────
  y += 4;
  addDivider(doc, y, pageWidth);
  y += 7;

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("CONSIDERANDO:", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  const considerando =
    "Que a LIVE EQUIPAMENTOS, Vendedor, é fabricante e distribuidora de aparelhos de mecanoterapia destinados para a prática de atividades DE REABILITAÇÃO conhecidas como método pilates; que o Comprador está adquirindo aparelhos novos para utilização no exercício de sua atividade profissional, para a oferta de aulas de PILATES, FISIOTERAPIA ou de outras atividades físicas.";
  const consLines = doc.splitTextToSize(considerando, pageWidth - margin * 2);
  doc.text(consLines, margin, y);
  y += consLines.length * 4.2 + 8;

  // ── Seção 2: Objeto — tabela de produtos ──────────────────────────────────
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND_COLOR);
  doc.text(`2. Objeto. — Pedido nº ${data.contractNumber}`, margin, y);
  y += 6;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text(
    "Compra e venda das mercadorias constantes do pedido nas quantidades e preços com IPI identificados no quadro abaixo:",
    margin, y
  );
  y += 7;

  // Build product rows: cada item do orçamento + e-book pareado
  // Distribuição de valor: 60% equipamento / 40% e-book
  const productRows: string[][] = [];
  for (const item of data.items) {
    const ebook = EBOOK_MAPPING[item.code.toUpperCase().trim()];
    const hasEbook = ebook && !item.isBreinde;

    const equipPrice = item.isBreinde
      ? "BRINDE"
      : hasEbook
      ? fmtBRL(item.unitPrice * 0.6)
      : fmtBRL(item.unitPrice);

    productRows.push([
      item.code,
      item.description,
      equipPrice,
      item.quantity.toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
    ]);

    if (hasEbook) {
      productRows.push([
        ebook.code,
        ebook.desc,
        fmtBRL(item.unitPrice * 0.4),
        "1,00",
      ]);
    }
  }

  autoTable(doc, {
    startY: y,
    head: [["Código", "Descrição", "Valor Uni.", "Quant."]],
    body: productRows,
    theme: "striped",
    headStyles: { fillColor: BRAND_COLOR, textColor: [255, 255, 255], fontSize: 8 },
    bodyStyles: { fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 32 },
      2: { cellWidth: 28, halign: "right" },
      3: { cellWidth: 18, halign: "center" },
    },
    didParseCell: (hookData) => {
      if (hookData.section === "body" && hookData.row.raw) {
        const raw = hookData.row.raw as string[];
        // Brindes
        if (raw[2] === "BRINDE") {
          hookData.cell.styles.textColor = [100, 100, 200];
          hookData.cell.styles.fontStyle = "italic";
        }
      }
    },
  });

  y = (doc as any).lastAutoTable?.finalY + 5 || y + 20;

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(80, 80, 80);
  doc.text(`OBS.: ${data.obs || "EQUIPAMENTO PADRÃO LIVE"}`, margin, y);
  y += 6;

  // ── Cláusulas 2.1 / 2.2 / 2.3 (sub-itens do Objeto) ─────────────────────
  y = addClauseGroup(doc, y, pageWidth, CLAUSES_OBJETO);

  // ── Seção 3: Preço ────────────────────────────────────────────────────────
  if (y > doc.internal.pageSize.getHeight() - 80) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND_COLOR);
  doc.text("3. Preço.", margin, y);
  y += 6;

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0);
  const totalStr = fmtBRL(data.total);
  const extensoStr = valorPorExtenso(data.total);
  const precoText = `O preço total discriminado no quadro acima, no montante de ${totalStr} (${extensoStr}), será pago nos prazos, valores e formas constantes no quadro abaixo:`;
  const precoLines = doc.splitTextToSize(precoText, pageWidth - margin * 2);
  doc.text(precoLines, margin, y);
  y += precoLines.length * 4.5 + 5;

  // Tabela de parcelas
  const parcelasRows = data.installments.map((inst) => [
    String(inst.parcela),
    inst.data,
    inst.valor,
    inst.forma,
  ]);

  autoTable(doc, {
    startY: y,
    head: [["PARCELA", "DATA", "VALOR", "FORMA DE PAGAMENTO"]],
    body: parcelasRows,
    theme: "striped",
    headStyles: { fillColor: BRAND_COLOR, textColor: [255, 255, 255], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 22, halign: "center" },
      1: { cellWidth: 32, halign: "center" },
      2: { cellWidth: 38, halign: "right" },
    },
  });

  y = (doc as any).lastAutoTable?.finalY + 5 || y + 20;

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(80, 80, 80);
  doc.text(
    "*Os equipamentos serão encaminhados para produção após a compensação da primeira parcela.",
    margin, y
  );
  y += 4.5;
  doc.text(
    "*Os equipamentos serão faturados e liberados para envio após a quitação da última parcela.",
    margin, y
  );
  y += 10;

  // ── Cláusulas 4 a 13 ─────────────────────────────────────────────────────
  if (y > doc.internal.pageSize.getHeight() - 60) {
    doc.addPage();
    y = 20;
  }

  y = addClauseGroup(doc, y, pageWidth, CLAUSES_PRECO);

  // ── Tabela de dimensões (apenas aparelhos do contrato) ────────────────────
  const dimRows: string[][] = [];
  const seenDimNames = new Set<string>();
  for (const item of data.items) {
    if (item.isBreinde) continue;
    const dim = DIMENSIONS_MAPPING[item.code.toUpperCase().trim()];
    if (dim && !seenDimNames.has(dim.name)) {
      seenDimNames.add(dim.name);
      dimRows.push([dim.name, dim.weight, dim.dims]);
    }
  }

  if (dimRows.length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(
      "*Dimensões dos equipamentos embalados para transporte (dimensões aplicáveis aos itens declarados na tabela objeto):",
      margin, y
    );
    y += 7;

    autoTable(doc, {
      startY: y,
      head: [["Equipamento", "Peso", "C x L x A(m)"]],
      body: dimRows,
      theme: "striped",
      headStyles: { fillColor: BRAND_COLOR, textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
    });

    y = (doc as any).lastAutoTable?.finalY + 12 || y + 20;
  }

  // ── Assinaturas ───────────────────────────────────────────────────────────
  if (y > doc.internal.pageSize.getHeight() - 60) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  const fechamento =
    "E por estarem justos e contratados, as Partes assinam este Contrato de Compra e Venda de Equipamentos de Pilates e fisioterapia eletronicamente, presumindo-se aceito em todos os seus termos após o pagamento da primeira parcela contratual.";
  const fechLines = doc.splitTextToSize(fechamento, pageWidth - margin * 2);
  doc.text(fechLines, margin, y);
  y += fechLines.length * 4.5 + 8;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(0);
  const sigDate = data.contractDate || data.date;
  doc.text(`São José do Rio Pardo, ${sigDate}.`, pageWidth - margin, y, { align: "right" });
  y += 20;

  // Bloco de assinaturas
  const midPage = pageWidth / 2;
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text("TS FITNESS LTDA", midPage / 2, y, { align: "center" });
  doc.text(data.client.razaoSocial || data.client.name, midPage + midPage / 2, y, { align: "center" });
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.text("CNPJ: 48.033.353/0001-14", midPage / 2, y, { align: "center" });
  doc.text(`CPF/CNPJ: ${data.client.cpfCnpj}`, midPage + midPage / 2, y, { align: "center" });

  // ── Rodapé (mesma do orçamento) ───────────────────────────────────────────
  const pageCount = (doc.internal as any).getNumberOfPages?.() ?? 1;
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const footerY = doc.internal.pageSize.getHeight() - 12;
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3);
    doc.text("Documento gerado automaticamente — Live Care / Live Universe", margin, footerY);
    const rightFooter = data.exportedBy
      ? `Exportado por: ${data.exportedBy}   |   ${new Date().toLocaleString("pt-BR")}`
      : `Gerado em: ${new Date().toLocaleString("pt-BR")}`;
    doc.text(rightFooter, pageWidth - margin, footerY, { align: "right" });
  }

  return doc;
}
