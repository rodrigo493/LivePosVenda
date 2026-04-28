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
  { i: "tickets-ativos",        x: 0,  y: 0, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "concluidos",            x: 2,  y: 0, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "atrasados",             x: 4,  y: 0, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "media-interacao",       x: 6,  y: 0, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "sem-atendimento",       x: 8,  y: 0, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "aguardando-peca",       x: 10, y: 0, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "orcamentos-pendentes",  x: 0,  y: 1, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "os-abertas",            x: 2,  y: 1, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "os-concluidas",         x: 4,  y: 1, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "garantias-analise",     x: 6,  y: 1, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "assistencias-abertas",  x: 8,  y: 1, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "custo-garantia",        x: 10, y: 1, w: 2, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
];
