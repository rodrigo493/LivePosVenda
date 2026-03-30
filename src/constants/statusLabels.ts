// Ticket status labels
export const ticketStatusLabels: Record<string, string> = {
  aberto: "Aberto",
  em_analise: "Em análise",
  aguardando_informacoes: "Aguardando informações",
  aguardando_peca: "Aguardando peça",
  agendado: "Agendado",
  em_atendimento: "Em atendimento",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  resolvido: "Resolvido",
  fechado: "Fechado",
};

// Ticket type labels
export const ticketTypeLabels: Record<string, string> = {
  chamado_tecnico: "Chamado Técnico",
  garantia: "Garantia",
  assistencia: "Assistência",
};

// Work order status labels
export const workOrderStatusLabels: Record<string, string> = {
  aberta: "Aberta",
  agendada: "Agendada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

// Work order type labels
export const workOrderTypeLabels: Record<string, string> = {
  garantia: "Garantia",
  pos_venda: "Pós-venda",
  preventiva: "Preventiva",
  assistencia: "Assistência",
};

// Service request type labels
export const requestTypeLabels: Record<string, string> = {
  corretiva: "Corretiva",
  preventiva: "Preventiva",
  inspecao: "Inspeção",
  troca_peca: "Troca de Peça",
  suporte: "Suporte",
};

// Service request / accessories order status labels
export const serviceRequestStatusLabels: Record<string, string> = {
  aberto: "Aberto",
  orcamento_enviado: "Orçamento Enviado",
  agendado: "Agendado",
  em_andamento: "Em Andamento",
  resolvido: "Resolvido",
  cancelado: "Cancelado",
};

// Quote status labels
export const quoteStatusLabels: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_aprovacao: "Aguardando Aprovação",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  convertido_os: "Convertido em OS",
  cancelado: "Cancelado",
};

// Warranty status labels
export const warrantyStatusLabels: Record<string, string> = {
  em_analise: "Em Análise",
  aprovada: "Aprovada",
  reprovada: "Reprovada",
  convertida_os: "Convertida em OS",
};

// Portal ticket status map (subset with shorter labels)
export const portalTicketStatusMap: Record<string, string> = {
  aberto: "Aberto",
  em_analise: "Em análise",
  resolvido: "Resolvido",
  fechado: "Fechado",
  em_atendimento: "Em atendimento",
  agendado: "Agendado",
  aprovado: "Aprovado",
  aguardando_informacoes: "Aguardando info",
  aguardando_peca: "Aguardando peça",
};

// Portal warranty status map
export const portalWarrantyStatusMap: Record<string, string> = {
  em_analise: "Em análise",
  aprovada: "Aprovada",
  reprovada: "Reprovada",
  convertida_os: "Convertida em OS",
};

// Shared item type labels (quotes, work orders, warranties, accessories)
export const itemTypeLabels: Record<string, string> = {
  peca_garantia: "Peça (Garantia)",
  peca_cobrada: "Peça (Cobrada)",
  servico_garantia: "Serviço (Garantia)",
  servico_cobrado: "Serviço (Cobrado)",
  frete: "Frete",
  desconto: "Desconto",
};
