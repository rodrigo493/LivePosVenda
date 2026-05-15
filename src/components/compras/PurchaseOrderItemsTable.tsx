// src/components/compras/PurchaseOrderItemsTable.tsx
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PurchaseOrderItem } from "@/types/purchaseOrder";

interface Props {
  items: PurchaseOrderItem[];
  onUpdate: (id: string, updates: Partial<PurchaseOrderItem>) => void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function calcLineTotal(item: PurchaseOrderItem): number {
  return item.quantidade * item.valor_unitario - item.valor_desconto;
}

export function PurchaseOrderItemsTable({ items, onUpdate, onDelete, readOnly = false }: Props) {
  const totalGeral = items.reduce((acc, item) => acc + calcLineTotal(item), 0);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[180px]">Produto</TableHead>
            <TableHead className="w-[90px]">Qtd</TableHead>
            <TableHead className="w-[110px]">Valor unit.</TableHead>
            <TableHead className="w-[90px]">% Desc.</TableHead>
            <TableHead className="w-[110px]">Valor desc.</TableHead>
            <TableHead className="w-[110px]">Un. medida</TableHead>
            <TableHead className="w-[150px]">Class. financeira</TableHead>
            <TableHead className="w-[130px]">Entrega</TableHead>
            <TableHead className="w-[110px] text-right">Total</TableHead>
            {!readOnly && <TableHead className="w-[50px]" />}
          </TableRow>
        </TableHeader>

        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={readOnly ? 9 : 10}
                className="text-center text-muted-foreground py-8"
              >
                Nenhum item adicionado
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => {
              const lineTotal = calcLineTotal(item);

              return (
                <TableRow key={item.id}>
                  {/* Produto */}
                  <TableCell className="font-medium">
                    {item.produto_descricao ?? item.produto_codigo ?? "—"}
                  </TableCell>

                  {/* Qtd */}
                  <TableCell className="p-2">
                    {readOnly ? (
                      <span>{item.quantidade}</span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        step="any"
                        defaultValue={item.quantidade}
                        onBlur={(e) =>
                          onUpdate(item.id, { quantidade: Number(e.target.value) })
                        }
                        className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    )}
                  </TableCell>

                  {/* Valor unit. */}
                  <TableCell className="p-2">
                    {readOnly ? (
                      <span>{formatBRL(item.valor_unitario)}</span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        step="any"
                        defaultValue={item.valor_unitario}
                        onBlur={(e) =>
                          onUpdate(item.id, { valor_unitario: Number(e.target.value) })
                        }
                        className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    )}
                  </TableCell>

                  {/* % Desc. */}
                  <TableCell className="p-2">
                    {readOnly ? (
                      <span>{item.percentual_desconto}%</span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        defaultValue={item.percentual_desconto}
                        onBlur={(e) =>
                          onUpdate(item.id, { percentual_desconto: Number(e.target.value) })
                        }
                        className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    )}
                  </TableCell>

                  {/* Valor desc. */}
                  <TableCell className="p-2">
                    {readOnly ? (
                      <span>{formatBRL(item.valor_desconto)}</span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        step="any"
                        defaultValue={item.valor_desconto}
                        onBlur={(e) =>
                          onUpdate(item.id, { valor_desconto: Number(e.target.value) })
                        }
                        className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    )}
                  </TableCell>

                  {/* Un. medida */}
                  <TableCell className="p-2">
                    {readOnly ? (
                      <span>{item.unidade_medida_label ?? "—"}</span>
                    ) : (
                      <input
                        type="text"
                        defaultValue={item.unidade_medida_label ?? ""}
                        onBlur={(e) =>
                          onUpdate(item.id, {
                            unidade_medida_label: e.target.value || null,
                          })
                        }
                        className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    )}
                  </TableCell>

                  {/* Class. financeira */}
                  <TableCell className="p-2">
                    {readOnly ? (
                      <span>{item.classificacao_financeira_label ?? "—"}</span>
                    ) : (
                      <input
                        type="text"
                        defaultValue={item.classificacao_financeira_label ?? ""}
                        onBlur={(e) =>
                          onUpdate(item.id, {
                            classificacao_financeira_label: e.target.value || null,
                          })
                        }
                        className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    )}
                  </TableCell>

                  {/* Entrega */}
                  <TableCell className="p-2">
                    {readOnly ? (
                      <span>
                        {item.data_entrega
                          ? new Date(item.data_entrega + "T00:00:00").toLocaleDateString("pt-BR")
                          : "—"}
                      </span>
                    ) : (
                      <input
                        type="date"
                        value={item.data_entrega ?? ""}
                        onChange={(e) =>
                          onUpdate(item.id, { data_entrega: e.target.value || null })
                        }
                        className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    )}
                  </TableCell>

                  {/* Total */}
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatBRL(lineTotal)}
                  </TableCell>

                  {/* Ação */}
                  {!readOnly && (
                    <TableCell className="p-2 text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => onDelete(item.id)}
                        aria-label="Remover item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>

        {items.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell
                colSpan={readOnly ? 8 : 9}
                className="text-right font-semibold text-sm"
              >
                Total geral
              </TableCell>
              <TableCell className="text-right font-bold tabular-nums">
                {formatBRL(totalGeral)}
              </TableCell>
              {!readOnly && <TableCell />}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
