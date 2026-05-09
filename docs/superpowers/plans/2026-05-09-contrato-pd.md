# Contrato PD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao aprovar um orçamento no PD, gerar automaticamente um contrato em PDF com mesma logo e layout do orçamento, preenchido com dados do cliente, itens do orçamento (com e-books pareados), parcelas e tabela de dimensões dos equipamentos.

**Architecture:** PDF gerado 100% client-side via `jsPDF` (já instalado), seguindo exatamente o padrão de `generateQuotePdf.ts`. Dois novos campos em `service_requests` (bairro e parcelas do contrato). Nova seção "Dados do Contrato" no `PDDetailPage` com campo bairro e editor de parcelas. Botão "Gerar Contrato" baixa o PDF diretamente no browser.

**Tech Stack:** React, jsPDF, jspdf-autotable, Supabase (migration), Shadcn UI, TypeScript

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20260509120000_contract_fields.sql` | Criar | 2 novos campos em service_requests |
| `src/lib/contractMappings.ts` | Criar | E-book mapping, dimensões lookup, valor por extenso |
| `src/lib/generateContractPdf.ts` | Criar | Gerador de PDF do contrato (padrão jsPDF) |
| `src/hooks/useContractData.ts` | Criar | Salvar/carregar dados do contrato |
| `src/components/pd/ContractSection.tsx` | Criar | UI: bairro + editor de parcelas + botão gerar |
| `src/pages/PDDetailPage.tsx` | Modificar | Importar e adicionar ContractSection |

---

### Task 1: Migration — campos do contrato em service_requests

**Files:**
- Create: `supabase/migrations/20260509120000_contract_fields.sql`

- [ ] **Criar o arquivo de migration**

```sql
-- Contract data fields for PD (Pedido de Venda)
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS contract_bairro TEXT,
  ADD COLUMN IF NOT EXISTS contract_installments JSONB DEFAULT '[]';
-- contract_installments shape: [{parcela:1, data:"24.10.2025", valor:"R$ 9.102,50", forma:"Bolepix"}]
```

- [ ] **Aplicar a migration**

```bash
npx supabase db push
```

Expected output: `Applying migration 20260509120000_contract_fields.sql... OK`

- [ ] **Commit**

```bash
git add supabase/migrations/20260509120000_contract_fields.sql
git commit -m "feat(contract): add contract_bairro and contract_installments to service_requests"
```

---

### Task 2: Mappings e helpers do contrato

**Files:**
- Create: `src/lib/contractMappings.ts`

- [ ] **Criar o arquivo com e-book mapping, dimensões e valor por extenso**

```typescript
// Maps product code → e-book {code, description}
export const EBOOK_MAPPING: Record<string, { code: string; desc: string }> = {
  "V1":       { code: "EB.DG.001",   desc: "E-BOOK V1 BARREL" },
  "V2 CROSS": { code: "EB.DG.002",   desc: "E-BOOK V2" },
  "V2R":      { code: "EB.DG.0AC",   desc: "E-BOOK ACESSORIOS" },
  "V4":       { code: "EB.DG.004",   desc: "E-BOOK V4 CHAIR" },
  "V5PT":     { code: "EB.DG.005PT", desc: "E-BOOK V5" },
  "V5P":      { code: "EB.DG.005P",  desc: "E-BOOK V5" },
  "5XT":      { code: "EB.DG.005X",  desc: "E-BOOK V5" },
  "V5C":      { code: "EB.DG.005C",  desc: "E-BOOK V5" },
  "V5X":      { code: "EB.DG.005X",  desc: "E-BOOK V5" },
  "V8X":      { code: "EB.DG.008X",  desc: "E-BOOK V8" },
  "V8P":      { code: "EB.DG.008P",  desc: "E-BOOK V8" },
  "V12":      { code: "EB.DG.012",   desc: "E-BOOK V12" },
};

export interface DimensionRow {
  name: string;
  weight: string;
  dims: string;
}

