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

export function extractCodeFromDescription(desc: string): string {
  const d = desc.trim().toUpperCase();
  if (/^V12/.test(d)) return "V12";
  if (/^V8/.test(d)) return "V8X";
  if (/^V5/.test(d)) return d.includes("TORRE") ? "V5PT" : "V5X";
  if (/^V4/.test(d)) return "V4";
  if (/^V2 CROSS/.test(d)) return "V2 CROSS";
  if (/^V2R/.test(d)) return "V2R";
  if (/^V2/.test(d)) return "V2 CROSS";
  if (/^V1/.test(d)) return "V1";
  if (/^5XT/.test(d)) return "5XT";
  if (/^SX[\s.]?360/.test(d)) return "SX.360";
  if (/CX\.PL\.003/.test(d)) return "CX.PL.003";
  if (/CX\.PL\.004/.test(d)) return "CX.PL.004";
  if (/CX\.PL\.005/.test(d)) return "CX.PL.005";
  if (/CX\.PL/.test(d)) return "CX.PL.001";
  if (/KIT\.V5\.133/.test(d)) return "KIT.V5.133";
  if (/KIT\.V5\.131/.test(d)) return "KIT.V5.131";
  if (/KIT\.V5\.134/.test(d)) return "KIT.V5.134";
  if (/KIT\.V5\.130/.test(d)) return "KIT.V5.130";
  if (/KIT\.V5\.118/.test(d)) return "KIT.V5.118";
  return "";
}

const PAYMENT_FORMA: Record<string, string> = {
  pix:               "PIX",
  transferencia:     "Transferência (TED/DOC)",
  cartao_parcelado:  "Cartão parcelado",
  compra_programada: "Compra Programada",
  financiamento:     "Financiamento bancário",
};

export interface QuotePaymentData {
  paymentMethods: string[];
  installmentsCount: number;
  total: number;
  compraProgramadaNotes?: string | null;
  financiamentoNotes?: string | null;
}

export interface ContractInstallmentInit {
  parcela: number;
  data: string;
  valor: string;
  forma: string;
}

export function quoteToContractInstallments(q: QuotePaymentData): ContractInstallmentInit[] {
  const methods = q.paymentMethods.length > 0 ? q.paymentMethods : [];
  if (methods.length === 0) return [];

  const result: ContractInstallmentInit[] = [];
  let num = 1;

  for (const method of methods) {
    if (method === "cartao_parcelado") {
      const n = q.installmentsCount > 0 ? q.installmentsCount : 1;
      const valorParcela = q.total / n;
      for (let i = 0; i < n; i++) {
        result.push({ parcela: num++, data: "", valor: fmtBRL(valorParcela), forma: "Cartão" });
      }
    } else if (method === "compra_programada" && q.compraProgramadaNotes) {
      const lines = q.compraProgramadaNotes.split("\n").filter(Boolean);
      if (lines.length > 1) {
        for (const line of lines) {
          result.push({ parcela: num++, data: "", valor: "", forma: line.trim() });
        }
      } else {
        result.push({ parcela: num++, data: "", valor: fmtBRL(q.total), forma: q.compraProgramadaNotes.trim() });
      }
    } else if (method === "financiamento" && q.financiamentoNotes) {
      result.push({ parcela: num++, data: "", valor: fmtBRL(q.total), forma: q.financiamentoNotes.trim() });
    } else {
      result.push({ parcela: num++, data: "", valor: fmtBRL(q.total), forma: PAYMENT_FORMA[method] ?? method });
    }
  }

  return result;
}
