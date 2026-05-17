// src/components/compras/SupplierQuoteReviewDialog.tsx
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PurchaseOrderItem } from "@/types/purchaseOrder";
import {
  buildQuoteItemUpdates,
  type QuoteExtraction,
  type QuoteConfidence,
  type QuoteReviewItem,
  type QuoteReviewExtra,
  type QuoteApplyPlan,
} from "@/lib/quoteExtraction";

interface Props {
  open: boolean;
  fileName: string;
  extraction: QuoteExtraction;
  items: PurchaseOrderItem[];
  onClose: () => void;
  onApply: (plan: QuoteApplyPlan) => void;
}

const numOrNull = (v: string): number | null => {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const confidenceBadge: Record<QuoteConfidence, { label: string; cls: string }> = {
  alta: { label: "✓ alta", cls: "text-emerald-600" },
  media: { label: "~ média", cls: "text-amber-600" },
  baixa: { label: "⚠ baixa", cls: "text-red-600" },
};

export function SupplierQuoteReviewDialog({ open, fileName, extraction, items, onClose, onApply }: Props) {
  // Estado revisável dos itens do PC (pré-preenchido pela extração da IA)
  const [reviewItems, setReviewItems] = useState<QuoteReviewItem[]>(() =>
    items.map((it) => {
      const found = extraction.items.find((e) => e.po_item_id === it.id);
      return {
        po_item_id: it.id,
        valor_unitario: found?.valor_unitario ?? null,
        data_entrega: found?.data_entrega ?? null,
        percentual_desconto: found?.percentual_desconto ?? null,
        valor_desconto: found?.valor_desconto ?? null,
      };
    }),
  );
  const [extras, setExtras] = useState<QuoteReviewExtra[]>(() =>
    extraction.extra_items.map((e) => ({ selected: false, ...e })),
  );
  const [condicao, setCondicao] = useState(extraction.condicao_pagamento ?? "");

  const matchByItem = useMemo(() => {
    const m = new Map<string, QuoteConfidence>();
    for (const e of extraction.items) {
      m.set(e.po_item_id, e.matched ? e.confidence : "baixa");
    }
    return m;
  }, [extraction]);

  function patchItem(id: string, patch: Partial<QuoteReviewItem>) {
    setReviewItems((prev) => prev.map((it) => (it.po_item_id === id ? { ...it, ...patch } : it)));
  }
  function patchExtra(idx: number, patch: Partial<QuoteReviewExtra>) {
    setExtras((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }

  function handleApply() {
    onApply(buildQuoteItemUpdates({ items: reviewItems, extras, condicao_pagamento: condicao }));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revisão do orçamento — IA leu "{fileName}"</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Condição de pagamento */}
          <div className="space-y-1.5">
            <Label>Condição de pagamento detectada</Label>
            <Input value={condicao} onChange={(e) => setCondicao(e.target.value)} placeholder="Ex: 30/60/90 dias" />
          </div>

          {/* Itens do pedido */}
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Itens do pedido
            </p>
            <div className="rounded-md border divide-y">
              <div className="p-2 grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                <span className="col-span-3">Produto</span>
                <span className="col-span-1">Qtd</span>
                <span className="col-span-2">Vlr unit.</span>
                <span className="col-span-2">% desc.</span>
                <span className="col-span-2">Entrega</span>
                <span className="col-span-2">Match</span>
              </div>
              {items.map((it) => {
                const ri = reviewItems.find((r) => r.po_item_id === it.id);
                if (!ri) return null;
                const conf = matchByItem.get(it.id) ?? "baixa";
                const badge = confidenceBadge[conf];
                return (
                  <div key={it.id} className="p-2 grid grid-cols-12 gap-2 items-center">
                    <span className="col-span-3 text-xs font-medium truncate">
                      {it.produto_descricao ?? it.produto_codigo ?? "—"}
                    </span>
                    <span className="col-span-1 text-xs text-muted-foreground">{it.quantidade}</span>
                    <Input
                      className="col-span-2 h-8 text-xs"
                      placeholder="Vlr unit."
                      value={ri.valor_unitario ?? ""}
                      onChange={(e) => patchItem(it.id, { valor_unitario: numOrNull(e.target.value) })}
                    />
                    <Input
                      className="col-span-2 h-8 text-xs"
                      placeholder="% desc."
                      value={ri.percentual_desconto ?? ""}
                      onChange={(e) => patchItem(it.id, { percentual_desconto: numOrNull(e.target.value) })}
                    />
                    <Input
                      type="date"
                      className="col-span-2 h-8 text-xs"
                      value={ri.data_entrega ?? ""}
                      onChange={(e) => patchItem(it.id, { data_entrega: e.target.value || null })}
                    />
                    <span className={`col-span-2 text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Itens fora do pedido */}
          {extras.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                Itens cotados fora do pedido
              </p>
              <div className="rounded-md border divide-y">
                {extras.map((e, idx) => (
                  <label key={`${idx}-${e.descricao}`} className="p-2 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={e.selected}
                      onChange={(ev) => patchExtra(idx, { selected: ev.target.checked })}
                    />
                    <span className="text-xs flex-1 truncate">{e.descricao}</span>
                    <span className="text-xs text-muted-foreground">{e.quantidade ?? 1}×</span>
                    <span className="text-xs font-medium">
                      {e.valor_unitario != null ? `R$ ${e.valor_unitario}` : "—"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Aviso da IA */}
          {extraction.aviso && (
            <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
              ⚠ {extraction.aviso}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleApply}>Aplicar ao pedido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