// Maps product code → dimension table row
export const DIMENSIONS_MAPPING: Record<string, DimensionRow> = {
  "V1":          { name: "V1 Ladder Barrel",        weight: "75,00 Kg",  dims: "1,10x0,80x1,21" },
  "V2 CROSS":    { name: "V2 Cross",                weight: "50,00 Kg",  dims: "1,12x0,1x2,36"  },
  "V2R":         { name: "V2 (Remo)",               weight: "30,00 Kg",  dims: "2,1x0,35x0,28"  },
  "V4":          { name: "V4 Step Chair",            weight: "53,00 Kg",  dims: "0,94x0,87x0,74" },
  "V5P":         { name: "V5 Reformer sem Torre",    weight: "81,00 Kg",  dims: "2,58x0,63x0,28" },
  "V5C":         { name: "V5 Reformer sem Torre",    weight: "81,00 Kg",  dims: "2,58x0,63x0,28" },
  "V5X":         { name: "V5 Reformer sem Torre",    weight: "81,00 Kg",  dims: "2,58x0,63x0,28" },
  "V5PT":        { name: "V5 Reformer com Torre",    weight: "96,00 Kg",  dims: "2,58x0,63x0,28" },
  "5XT":         { name: "V5 Reformer com Torre",    weight: "96,00 Kg",  dims: "2,58x0,63x0,28" },
  "V8X":         { name: "V8 Cadillac",             weight: "143,00 Kg", dims: "2,51x0,90x0,34" },
  "V8P":         { name: "V8 Cadillac",             weight: "143,00 Kg", dims: "2,51x0,90x0,34" },
  "V12":         { name: "V12 Live",                weight: "225,00 Kg", dims: "2,86x0,92x2"    },
  "CX.PL.001":   { name: "Caixa grande exercícios",  weight: "10,00 Kg",  dims: "0,72x0,42x0,27" },
  "KIT.V5.133":  { name: "Conversor MAT",            weight: "23,50 Kg",  dims: "0,72x0,69x0,22" },
  "KIT.V5.118":  { name: "Hand Bar S",               weight: "3,00 Kg",   dims: "0,52x0,32x0,1"  },
  "KIT.V5.131":  { name: "Hand Bar",                 weight: "6,50 Kg",   dims: "0,33x0,92x0,12" },
  "KIT.V5.134":  { name: "Espaldar",                 weight: "8,30 Kg",   dims: "0,83x0,48x0,12" },
  "CX.PL.003":   { name: "Plataforma V1",            weight: "8,3 Kg",    dims: "0,27x0,72x0,10" },
  "CX.PL.005":   { name: "Meia Lua",                 weight: "5,00 Kg",   dims: "0,62x0,64x0,21" },
  "CX.PL.004":   { name: "Caixa de extensão V5",     weight: "6,00 Kg",   dims: "0,27x0,69x0,19" },
  "SX.360":      { name: "SX 360",                   weight: "5,00 Kg",   dims: "0,50x0,22x0,47" },
  "KIT.V5.130":  { name: "Acessório V5 Jump",        weight: "—",         dims: "—"               },
};

// ── Valor por extenso ──────────────────────────────────────────────────────────

const UNITS = [
  "", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
];
const TENS = [
  "", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa",
];
const HUNDREDS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos",
];

function toWords(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  if (n < 20) return UNITS[n];
  if (n < 100) {
    const u = n % 10;
    return TENS[Math.floor(n / 10)] + (u ? " e " + UNITS[u] : "");
  }
  const r = n % 100;
  return HUNDREDS[Math.floor(n / 100)] + (r ? " e " + toWords(r) : "");
}

export function valorPorExtenso(valor: number): string {
  const total = Math.round(valor * 100);
  const reais = Math.floor(total / 100);
  const centavos = total % 100;
  const milhar = Math.floor(reais / 1000);
  const resto = reais % 1000;

  let s =
    milhar > 0
      ? toWords(milhar) + " mil" + (resto ? " e " + toWords(resto) : "")
      : toWords(reais) || "zero";
  s += reais === 1 ? " real" : " reais";
  if (centavos > 0)
    s += " e " + toWords(centavos) + (centavos === 1 ? " centavo" : " centavos");
  return s;
}

export function fmtBRL(n: number): string {
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
```

- [ ] **Commit**

```bash
git add src/lib/contractMappings.ts
git commit -m "feat(contract): add e-book mapping, dimensions lookup and currency helpers"
```

---

### Task 3: Gerador de PDF do contrato

**Files:**
- Create: `src/lib/generateContractPdf.ts`

- [ ] **Criar o gerador de PDF** — usa mesma logo, mesma paleta de cores e mesmo padrão de `generateQuotePdf.ts`

```typescript
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
    name: string;         // contact_person (PJ) ou name (PF)
    cpfCnpj: string;      // document
    razaoSocial: string;  // name da empresa ou próprio nome
    email: string;
    phone: string;
    address: string;      // rua + número
    bairro: string;
    city: string;
    state: string;
    zipCode: string;
  };
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

