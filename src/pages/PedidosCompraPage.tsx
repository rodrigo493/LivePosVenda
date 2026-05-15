import { useState, useMemo } from "react";
import { ShoppingCart, ArrowLeft, ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import {
  PURCHASE_ORDER_STATUS_LABELS,
  type PurchaseOrderStatus,
} from "@/types/purchaseOrder";
import { formatDate } from "@/lib/formatters";

export default function PedidosCompraPage() {
  const navigate = useNavigate();
  const { data: orders, isLoading } = usePurchaseOrders();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    if (!orders) return [];
    const q = search.trim().toLowerCase();
    return orders.filter((po) => {
      const matchesSearch =
        !q ||
        po.order_number.toLowerCase().includes(q) ||
        (po.nomus_fornecedor_nome ?? "").toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "all" || po.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  return (
    <div>
      <PageHeader
        title="Pedidos de Compra"
        description="Pedidos de compra e cotações com fornecedores"
        icon={ShoppingCart}
        action={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </Button>
        }
      />

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Input
          placeholder="Buscar por número ou fornecedor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-52">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {(Object.entries(PURCHASE_ORDER_STATUS_LABELS) as [PurchaseOrderStatus, string][]).map(
              ([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-3"
      >
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Carregando...
          </div>
        ) : !filtered.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm bg-card rounded-xl border">
            {orders?.length
              ? "Nenhum pedido encontrado para os filtros aplicados."
              : "Nenhum pedido de compra registrado."}
          </div>
        ) : (
          filtered.map((po) => (
            <div
              key={po.id}
              className="border rounded-lg p-4 bg-card hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => navigate(`/pedidos-compras/${po.id}`)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold font-mono">
                    {po.order_number}
                  </span>
                  <StatusBadge
                    status={PURCHASE_ORDER_STATUS_LABELS[po.status]}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDate(po.created_at)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {po.nomus_fornecedor_nome ?? "—"}
                </span>
              </div>
            </div>
          ))
        )}
      </motion.div>
    </div>
  );
}
