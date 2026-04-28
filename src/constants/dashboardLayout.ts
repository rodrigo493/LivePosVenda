export type LayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
};

export const DEFAULT_LAYOUT: LayoutItem[] = [
  // Row 0: Prioridades do dia
  { i: "dp-delayed",            x: 0,  y: 0, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "dp-overdue-tasks",      x: 2,  y: 0, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "dp-today-tasks",        x: 4,  y: 0, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "dp-no-contact",         x: 6,  y: 0, w: 3, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "dp-stale",              x: 9,  y: 0, w: 3, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  // Row 1: KPIs Tickets
  { i: "tickets-ativos",        x: 0,  y: 1, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "concluidos",            x: 2,  y: 1, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "atrasados",             x: 4,  y: 1, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "media-interacao",       x: 6,  y: 1, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "sem-atendimento",       x: 8,  y: 1, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "aguardando-peca",       x: 10, y: 1, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  // Row 2: KPIs OS / Orçamentos
  { i: "orcamentos-pendentes",  x: 0,  y: 2, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "os-abertas",            x: 2,  y: 2, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "os-concluidas",         x: 4,  y: 2, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "garantias-analise",     x: 6,  y: 2, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "assistencias-abertas",  x: 8,  y: 2, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "custo-garantia",        x: 10, y: 2, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
];
