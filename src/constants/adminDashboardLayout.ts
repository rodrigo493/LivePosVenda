export type AdminLayoutItem = {
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

export const DEFAULT_ADMIN_LAYOUT: AdminLayoutItem[] = [
  { i: "kpi-abertos",          x: 0, y: 0, w: 3, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "kpi-garantias",        x: 3, y: 0, w: 3, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "kpi-andamento",        x: 6, y: 0, w: 3, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "kpi-resolvidos",       x: 9, y: 0, w: 3, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "kpi-total",            x: 0, y: 1, w: 3, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "kpi-os",               x: 3, y: 1, w: 3, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "kpi-custo",            x: 6, y: 1, w: 3, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "kpi-equip",            x: 9, y: 1, w: 3, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "kpi-gasto-garantia",   x: 0, y: 2, w: 4, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "kpi-valor-vendas",     x: 4, y: 2, w: 4, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
  { i: "kpi-valor-acessorios", x: 8, y: 2, w: 4, h: 1, minW: 2, maxW: 12, minH: 1, maxH: 3 },
];

export const ACCENT_COLORS: { value: string | null; label: string }[] = [
  { value: null,      label: "Padrão" },
  { value: "#3b82f6", label: "Azul" },
  { value: "#10b981", label: "Verde" },
  { value: "#f59e0b", label: "Âmbar" },
  { value: "#ef4444", label: "Vermelho" },
  { value: "#8b5cf6", label: "Roxo" },
  { value: "#ec4899", label: "Rosa" },
  { value: "#06b6d4", label: "Ciano" },
  { value: "#f97316", label: "Laranja" },
  { value: "#6366f1", label: "Índigo" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#84cc16", label: "Lima" },
];