function addClausesText(doc: jsPDF, startY: number, pageWidth: number): number {
  const margin = 14;
  const textWidth = pageWidth - margin * 2;
  let y = startY;

  const clauses = [
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
    {
      title: "4. Forma de pagamento:",
      text: "Comprador poderá optar pelo pagamento através de cartão de crédito ou Bolepix.",
    },
    {
      title: "4.1",
      text: "Comprador poderá optar por financiar a aquisição dos equipamentos através de terceiros e, nesta hipótese, caso seja necessária a realização de pagamento diretamente do terceiro para a Vendedora, o Comprador deverá informar a Vendedora sobre a data e forma do pagamento a ser realizado.",
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
      title: "9.1",
      text: "O contrato poderá ser rescindido voluntariamente por qualquer uma das partes em qualquer período anterior à remessa das mercadorias mediante comunicação por escrito à parte contrária com incidência de multa de 10% (dez por cento) do valor total do contrato.",
    },
    {
      title: "10. Da Garantia:",
      text: "A Vendedora oferecerá garantia contratual: (a) 12 meses para estruturas do chassi; (b) 6 meses para rolamentos; (c) 3 meses para elásticos, rodinhas e peças plásticas.",
    },
    {
      title: "13. Foro competente:",
      text: "Fica eleito o foro da comarca de São José do Rio Pardo, SP, para dirimir quaisquer dúvidas relativas a este contrato.",
    },
  ];

  doc.setFontSize(8);

  for (const clause of clauses) {
    // Check if we need a new page
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

  const addrFields: [string, string][] = [
    ["Rua:",     data.client.address],
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
  const productRows: string[][] = [];
  for (const item of data.items) {
    const priceStr = item.isBreinde ? "BRINDE" : fmtBRL(item.unitPrice);
    productRows.push([
      item.code,
      item.description,
      priceStr,
      item.quantity.toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
    ]);

    const ebook = EBOOK_MAPPING[item.code.toUpperCase().trim()];
    if (ebook && !item.isBreinde) {
      productRows.push([
        ebook.code,
        ebook.desc,
        "R$ 0,00",
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
        // Linhas de e-book: código começa com "EB."
        if (raw[0].startsWith("EB.")) {
          hookData.cell.styles.textColor = [22, 163, 74];
          hookData.cell.styles.fontStyle = "italic";
        }
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
  doc.text("OBS.: EQUIPAMENTO PADRÃO LIVE", margin, y);
  y += 8;

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

  // ── Cláusulas contratuais ─────────────────────────────────────────────────
  if (y > doc.internal.pageSize.getHeight() - 60) {
    doc.addPage();
    y = 20;
  }

  y = addClausesText(doc, y, pageWidth);

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
  doc.text(`São José do Rio Pardo, ${data.date}.`, pageWidth - margin, y, { align: "right" });
  y += 20;

  // Bloco de assinaturas
  const midPage = pageWidth / 2;
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text("TS FITNESS LTDA", midPage / 2, y, { align: "center" });
  doc.text(data.client.razaoSocial || data.client.name, midPage + midPage / 2, y, { align: "center" });
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.text("CNPJ: 48.033.353.0001-14", midPage / 2, y, { align: "center" });
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
```

- [ ] **Commit**

```bash
git add src/lib/generateContractPdf.ts
git commit -m "feat(contract): add PDF generator with same logo and layout as orçamento"
```

---

### Task 4: Hook useContractData

**Files:**
- Create: `src/hooks/useContractData.ts`

- [ ] **Criar o hook**

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ContractInstallment } from "@/lib/generateContractPdf";

export type { ContractInstallment };

export function useSaveContractData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pdId,
      bairro,
      installments,
    }: {
      pdId: string;
      bairro: string;
      installments: ContractInstallment[];
    }) => {
      const { error } = await supabase
        .from("service_requests")
        .update({
          contract_bairro: bairro,
          contract_installments: installments as any,
        })
        .eq("id", pdId);
      if (error) throw error;
    },
    onSuccess: (_, { pdId }) => {
      qc.invalidateQueries({ queryKey: ["service-request", pdId] });
    },
  });
}
```

- [ ] **Commit**

```bash
git add src/hooks/useContractData.ts
git commit -m "feat(contract): add useContractData hook for saving bairro and installments"
```

---

### Task 5: ContractSection component

**Files:**
- Create: `src/components/pd/ContractSection.tsx`

- [ ] **Criar o componente**

```tsx
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
```

- [ ] **Commit**

```bash
git add src/components/pd/ContractSection.tsx
git commit -m "feat(contract): add ContractSection component with bairro field and installments editor"
```

---

### Task 6: Wiring no PDDetailPage

**Files:**
- Modify: `src/pages/PDDetailPage.tsx`

- [ ] **Verificar o que o PDDetailPage já busca do cliente e do orçamento**

Abrir `src/pages/PDDetailPage.tsx` e localizar onde `client` e `linkedQuote` / `quote_items` são desestruturados da query principal (em torno das linhas 158–260 conforme exploração anterior).

- [ ] **Adicionar import do ContractSection no topo do arquivo** (após os outros imports de componentes)

```typescript
import { ContractSection } from "@/components/pd/ContractSection";
import type { ContractItem } from "@/lib/generateContractPdf";
```

- [ ] **Localizar onde o linked quote é usado no PDDetailPage**

Procurar no arquivo a referência `linkedQuote` ou `quote_items`. O dados do orçamento aprovado já estão carregados na página.

- [ ] **Montar o array `contractItems` a partir dos quote items existentes**

Adicionar logo abaixo de onde `linkedQuote` é definido:

```typescript
const contractItems: ContractItem[] = (linkedQuote?.quote_items ?? []).map((item: any) => ({
  code: item.products?.code ?? "",
  description: item.description ?? "",
  quantity: item.quantity ?? 1,
  unitPrice: item.unit_price ?? 0,
  isBreinde: (item.description ?? "").toLowerCase().includes("brinde"),
}));
```

- [ ] **Adicionar `ContractSection` no JSX após a seção de Nomus**

Localizar o fim da seção Nomus (por volta das linhas 1470–1530). Logo após, antes do fechamento do `</div>` principal, adicionar:

```tsx
{/* Contrato */}
<ContractSection
  pdId={pd.id}
  contractNumber={pd.request_number ?? ""}
  client={{
    name: client?.contact_person || client?.name || "",
    cpfCnpj: client?.document || "",
    razaoSocial: client?.name || "",
    email: client?.email || "",
    phone: client?.phone || client?.whatsapp || "",
    address: client?.address || "",
    bairro: pd.contract_bairro || "",
    city: client?.city || "",
    state: client?.state || "",
    zipCode: client?.zip_code || "",
  }}
  items={contractItems}
  total={linkedQuote?.total ?? 0}
  initialBairro={pd.contract_bairro}
  initialInstallments={pd.contract_installments as any ?? []}
  exportedBy={currentUserName}
/>
```

> **Nota:** `currentUserName`, `client`, `pd`, e `linkedQuote` já existem no scope do componente. Ajustar os nomes das variáveis conforme estiverem declarados no PDDetailPage.

- [ ] **Verificar que `service_requests` query já seleciona os novos campos**

Na query do PDDetailPage, adicionar `contract_bairro, contract_installments` ao select se ainda não estiverem incluídos. Procurar pela string `"service_requests"` + `.select(` no arquivo e incluir os campos:

```typescript
contract_bairro,
contract_installments,
```

- [ ] **Rodar o lint e typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: zero errors. Corrigir quaisquer problemas de tipos antes de commitar.

- [ ] **Commit**

```bash
git add src/pages/PDDetailPage.tsx
git commit -m "feat(contract): wire ContractSection into PDDetailPage"
```

---

## Self-Review

**Spec coverage:**
- ✅ Migration com `contract_bairro` e `contract_installments`
- ✅ Seção "Dados do Contrato" no PDDetailPage com campo bairro e editor de parcelas
- ✅ Geração de PDF com mesma logo e layout do orçamento
- ✅ Tabela de produtos com e-books pareados e cores diferenciadas (verde para e-books, azul para brindes)
- ✅ Total por extenso em português
- ✅ Tabela de dimensões filtrada aos aparelhos do orçamento
- ✅ Tabela de parcelas preenchida com dados do PD
- ✅ Bloco de assinaturas com dados do cliente
- ✅ Rodapé idêntico ao orçamento

**Tipos:** `ContractInstallment` exportado de `generateContractPdf.ts` e re-exportado de `useContractData.ts` — consistente em ambos os usos.

**Placeholders:** nenhum TBD no plano — todo código é completo.
