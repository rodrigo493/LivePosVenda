import { Brain, AlertTriangle, Wrench, MessageSquare, HelpCircle, ArrowRight, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

interface AiTriageData {
  resumo_caso?: string;
  modelo_provavel?: string;
  categoria_problema?: string;
  possiveis_causas?: string[];
  pecas_relacionadas?: string[];
  nivel_urgencia?: string;
  perguntas_triagem?: string[];
  proximos_passos?: string[];
  tipo_atendimento_sugerido?: string;
  confianca_analise?: string;
  orientacao_inicial?: string;
}

interface AiTriageBlockProps {
  triage: AiTriageData;
  origin?: string | null;
  channel?: string | null;
}

const confidenceBadge: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  alta: { label: "Alta Confiança", variant: "default" },
  media: { label: "Média Confiança", variant: "secondary" },
  baixa: { label: "Baixa Confiança", variant: "outline" },
};

const urgencyBadge: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  urgente: { label: "Urgente", variant: "destructive" },
  alta: { label: "Alta", variant: "destructive" },
  media: { label: "Média", variant: "secondary" },
  baixa: { label: "Baixa", variant: "outline" },
};

const typeBadge: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  garantia: { label: "Garantia", variant: "default" },
  assistencia: { label: "Assistência", variant: "secondary" },
  orcamento: { label: "Orçamento", variant: "outline" },
};

export function AiTriageBlock({ triage, origin, channel }: AiTriageBlockProps) {
  if (!triage) return null;

  const conf = confidenceBadge[triage.confianca_analise || "baixa"] || confidenceBadge.baixa;
  const urg = urgencyBadge[triage.nivel_urgencia || "media"] || urgencyBadge.media;
  const tipo = typeBadge[triage.tipo_atendimento_sugerido || "assistencia"] || typeBadge.assistencia;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h3 className="font-display font-semibold text-sm">Análise Inicial por IA</h3>
        </div>
        <div className="flex items-center gap-2">
          {origin && (
            <Badge variant="outline" className="text-[10px]">
              {origin === "manychat" ? "ManyChat" : origin} / {channel || "whatsapp"}
            </Badge>
          )}
          <Badge variant={conf.variant} className="text-[10px]">{conf.label}</Badge>
        </div>
      </div>

      {/* Summary */}
      {triage.resumo_caso && (
        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-sm text-foreground/90">{triage.resumo_caso}</p>
        </div>
      )}

      {/* Key Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Urgência</p>
          <Badge variant={urg.variant}>{urg.label}</Badge>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tipo Sugerido</p>
          <Badge variant={tipo.variant}>{tipo.label}</Badge>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Categoria</p>
          <span className="text-sm font-medium">{triage.categoria_problema || "—"}</span>
        </div>
      </div>

      {/* Possible Causes */}
      {triage.possiveis_causas && triage.possiveis_causas.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Possíveis Causas</p>
          </div>
          <ul className="space-y-1">
            {triage.possiveis_causas.map((causa, i) => (
              <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                <span className="text-muted-foreground mt-0.5">•</span>
                {causa}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Related Parts */}
      {triage.pecas_relacionadas && triage.pecas_relacionadas.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Peças Relacionadas</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {triage.pecas_relacionadas.map((peca, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{peca}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Triage Questions */}
      {triage.perguntas_triagem && triage.perguntas_triagem.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Perguntas de Triagem</p>
          </div>
          <ul className="space-y-1">
            {triage.perguntas_triagem.map((q, i) => (
              <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                <span className="text-primary font-semibold">{i + 1}.</span>
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Next Steps */}
      {triage.proximos_passos && triage.proximos_passos.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Próximos Passos</p>
          </div>
          <ul className="space-y-1">
            {triage.proximos_passos.map((step, i) => (
              <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                <span className="text-muted-foreground mt-0.5">→</span>
                {step}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Orientation */}
      {triage.orientacao_inicial && (
        <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
          <div className="flex items-center gap-1.5 mb-1">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-medium text-primary">Orientação Técnica</p>
          </div>
          <p className="text-sm text-foreground/80">{triage.orientacao_inicial}</p>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-[10px] text-muted-foreground italic">
        ⚠️ Esta análise foi gerada automaticamente por IA e serve como suporte à triagem. Não substitui a avaliação técnica presencial.
      </p>
    </motion.div>
  );
}
