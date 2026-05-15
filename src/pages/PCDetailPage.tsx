import { useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ShoppingCart, FileDown, Mail, Upload, Send, Loader2, Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

import {
  usePurchaseOrder,
  usePurchaseOrderItems,
  useUpdatePurchaseOrder,
  useAddPurchaseOrderItem,
  useUpdatePurchaseOrderItem,
  useDeletePurchaseOrderItem,
} from "@/hooks/usePurchaseOrders";
import { useNomusTiposMovimentacao } from "@/hooks/useNomusLookup";
import { NomusPessoaSearch } from "@/components/compras/NomusPessoaSearch";
import { PurchaseOrderItemsTable } from "@/components/compras/PurchaseOrderItemsTable";
import { ProductSearch } from "@/components/products/ProductSearch";
import { downloadPurchaseOrderPdf, purchaseOrderPdfBase64 } from "@/lib/purchaseOrderPdf";
import { buildPedidoCompraPayload } from "@/lib/buildPedidoCompraPayload";
import { PURCHASE_ORDER_STATUS_LABELS } from "@/types/purchaseOrder";
import type { PurchaseOrderStatus } from "@/types/purchaseOrder";

// ─── Tipo Movimentação autocomplete ─────────────────────────────────────────

function TipoMovimentacaoSearch({
  value,
  onSelect,
}: {
  value: string | null;
  onSelect: (codigo: number, nome: string) => void;
}) {
  const [termo, setTermo] = useState("");
  const [open, setOpen] = useState(false);
  const { results, loading } = useNomusTiposMovimentacao(termo);

  return (
    <div className="relative">
      <Input
        value={open ? termo : (value ?? "")}
        placeholder="Buscar tipo de movimentação..."
        onFocus={() => { setOpen(true); setTermo(""); }}
        onChange={(e) => setTermo(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="h-9 text-xs"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-60 overflow-auto">
          {loading && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Buscando...</div>
          )}
          {!loading && results.length === 0 && termo.trim().length >= 1 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum resultado</div>
          )}
          {results.map((t) => (
            <button
              key={t.codigo}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
              onMouseDown={() => { onSelect(t.codigo, t.nome); setOpen(false); }}
            >
              {t.nome}{" "}
              <span className="text-xs text-muted-foreground">(#{t.codigo})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Campo de texto com persistência no blur ─────────────────────────────────

function FieldInput({
  defaultValue,
  onBlurSave,
  placeholder,
  className,
}: {
  defaultValue: string;
  onBlurSave: (val: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [val, setVal] = useState(defaultValue);
  return (
    <Input
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => onBlurSave(val)}
      placeholder={placeholder}
      className={className ?? "h-9 text-xs"}
    />
  );
}

function FieldTextarea({
  defaultValue,
  onBlurSave,
  placeholder,
  rows,
}: {
  defaultValue: string;
  onBlurSave: (val: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const [val, setVal] = useState(defaultValue);
  return (
    <Textarea
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => onBlurSave(val)}
      placeholder={placeholder}
      rows={rows ?? 3}
      className="text-xs"
    />
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PCDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromTicketId = searchParams.get("from_ticket");
  const qc = useQueryClient();

  const { data: po, isLoading } = usePurchaseOrder(id);
  const { data: items = [] } = usePurchaseOrderItems(id);

  const updatePO = useUpdatePurchaseOrder();
  const addItem = useAddPurchaseOrderItem();
  const updateItem = useUpdatePurchaseOrderItem();
  const deleteItem = useDeletePurchaseOrderItem();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [creatingNomus, setCreatingNomus] = useState(false);
  const [uploadingQuote, setUploadingQuote] = useState(false);

  // ─── helpers ──────────────────────────────────────────────────────────────

  function update(fields: Parameters<typeof updatePO.mutate>[0]) {
    if (!po) return;
    updatePO.mutate({ id: po.id, ...fields } as any);
  }

  // ─── Loading / not found ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    );
  }

  if (!po) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Pedido de compra não encontrado.
      </div>
    );
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleGeneratePdf = () => {
    downloadPurchaseOrderPdf(po, items);
  };

  const handleSendEmail = async () => {
    setSendingEmail(true);
    try {
      const pdf_base64 = purchaseOrderPdfBase64(po, items);
      const { data, error } = await supabase.functions.invoke("send-purchase-order-email", {
        body: { purchase_order_id: po.id, pdf_base64 },
      });
      if (error) {
        toast.error(error.message ?? "Falha no envio");
        return;
      }
      if (data?.ok) {
        toast.success("E-mail enviado com sucesso!");
        qc.invalidateQueries({ queryKey: ["purchase-order", po.id] });
      } else {
        toast.error(data?.error ?? "Falha no envio");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Falha no envio");
    } finally {
      setSendingEmail(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingQuote(true);
    try {
      const path = `pc/${po.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("compras-orcamentos")
        .upload(path, file);
      if (uploadError) { toast.error(uploadError.message); return; }

      const { data: urlData } = supabase.storage
        .from("compras-orcamentos")
        .getPublicUrl(path);
      const url = urlData?.publicUrl ?? "";

      update({
        supplier_quote_pdf_url: url,
        supplier_quote_uploaded_at: new Date().toISOString(),
        status: "orcamento_recebido" as PurchaseOrderStatus,
      });
      toast.success("Orçamento importado com sucesso!");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao importar orçamento");
    } finally {
      setUploadingQuote(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCreateNomus = async () => {
    setCreatingNomus(true);
    try {
      const payload = buildPedidoCompraPayload(po, items);
      const { data, error } = await supabase.functions.invoke("nomus-create-purchase-order", {
        body: { purchase_order_id: po.id, payload },
      });
      if (error) {
        toast.error(error.message ?? "Erro ao criar no Nomus");
        return;
      }
      if (data?.ok) {
        toast.success(`Pedido criado no Nomus: ${data.codigoPedido}`);
        qc.invalidateQueries({ queryKey: ["purchase-order", po.id] });
      } else {
        toast.error(data?.error ?? "Erro ao criar no Nomus");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao criar no Nomus");
    } finally {
      setCreatingNomus(false);
    }
  };

  const handleProductSelect = (product: any, _itemType: string) => {
    addItem.mutate({
      purchase_order_id: po.id,
      nomus_produto_id: product._fromNomus ? Number(product.id) || null : null,
      produto_codigo: product.code ?? null,
      produto_descricao: product.name ?? product.description ?? null,
      posicao: items.length + 1,
      quantidade: 1,
      valor_unitario: Number(product.base_cost ?? 0),
      percentual_desconto: 0,
      valor_desconto: 0,
    });
  };

  // ─── JSX ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (fromTicketId) navigate(`/crm?open_ticket=${fromTicketId}`);
            else navigate("/pedidos-compras");
          }}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {fromTicketId ? "Voltar ao Card" : "Voltar"}
        </Button>

        <div className="flex-1">
          <h1 className="font-display font-bold text-lg flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            {po.order_number}
          </h1>
          <p className="text-xs text-muted-foreground">
            Pedido de Compra
            {po.nomus_fornecedor_nome ? ` • ${po.nomus_fornecedor_nome}` : ""}
            {po.nomus_codigo_pedido ? ` • Nomus #${po.nomus_codigo_pedido}` : ""}
          </p>
        </div>

        {/* Status select */}
        <div className="w-44">
          <Select
            value={po.status}
            onValueChange={(val) => update({ status: val as PurchaseOrderStatus })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(PURCHASE_ORDER_STATUS_LABELS) as [PurchaseOrderStatus, string][]).map(
                ([val, label]) => (
                  <SelectItem key={val} value={val}>
                    {label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Informações gerais ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl border shadow-sm overflow-hidden mb-6"
      >
        <div className="px-4 py-3 border-b bg-muted/50">
          <h3 className="font-display font-semibold text-sm">Informações gerais</h3>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. Pedido — read-only */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Pedido
            </Label>
            <Input
              value={po.order_number}
              readOnly
              className="mt-1 h-9 text-xs bg-muted/40 cursor-default"
            />
          </div>

          {/* 2. Empresa */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Empresa
            </Label>
            <div className="mt-1">
              <FieldInput
                key={`empresa-${po.id}`}
                defaultValue={po.nomus_empresa_label ?? ""}
                onBlurSave={(val) => update({ nomus_empresa_label: val || null })}
                placeholder="Ex: TS"
              />
            </div>
          </div>

          {/* 3. Fornecedor */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Fornecedor
            </Label>
            <div className="mt-1">
              <NomusPessoaSearch
                categoria="fornecedor"
                value={po.nomus_fornecedor_nome}
                onSelect={(p) =>
                  update({ nomus_fornecedor_id: p.id, nomus_fornecedor_nome: p.nome })
                }
                placeholder="Buscar fornecedor..."
              />
            </div>
          </div>

          {/* 4. Tipo de movimentação */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Tipo de movimentação
            </Label>
            <div className="mt-1">
              <TipoMovimentacaoSearch
                value={po.nomus_tipo_movimentacao_label}
                onSelect={(codigo, nome) =>
                  update({ nomus_tipo_movimentacao_id: codigo, nomus_tipo_movimentacao_label: nome })
                }
              />
            </div>
          </div>

          {/* 5. Data de emissão */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Data de emissão
            </Label>
            <input
              type="date"
              key={`emissao-${po.id}`}
              defaultValue={po.data_emissao ?? ""}
              onBlur={(e) => update({ data_emissao: e.target.value || null })}
              className="mt-1 w-full px-3 py-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring h-9"
            />
          </div>

          {/* 6. Data de entrega padrão */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Data de entrega padrão
            </Label>
            <input
              type="date"
              key={`entrega-${po.id}`}
              defaultValue={po.data_entrega_padrao ?? ""}
              onBlur={(e) => update({ data_entrega_padrao: e.target.value || null })}
              className="mt-1 w-full px-3 py-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring h-9"
            />
          </div>

          {/* 7. Contato */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Contato
            </Label>
            <div className="mt-1">
              <FieldInput
                key={`contato-${po.id}`}
                defaultValue={po.nomus_contato_label ?? ""}
                onBlurSave={(val) => update({ nomus_contato_label: val || null })}
                placeholder="Nome do contato..."
              />
            </div>
          </div>

          {/* 8. Comprador */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Comprador
            </Label>
            <div className="mt-1">
              <NomusPessoaSearch
                categoria="comprador"
                value={po.nomus_comprador_nome}
                onSelect={(p) =>
                  update({ nomus_comprador_id: p.id, nomus_comprador_nome: p.nome })
                }
                placeholder="Buscar comprador..."
              />
            </div>
          </div>

          {/* 9. Condição de pagamento */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Condição de pagamento
            </Label>
            <div className="mt-1">
              <FieldInput
                key={`condicao-${po.id}`}
                defaultValue={po.condicao_pagamento ?? ""}
                onBlurSave={(val) => update({ condicao_pagamento: val || null })}
                placeholder="Ex: 30/60/90 dias..."
              />
            </div>
          </div>

          {/* 10. Observações — spans full width */}
          <div className="md:col-span-2 lg:col-span-3">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Observações
            </Label>
            <div className="mt-1">
              <FieldTextarea
                key={`obs-${po.id}`}
                defaultValue={po.observacoes ?? ""}
                onBlurSave={(val) => update({ observacoes: val || null })}
                placeholder="Observações gerais do pedido de compra..."
                rows={3}
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Itens do pedido de compra ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl border shadow-sm overflow-hidden mb-6"
      >
        <div className="px-4 py-3 border-b bg-muted/50 flex items-center justify-between">
          <h3 className="font-display font-semibold text-sm">
            Itens do pedido de compra ({items.length})
          </h3>
        </div>

        <div className="p-4">
          {/* Product search para adicionar itens */}
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1">
              <Plus className="h-3 w-3" /> Adicionar produto
            </p>
            <ProductSearch
              onSelect={handleProductSelect}
            />
          </div>

          {/* Tabela de itens */}
          <PurchaseOrderItemsTable
            items={items}
            onUpdate={(itemId, updates) => updateItem.mutate({ id: itemId, ...updates } as any)}
            onDelete={(itemId) =>
              deleteItem.mutate({ id: itemId, purchase_order_id: po.id })
            }
          />
        </div>
      </motion.div>

      {/* ── Barra de ações ───────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl border shadow-sm p-4 mb-6"
      >
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
          Ações
        </p>
        <div className="flex flex-wrap gap-3">
          {/* Gerar PDF */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleGeneratePdf}
          >
            <FileDown className="h-3.5 w-3.5" />
            Gerar PDF
          </Button>

          {/* Enviar e-mail PC */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleSendEmail}
            disabled={sendingEmail}
          >
            {sendingEmail ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mail className="h-3.5 w-3.5" />
            )}
            {sendingEmail ? "Enviando..." : "Enviar e-mail PC"}
          </Button>

          {/* Importar orçamento */}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingQuote}
            >
              {uploadingQuote ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {uploadingQuote ? "Importando..." : "Importar orçamento"}
            </Button>
            {po.supplier_quote_pdf_url && (
              <a
                href={po.supplier_quote_pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Abrir orçamento
              </a>
            )}
          </div>

          {/* Criar pedido na Nomus */}
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handleCreateNomus}
            disabled={creatingNomus}
          >
            {creatingNomus ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {creatingNomus ? "Criando no Nomus..." : "Criar pedido na Nomus"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
