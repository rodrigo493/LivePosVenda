interface StatusBadgeProps {
  status: string;
}

const statusConfig: Record<string, { bg: string; text: string }> = {
  aberto: { bg: "bg-info/10", text: "text-info" },
  "em análise": { bg: "bg-warning/10", text: "text-warning" },
  "em andamento": { bg: "bg-primary/10", text: "text-primary" },
  agendado: { bg: "bg-info/10", text: "text-info" },
  resolvido: { bg: "bg-success/10", text: "text-success" },
  fechado: { bg: "bg-muted", text: "text-muted-foreground" },
  aprovado: { bg: "bg-success/10", text: "text-success" },
  reprovado: { bg: "bg-destructive/10", text: "text-destructive" },
  ativo: { bg: "bg-success/10", text: "text-success" },
  inativo: { bg: "bg-muted", text: "text-muted-foreground" },
  "em garantia": { bg: "bg-primary/10", text: "text-primary" },
  vencida: { bg: "bg-destructive/10", text: "text-destructive" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const key = status.toLowerCase();
  const config = statusConfig[key] || { bg: "bg-muted", text: "text-muted-foreground" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${config.bg} ${config.text}`}>
      {status}
    </span>
  );
}
