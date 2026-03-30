import { useTechnicalHistory } from "@/hooks/useTechnicalHistory";
import {
  HeadphonesIcon, ShieldCheck, Wrench, ClipboardList, CheckCircle, Package, AlertTriangle, CalendarClock, FileText,
} from "lucide-react";

const eventIcons: Record<string, any> = {
  chamado_aberto: HeadphonesIcon,
  garantia_aberta: ShieldCheck,
  garantia_aprovada: CheckCircle,
  garantia_reprovada: AlertTriangle,
  assistencia_aberta: Wrench,
  orcamento_criado: FileText,
  orcamento_aprovado: CheckCircle,
  os_criada: ClipboardList,
  os_concluida: CheckCircle,
  troca_peca: Package,
  manutencao_preventiva: CalendarClock,
  status_alterado: AlertTriangle,
};

const eventLabels: Record<string, string> = {
  chamado_aberto: "Chamado Aberto",
  garantia_aberta: "Garantia Aberta",
  garantia_aprovada: "Garantia Aprovada",
  garantia_reprovada: "Garantia Reprovada",
  assistencia_aberta: "Assistência Aberta",
  orcamento_criado: "Orçamento Criado",
  orcamento_aprovado: "Orçamento Aprovado",
  os_criada: "OS Criada",
  os_concluida: "OS Concluída",
  troca_peca: "Troca de Peça",
  manutencao_preventiva: "Manutenção Preventiva",
  status_alterado: "Status Alterado",
};

export function TechnicalTimeline({ equipmentId }: { equipmentId: string }) {
  const { data: events, isLoading } = useTechnicalHistory(equipmentId);

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Carregando histórico...</p>;
  if (!events?.length) return <p className="text-sm text-muted-foreground p-4">Nenhum evento registrado.</p>;

  return (
    <div className="relative pl-6 space-y-4">
      <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
      {events.map((ev: any) => {
        const Icon = eventIcons[ev.event_type] || AlertTriangle;
        return (
          <div key={ev.id} className="relative flex gap-3">
            <div className="absolute -left-6 top-0.5 h-5 w-5 rounded-full bg-muted flex items-center justify-center ring-2 ring-background z-10">
              <Icon className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium">{eventLabels[ev.event_type] || ev.event_type}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(ev.event_date).toLocaleDateString("pt-BR")} {new Date(ev.event_date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{ev.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
