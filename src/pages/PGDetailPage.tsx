import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Shield, Save, Loader2, Send, CalendarIcon, Pencil, X, Wrench, Plus, Trash2, Package, Factory } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notifySquad } from "@/lib/squadNotify";
import { generateQuotePdf } from "@/lib/generateQuotePdf";
import { exportDocumentToExcel, printPdf, type ExportDocument } from "@/lib/exportHelpers";
import { ExportMenu } from "@/components/shared/ExportMenu";
import { toast } from "sonner";
import { format, parse, isValid } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { ProductSearch } from "@/components/products/ProductSearch";
import { SuggestedParts } from "@/components/products/SuggestedParts";
import { useAddQuoteItem, useDeleteQuoteItem } from "@/hooks/useQuotes";
import { useCreateProduct } from "@/hooks/useProducts";
import { warrantyStatusLabels, itemTypeLabels } from "@/constants/statusLabels";
import { ExternalLink } from "lucide-react";

const partTypes = [
  { value: "peca_cobrada", label: "Peça (Cobrada)" },
  { value: "peca_garantia", label: "Peça (Garantia)" },
];

const serviceTypes = [
  { value: "servico_cobrado", label: "Serviço (Cobrado)" },
  { value: "servico_garantia", label: "Serviço (Garantia)" },
  { value: "frete", label: "Frete" },
  { value: "desconto", label: "Desconto" },
];

const PGDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromTicketId = searchParams.get("from_ticket");
  const addItem = useAddQuoteItem();
  const deleteItemMutation = useDeleteQuoteItem();
  const createProduct = useCreateProduct();
  const qc = useQueryClient();

  const { data: wc, isLoading } = useQuery({
    queryKey: ["warranty_claim_detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warranty_claims")
        .select("*, tickets(ticket_number, title, clients(name), equipments(serial_number, model_id, equipment_models(name)))")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: linkedQuote } = useQuery({
    queryKey: ["pg_linked_quote", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, quote_items(*, products(code, name))")
        .eq("warranty_claim_id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [defect, setDefect] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [parts, setParts] = useState<string | null>(null);
  const [squadNotes, setSquadNotes] = useState<string | null>(null);
  const [savingSquad, setSavingSquad] = useState(false);
  const [costVal, setCostVal] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [searchMode, setSearchMode] = useState<"peca" | "servico" | null>(null);
  const [showNewServiceForm, setShowNewServiceForm] = useState(false);
  const [newService, setNewService] = useState({ name: "", description: "", cost: "", itemType: "servico_garantia" });

  // Editable item data (quantity, unit_price per item)
  const [editableItems, setEditableItems] = useState<Record<string, { quantity: string; unit_price: string; description: string }>>({});

  // Nomus ERP fields
  const [nomusFields, setNomusFields] = useState({
    pedido: "",
    empresa: "TS",
    cliente: "",
    tipoMovimentacao: "VENDAS DE MERCADORIAS",
    dataEmissao: format(new Date(), "dd/MM/yyyy"),
    dataEntregaPadrao: "",
    cfop: "",
  });
  const [nomusClientId, setNomusClientId] = useState<number | null>(null);
  const [nomusClientResults, setNomusClientResults] = useState<{ id: number; nome: string }[]>([]);
  const [nomusClientLoading, setNomusClientLoading] = useState(false);
  const [nomusClientOpen, setNomusClientOpen] = useState(false);
  const nomusSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-fill fields from wc data when loaded
  useEffect(() => {
    if (!wc) return;
    const clientName = wc.tickets?.clients?.name || "";
    const claimNum = (wc as any).claim_number || "";
    setNomusFields(prev => ({
      ...prev,
      pedido: prev.pedido || claimNum,
      cliente: prev.cliente || clientName,
    }));
    if (clientName) {
      void resolveNomusClientId(clientName).then(id => {
        if (id) setNomusClientId(id);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wc]);

  const updateNomusField = (field: string, value: string) => {
    setNomusFields(prev => ({ ...prev, [field]: value }));
  };

  // Nomus usa query=campo%3D"*termo*" (não FIQL like com %)
  const nomusGet = async (field: string, term: string, ms = 5000): Promise<any[]> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const q = encodeURIComponent(`${field}="*${term.toUpperCase()}*"`);
      const r = await fetch(
        `/api/nomus/rest/clientes?query=${q}`,
        { headers: { Accept: "application/json" }, signal: ctrl.signal }
      );
      clearTimeout(timer);
      if (!r.ok) return [];
      const body = await r.json();
      return Array.isArray(body) ? body : [];
    } catch { clearTimeout(timer); return []; }
  };

  const searchNomusClients = (query: string) => {
    updateNomusField("cliente", query);
    setNomusClientId(null);
    if (query.length < 3) { setNomusClientResults([]); setNomusClientOpen(false); return; }
    if (nomusSearchTimer.current) clearTimeout(nomusSearchTimer.current);
    nomusSearchTimer.current = setTimeout(async () => {
      setNomusClientLoading(true);
      const term = query.trim();
      const seen = new Set<number>();
      const results: { id: number; nome: string }[] = [];
      for (const field of ["nome", "razaoSocial"]) {
        if (results.length > 0) break;
        const list = await nomusGet(field, term);
        for (const p of list) {
          if (seen.has(p.id) || results.length >= 20) continue;
          seen.add(p.id);
          results.push({ id: p.id, nome: p.razaoSocial || p.nome || `ID ${p.id}` });
        }
      }
      setNomusClientResults(results);
      setNomusClientOpen(results.length > 0);
      setNomusClientLoading(false);
    }, 500);
  };

  const selectNomusClient = (client: { id: number; nome: string }) => {
    setNomusClientId(client.id);
    updateNomusField("cliente", client.nome);
    setNomusClientOpen(false);
  };

  const resolveNomusClientId = async (name: string): Promise<number | null> => {
    const q = name.trim();
    if (!q) return null;
    const words = q.split(/\s+/);
    // Tenta nome completo, depois primeiras 2 palavras, depois só a primeira
    const terms = [q, ...(words.length > 2 ? [words.slice(0, 2).join(" ")] : []), words[0]];
    for (const term of terms) {
      for (const field of ["nome", "razaoSocial"]) {
        const list = await nomusGet(field, term);
        if (list.length > 0) {
          const exact = list.find((p: any) =>
            [p.nome, p.razaoSocial].some((n: string) => n?.toUpperCase() === q.toUpperCase())
          );
          return ((exact ?? list[0]) as any).id as number;
        }
      }
    }
    return null;
  };

  const items = linkedQuote?.quote_items || [];

  // Editable item-level ERP data
  const [itemErpData, setItemErpData] = useState<Record<string, { produto: string; quantidade: string; valorUnitario: string }>>({});

  // Initialize item ERP data and editable items from quote items
  useEffect(() => {
    if (items.length === 0) return;
    setItemErpData(prev => {
      const next = { ...prev };
      for (const item of items) {
        if (!next[item.id]) {
          next[item.id] = {
            produto: item.products?.code || item.description || "",
            quantidade: String(item.quantity || 1),
            valorUnitario: Number(item.unit_price || 0).toFixed(2),
          };
        }
      }
      return next;
    });
    setEditableItems(prev => {
      const next = { ...prev };
      for (const item of items) {
        if (!next[item.id]) {
          next[item.id] = {
            quantity: String(item.quantity || 1),
            unit_price: Number(item.unit_price || 0).toFixed(2),
            description: item.description || "",
          };
        }
      }
      return next;
    });
  }, [items]);

  const updateItemErp = (itemId: string, field: string, value: string) => {
    setItemErpData(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const updateEditableItem = (itemId: string, field: string, value: string) => {
    setEditableItems(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const totals = useMemo(() => {
    let warranty = 0, subtotalPecas = 0, subtotalServicos = 0, frete = 0, desconto = 0, internalCost = 0;
    for (const item of items) {
      const qty = editing ? Number(editableItems[item.id]?.quantity || item.quantity) : item.quantity;
      const price = editing ? Number(editableItems[item.id]?.unit_price || item.unit_price) : Number(item.unit_price);
      const lineCost = qty * Number(item.unit_cost);
      const linePrice = qty * price;
      internalCost += lineCost;
      if (item.item_type === "desconto") desconto += linePrice;
      else if (item.item_type === "frete") { frete += linePrice; }
      else if (String(item.item_type).includes("garantia")) warranty += lineCost;
      else if (String(item.item_type).includes("peca")) subtotalPecas += linePrice;
      else subtotalServicos += linePrice;
    }
    const charged = subtotalPecas + subtotalServicos + frete - desconto;
    const margin = charged > 0 ? ((charged - (internalCost - warranty)) / charged * 100) : 0;
    return { subtotalPecas, subtotalServicos, warranty, charged, internalCost, margin, frete, desconto };
  }, [items, editing, editableItems]);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;
  if (!wc) return <div className="p-8 text-center text-muted-foreground">Pedido de garantia não encontrado.</div>;

  const currentDefect = defect ?? wc.defect_description ?? "";
  const currentAnalysis = analysis ?? wc.technical_analysis ?? "";
  const currentParts = parts ?? wc.covered_parts ?? "";
  const currentSquadNotes = squadNotes ?? (wc as any).squad_notes ?? "";
  const currentCost = costVal ?? String(wc.internal_cost || 0);
  const claimNumber = (wc as any).claim_number || "PG";
  const clientName = wc.tickets?.clients?.name || "—";
  const modelName = wc.tickets?.equipments?.equipment_models?.name || "—";
  const serialNumber = wc.tickets?.equipments?.serial_number || "";
  const equipModelId = (wc.tickets?.equipments as any)?.model_id || undefined;

  const buildPgPdfPayload = () => ({
    quoteNumber: claimNumber,
    date: new Date(wc.created_at).toLocaleDateString("pt-BR"),
    company: { name: "Live Care Pilates", phone: "(11) 99999-9999", email: "contato@livecare.com.br" },
    client: {
      name: clientName,
      equipment: modelName !== "—" ? modelName : undefined,
      serial: serialNumber || undefined,
    },
    items: items.map((item: any) => ({
      code: item.products?.code || "—",
      description: item.description,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      total: item.quantity * Number(item.unit_price),
      isWarranty: String(item.item_type).includes("garantia"),
    })),
    subtotal: totals.subtotalPecas + totals.subtotalServicos,
    freight: totals.frete,
    discount: totals.desconto,
    totalCharged: totals.charged,
    warrantyTotal: totals.warranty,
    notes: currentDefect || undefined,
    docType: "pg" as const,
  });

  const buildPgExcelPayload = (): ExportDocument => {
    const p = buildPgPdfPayload();
    return {
      title: "Pedido de Garantia",
      number: p.quoteNumber,
      date: p.date,
      clientName: p.client.name,
      equipment: p.client.equipment,
      serial: p.client.serial,
      items: p.items,
      subtotal: p.subtotal,
      freight: p.freight,
      discount: p.discount,
      totalCharged: p.totalCharged,
      warrantyTotal: p.warrantyTotal,
      notes: p.notes,
    };
  };

  const handleExportPdf = () => { generateQuotePdf(buildPgPdfPayload()).save(`${claimNumber}.pdf`); };
  const handleExportExcel = () => exportDocumentToExcel(buildPgExcelPayload());
  const handlePrint = () => printPdf(generateQuotePdf(buildPgPdfPayload()));

  const handleProductSelect = async (product: any, itemType: string) => {
    if (!linkedQuote) {
      toast.error("Nenhum orçamento vinculado para adicionar itens.");
      return;
    }
    const tax = (Number(product.ipi_percent || 0) + Number(product.icms_percent || 0) + Number(product.pis_percent || 0) + Number(product.cofins_percent || 0) + Number(product.csll_percent || 0) + Number(product.irpj_percent || 0)) / 100;
    const cost = Number(product.base_cost) * (1 + tax);
    const price = itemType.includes("garantia") ? 0 : cost * (1 + Number(product.margin_percent || 30) / 100);
    await addItem.mutateAsync({
      quote_id: linkedQuote.id,
      product_id: product.id,
      description: product.name,
      item_type: itemType,
      quantity: 1,
      unit_cost: cost,
      unit_price: price,
    });
    toast.success(`${product.name} adicionado ao pedido`);
    qc.invalidateQueries({ queryKey: ["pg_linked_quote", id] });
  };

  const handleDeleteItem = async (itemId: string) => {
    await deleteItemMutation.mutateAsync(itemId);
    toast.success("Item removido");
    qc.invalidateQueries({ queryKey: ["pg_linked_quote", id] });
  };

  const handleEnterEdit = () => {
    setEditing(true);
    const next: Record<string, { quantity: string; unit_price: string; description: string }> = {};
    for (const item of items) {
      next[item.id] = {
        quantity: String(item.quantity || 1),
        unit_price: Number(item.unit_price || 0).toFixed(2),
        description: item.description || "",
      };
    }
    setEditableItems(next);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // 1. Save warranty_claim fields
      const { error: wcError } = await supabase.from("warranty_claims").update({
        defect_description: currentDefect,
        technical_analysis: currentAnalysis,
        covered_parts: currentParts,
        squad_notes: currentSquadNotes || null,
        internal_cost: parseFloat(currentCost) || 0,
      }).eq("id", id!);
      if (wcError) throw wcError;

      // 2. Save each edited item
      const itemUpdates = items.map(async (item: any) => {
        const ed = editableItems[item.id];
        if (!ed) return;
        const newQty = Number(ed.quantity) || item.quantity;
        const newPrice = Number(ed.unit_price) || Number(item.unit_price);
        const newDesc = ed.description || item.description;
        const { error } = await supabase.from("quote_items").update({
          quantity: newQty,
          unit_price: newPrice,
          description: newDesc,
        }).eq("id", item.id);
        if (error) throw error;
      });
      await Promise.all(itemUpdates);

      // 3. Recalculate quote totals
      if (linkedQuote) {
        let newSubtotal = 0;
        let newDiscount = 0;
        let newFreight = 0;
        for (const item of items) {
          const ed = editableItems[item.id];
          const qty = Number(ed?.quantity || item.quantity);
          const price = Number(ed?.unit_price || item.unit_price);
          const lineTotal = qty * price;
          if (item.item_type === "desconto") newDiscount += lineTotal;
          else if (item.item_type === "frete") newFreight += lineTotal;
          else newSubtotal += lineTotal;
        }
        const newTotal = newSubtotal + newFreight - newDiscount;
        await supabase.from("quotes").update({
          subtotal: newSubtotal,
          discount: newDiscount,
          freight: newFreight,
          total: newTotal,
        }).eq("id", linkedQuote.id);
      }

      // Notify Squad whenever items are saved
      void notifySquad({ recordType: "pg", recordId: id!, reference: claimNumber });
      toast.success("Alterações salvas e Squad notificado!");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["warranty_claim_detail", id] });
      qc.invalidateQueries({ queryKey: ["pg_linked_quote", id] });
    } catch (err: any) {
      if (import.meta.env.DEV) console.error("Save error:", err);
      toast.error(err.message || "Erro ao salvar alterações");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("warranty_claims").update({
        defect_description: currentDefect,
        technical_analysis: currentAnalysis,
        covered_parts: currentParts,
        internal_cost: parseFloat(currentCost) || 0,
      }).eq("id", id!);
      if (error) throw error;
      toast.success("Salvo com sucesso");
      setDefect(null);
      setAnalysis(null);
      setParts(null);
      setSquadNotes(null);
      setCostVal(null);
      qc.invalidateQueries({ queryKey: ["warranty_claim_detail", id] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSquadNotes = async () => {
    setSavingSquad(true);
    try {
      const notes = currentSquadNotes.trim() || null;
      const { error } = await supabase.from("warranty_claims").update({ squad_notes: notes }).eq("id", id!);
      if (error) throw error;
      await notifySquad({ recordType: "pg", recordId: id!, reference: claimNumber });
      toast.success("Observações salvas e enviadas ao Squad!");
      qc.invalidateQueries({ queryKey: ["warranty_claim_detail", id] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar ao Squad");
    } finally {
      setSavingSquad(false);
    }
  };

  const handleStatusChange = async (val: string) => {
    const { error } = await supabase.from("warranty_claims").update({ warranty_status: val as any }).eq("id", id!);
    if (error) toast.error("Erro ao atualizar");
    else { toast.success("Status atualizado"); qc.invalidateQueries({ queryKey: ["warranty_claim_detail", id] }); }
  };

  const resolveNomusProductId = async (code: string): Promise<number | null> => {
    try {
      const res = await fetch(`/api/nomus/rest/produtos?query=codigo==${encodeURIComponent(code)}`, {
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
      });
      if (!res.ok) return null;
      const products = await res.json();
      return Array.isArray(products) && products.length > 0 ? products[0].id : null;
    } catch { return null; }
  };

  const handleApprove = async () => {
    if (!nomusFields.dataEntregaPadrao) { toast.error("Preencha a Data de Entrega Padrão."); return; }
    if (!nomusFields.cliente.trim()) { toast.error("Preencha o nome do cliente."); return; }

    setApproving(true);
    void notifySquad({ recordType: "pg", recordId: id!, reference: claimNumber });
    try {
      let idPessoaCliente = nomusClientId;
      if (!idPessoaCliente) {
        idPessoaCliente = await resolveNomusClientId(nomusFields.cliente);
      }
      if (!idPessoaCliente) {
        toast.error(`Cliente "${nomusFields.cliente}" não encontrado no ERP Nomus.`);
        return;
      }

      const today = new Date();
      const fallbackDate = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

      const itensPedido = await Promise.all(items.map(async (item: any, idx: number) => {
        const erpData = itemErpData[item.id];
        const code = erpData?.produto || item.products?.code || "";
        const idProduto = await resolveNomusProductId(code);
        if (!idProduto) throw new Error(`Produto "${code}" não encontrado no ERP Nomus.`);
        return {
          idProduto,
          item: String(idx + 1),
          quantidade: String(Number(erpData?.quantidade || item.quantity || 1)),
          valorUnitario: String(Number(erpData?.valorUnitario || item.unit_price || 0).toFixed(2)),
          observacoes: item.description || "",
          informacoesAdicionaisProduto: "",
          percentualAcrescimo: "0", percentualDesconto: "0",
          valorAcrescimo: "0", valorDesconto: "0",
          status: 1, idTipoMovimentacao: 60,
          dataEntrega: nomusFields.dataEntregaPadrao || fallbackDate,
        };
      }));

      const codigoPedido = nomusFields.pedido || claimNumber;

      const findNomusOrderId = async (codigo: string): Promise<number | null> => {
        try {
          const q = encodeURIComponent(`codigoPedido=="${codigo}"`);
          const r = await fetch(`/api/nomus/rest/pedidos?query=${q}`, {
            headers: { Accept: "application/json" },
          });
          if (!r.ok) return null;
          const list = await r.json();
          return Array.isArray(list) && list.length > 0 ? (list[0].id ?? null) : null;
        } catch { return null; }
      };

      let existingNomusId = (wc as any).nomus_order_id as number | null;

      const basePayload = {
        dataEmissao: nomusFields.dataEmissao || fallbackDate,
        idCondicaoPagamento: 28,
        idEmpresa: 2,
        idFormaPagamento: 10,
        idPessoaCliente,
        idTipoMovimentacao: 60,
        idTipoPedido: 1,
        observacoes: currentDefect || `Pedido de Garantia - ${nomusFields.cliente}`,
        observacoesInternas: `Gerado pelo Live Care - ${codigoPedido}`,
        itensPedido,
        ...(nomusFields.cfop ? { cfop: nomusFields.cfop } : {}),
      };

      let returnedNomusId: number | null = existingNomusId;
      let isUpdate = !!existingNomusId;

      const orderRes = await fetch(
        existingNomusId ? `/api/nomus/rest/pedidos/${existingNomusId}` : "/api/nomus/rest/pedidos",
        {
          method: existingNomusId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(existingNomusId ? basePayload : { codigoPedido, ...basePayload }),
        }
      );

      if (!orderRes.ok) {
        const errBody = await orderRes.json().catch(() => ({}));
        const isDuplicate = orderRes.status === 406 &&
          JSON.stringify(errBody).includes("nomeEClienteUnico");

        if (isDuplicate && !existingNomusId) {
          const foundId = await findNomusOrderId(codigoPedido);
          if (!foundId) throw new Error("Pedido já existe no Nomus mas não foi possível localizar o ID para atualizar.");
          existingNomusId = foundId;
          returnedNomusId = foundId;
          isUpdate = true;
          const retryRes = await fetch(`/api/nomus/rest/pedidos/${foundId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(basePayload),
          });
          if (!retryRes.ok) {
            const retryErr = await retryRes.text();
            throw new Error(`Erro Nomus ao atualizar [${retryRes.status}]: ${retryErr}`);
          }
          const retryData = await retryRes.json().catch(() => null);
          returnedNomusId = retryData?.id ?? retryData?.Id ?? foundId;
        } else {
          throw new Error(`Erro Nomus [${orderRes.status}]: ${JSON.stringify(errBody)}`);
        }
      } else {
        const orderData = await orderRes.json().catch(() => null);
        returnedNomusId = orderData?.id ?? orderData?.Id ?? existingNomusId;
      }

      await supabase.from("warranty_claims").update({
        warranty_status: "aprovada" as any,
        ...(returnedNomusId ? { nomus_order_id: returnedNomusId } : {}),
      }).eq("id", id!);

      toast.success(isUpdate ? "Pedido atualizado no ERP!" : "Pedido criado no ERP com sucesso!");
      qc.invalidateQueries({ queryKey: ["warranty_claim_detail", id] });
    } catch (err: any) {
      if (import.meta.env.DEV) console.error("Approve error:", err);
      toast.error(err.message || "Erro ao criar pedido no ERP");
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => {
          if (fromTicketId) navigate(`/crm?open_ticket=${fromTicketId}`);
          else navigate("/pedidos-garantia");
        }}><ArrowLeft className="h-4 w-4 mr-1" /> {fromTicketId ? "Voltar ao Card" : "Voltar"}</Button>
        <div className="flex-1">
          <h1 className="font-display font-bold text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> {claimNumber}
          </h1>
          <p className="text-xs text-muted-foreground">{clientName} • {modelName}{serialNumber ? ` • S/N ${serialNumber}` : ""}</p>
        </div>
        <StatusBadge status={warrantyStatusLabels[wc.warranty_status] || wc.warranty_status} />
        <ExportMenu onPdf={handleExportPdf} onExcel={handleExportExcel} onPrint={handlePrint} />
        {!editing ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleEnterEdit}>
              <Pencil className="h-3.5 w-3.5" /> Editar Itens
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Salvar
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={handleCancelEdit}>
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSaveAll} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Salvar Tudo
            </Button>
          </div>
        )}
      </div>

      {editing && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-2 mb-4 text-xs text-primary font-medium flex items-center gap-2">
          <Pencil className="h-3.5 w-3.5" /> Modo de edição ativo — altere os campos e clique em "Salvar Tudo"
        </div>
      )}

      {/* Client & Equipment info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-card rounded-xl border p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">Cliente</p>
          <p className="text-sm font-medium">{clientName}</p>
          {wc.tickets && <p className="text-xs text-muted-foreground mt-1">Chamado: {wc.tickets.ticket_number} — {wc.tickets.title}</p>}
        </div>
        <div className="bg-card rounded-xl border p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">Equipamento</p>
          <p className="text-sm font-medium">{modelName}</p>
          {serialNumber && <p className="text-xs text-muted-foreground mt-1">S/N: {serialNumber}</p>}
        </div>
      </div>

      {/* Orçamento de origem */}
      {linkedQuote && (
        <div className="bg-card rounded-xl border shadow-sm p-4 mb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Orçamento de Origem</p>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => navigate(`/orcamentos/${linkedQuote.id}`)}>
              <ExternalLink className="h-3.5 w-3.5" /> {linkedQuote.quote_number}
            </Button>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Status do Orçamento</label>
              <Select
                value={linkedQuote.status}
                onValueChange={async (val) => {
                  await supabase.from("quotes").update({ status: val }).eq("id", linkedQuote.id);
                  qc.invalidateQueries({ queryKey: ["pg_linked_quote", id] });
                  qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
                }}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aguardando_aprovacao">Em Análise</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="reprovado">Reprovado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total</p>
              <p className="text-lg font-bold font-mono text-primary">R$ {Number(linkedQuote.total || 0).toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Financial summary cards */}
      {linkedQuote && (
        <>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
            {[
              { label: "Peças", value: `R$ ${totals.subtotalPecas.toFixed(2)}` },
              { label: "Serviços", value: `R$ ${totals.subtotalServicos.toFixed(2)}` },
              { label: "Frete", value: `R$ ${totals.frete.toFixed(2)}` },
              { label: "Desconto", value: `- R$ ${totals.desconto.toFixed(2)}` },
              { label: "Garantia", value: `R$ ${totals.warranty.toFixed(2)}`, accent: true },
              { label: "Margem", value: `${totals.margin.toFixed(1)}%` },
            ].map((c) => (
              <div key={c.label} className={`bg-card rounded-xl border p-3 ${c.accent ? "border-success/30 bg-success/5" : ""}`}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
                <p className="text-sm font-bold font-mono mt-1">{c.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-6 flex items-center justify-between">
            <span className="text-sm font-semibold">Total Cobrado do Cliente</span>
            <span className="text-2xl font-bold font-mono text-primary">R$ {totals.charged.toFixed(2)}</span>
          </div>
        </>
      )}

      {/* Add items buttons */}
      {linkedQuote && (
        <div className="flex gap-2 mb-4">
          <Button size="sm" className="gap-1.5" variant={searchMode === "peca" ? "default" : "outline"} onClick={() => { setEditing(true); setSearchMode(searchMode === "peca" ? null : "peca"); setShowNewServiceForm(false); }}>
            <Package className="h-3.5 w-3.5" /> Adicionar Peça
          </Button>
          <Button size="sm" className="gap-1.5" variant={searchMode === "servico" ? "default" : "outline"} onClick={() => { setEditing(true); setSearchMode(searchMode === "servico" ? null : "servico"); setShowNewServiceForm(false); }}>
            <Wrench className="h-3.5 w-3.5" /> Adicionar Serviço
          </Button>
        </div>
      )}

      {/* Product search */}
      {editing && searchMode && linkedQuote && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 space-y-3">
          <ProductSearch
            modelFilter={modelName}
            onSelect={handleProductSelect}
            itemTypes={searchMode === "peca" ? partTypes : serviceTypes}
            showNomusStock={searchMode === "peca"}
          />
          {searchMode === "servico" && (
            <div className="space-y-3">
              {!showNewServiceForm ? (
                <Button variant="outline" size="sm" className="gap-1.5 w-full border-dashed" onClick={() => setShowNewServiceForm(true)}>
                  <Plus className="h-3.5 w-3.5" /> Criar novo serviço manualmente
                </Button>
              ) : (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold flex items-center gap-2"><Wrench className="h-4 w-4 text-primary" /> Novo Serviço</p>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowNewServiceForm(false)}>Cancelar</Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nome do serviço *</Label>
                      <Input placeholder="Ex: Mão de obra técnica..." value={newService.name} onChange={(e) => setNewService(s => ({ ...s, name: e.target.value }))} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Custo (R$) *</Label>
                      <Input type="number" step="0.01" placeholder="0.00" value={newService.cost} onChange={(e) => setNewService(s => ({ ...s, cost: e.target.value }))} className="mt-1 font-mono" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tipo</Label>
                      <Select value={newService.itemType} onValueChange={(v) => setNewService(s => ({ ...s, itemType: v }))}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {serviceTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Descrição (opcional)</Label>
                    <Input placeholder="Detalhes do serviço..." value={newService.description} onChange={(e) => setNewService(s => ({ ...s, description: e.target.value }))} className="mt-1" />
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" className="gap-1.5" disabled={!newService.name.trim() || !newService.cost || createProduct.isPending}
                      onClick={async () => {
                        const costNum = Number(newService.cost);
                        const code = `SRV-${Date.now().toString(36).toUpperCase()}`;
                        const product = await createProduct.mutateAsync({
                          name: newService.name.trim(), code, base_cost: costNum,
                          description: newService.description || null,
                          category: "servico", product_type: "servico", margin_percent: 30,
                        });
                        const isWarranty = newService.itemType.includes("garantia");
                        const price = isWarranty ? 0 : costNum * 1.3;
                        await addItem.mutateAsync({
                          quote_id: linkedQuote.id, product_id: product.id,
                          description: newService.name.trim(), item_type: newService.itemType,
                          quantity: 1, unit_cost: costNum, unit_price: price,
                        });
                        toast.success(`Serviço "${newService.name}" criado e adicionado`);
                        setNewService({ name: "", description: "", cost: "", itemType: "servico_garantia" });
                        setShowNewServiceForm(false);
                        qc.invalidateQueries({ queryKey: ["pg_linked_quote", id] });
                      }}>
                      <Plus className="h-3.5 w-3.5" /> {createProduct.isPending ? "Criando..." : "Criar e Adicionar"}
                    </Button>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Suggested parts */}
      {linkedQuote && (
        <SuggestedParts modelId={equipModelId} modelName={modelName} onSelect={handleProductSelect} />
      )}

      {/* Items table */}
      {linkedQuote && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-sm overflow-hidden mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/50">
            <h3 className="font-display font-semibold text-sm">Itens do Pedido ({items.length})</h3>
            {linkedQuote && <Badge variant="outline" className="text-[10px]">Origem: {linkedQuote.quote_number}</Badge>}
          </div>
          {items.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Nenhum item adicionado. Use os botões acima para adicionar peças ou serviços.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {["Código", "Descrição", "Tipo", "Qtd", "Preço Unit.", "Subtotal"].map((h) => (
                      <th key={h} className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-3 py-2">{h}</th>
                    ))}
                    <th className="px-3 py-2 w-px" />
                    {editing && <th className="px-3 py-2 w-px" />}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: any) => {
                    const isWarranty = String(item.item_type).includes("garantia");
                    const ed = editableItems[item.id];
                    const qty = editing && ed ? Number(ed.quantity) : item.quantity;
                    const price = editing && ed ? Number(ed.unit_price) : Number(item.unit_price);
                    return (
                      <tr key={item.id} className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${isWarranty ? "bg-success/5" : ""}`}>
                        <td className="px-3 py-2.5 text-xs font-mono">{item.products?.code || "—"}</td>
                        <td className="px-3 py-2.5 text-xs">
                          {editing ? (
                            <Input
                              value={ed?.description ?? item.description}
                              onChange={e => updateEditableItem(item.id, "description", e.target.value)}
                              className="h-7 text-xs"
                            />
                          ) : item.description}
                        </td>
                        <td className="px-3 py-2.5"><StatusBadge status={itemTypeLabels[item.item_type] || item.item_type} /></td>
                        <td className="px-3 py-2.5 text-xs font-mono">
                          {editing ? (
                            <Input
                              type="number"
                              value={ed?.quantity ?? String(item.quantity)}
                              onChange={e => updateEditableItem(item.id, "quantity", e.target.value)}
                              className="h-7 text-xs font-mono w-16"
                            />
                          ) : qty}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono">
                          {isWarranty ? (
                            <span className="text-success">Garantia</span>
                          ) : editing ? (
                            <Input
                              type="number"
                              step="0.01"
                              value={ed?.unit_price ?? Number(item.unit_price).toFixed(2)}
                              onChange={e => updateEditableItem(item.id, "unit_price", e.target.value)}
                              className="h-7 text-xs font-mono w-24"
                            />
                          ) : `R$ ${price.toFixed(2)}`}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono font-medium">
                          {isWarranty ? <span className="text-success">Coberto</span> : `R$ ${(qty * price).toFixed(2)}`}
                        </td>
                        <td className="px-2 py-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-1.5 text-[10px] gap-1 text-orange-500 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                            title="Gerar Ordem de Produção"
                            onClick={async () => {
                              const name = item.description || item.products?.name || item.products?.code || "item";
                              const ok = await notifySquad({ recordType: "pg", recordId: id!, reference: claimNumber, message: `Produzir/Comprar: ${name}` });
                              if (ok) toast.success("Ordem enviada ao Squad!");
                            }}
                          >
                            <Factory className="h-3 w-3" />
                            OP
                          </Button>
                        </td>
                        {editing && (
                          <td className="px-3 py-2.5">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteItem(item.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {/* Editable PG-specific fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Descrição do Defeito</label>
          <Textarea value={currentDefect} onChange={(e) => setDefect(e.target.value)} placeholder="Descreva o defeito..." rows={3} />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Análise Técnica</label>
          <Textarea value={currentAnalysis} onChange={(e) => setAnalysis(e.target.value)} placeholder="Análise técnica..." rows={3} />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Peças Cobertas</label>
          <Textarea value={currentParts} onChange={(e) => setParts(e.target.value)} placeholder="Peças cobertas pela garantia..." rows={2} />
        </div>
        <div className="md:col-span-2 bg-card rounded-xl border p-4 space-y-2">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">
            Observações Squad
          </label>
          <Textarea
            value={currentSquadNotes}
            onChange={(e) => setSquadNotes(e.target.value)}
            placeholder="Informações adicionais enviadas ao Squad junto com este PG..."
            rows={4}
          />
          <div className="flex justify-end pt-1">
            <Button size="sm" className="gap-1.5" onClick={handleSaveSquadNotes} disabled={savingSquad}>
              {savingSquad ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {savingSquad ? "Enviando..." : "Salvar e Enviar ao Squad"}
            </Button>
          </div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Custo Interno (R$)</label>
          <input
            type="number"
            step="0.01"
            value={currentCost}
            onChange={(e) => setCostVal(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
          />
        </div>
      </div>

      {/* Status change */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Status do PG</label>
          <Select value={wc.warranty_status} onValueChange={handleStatusChange}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="em_analise">Em Análise</SelectItem>
              <SelectItem value="aprovada">Aprovado</SelectItem>
              <SelectItem value="reprovada">Reprovado</SelectItem>
              <SelectItem value="convertida_os">Convertida em OS</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Nomus ERP Integration Form */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-sm overflow-hidden mb-6">
        <div className="px-4 py-3 border-b bg-muted/50">
          <h3 className="font-display font-semibold text-sm flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" /> Dados para Criação no ERP Nomus
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">Preencha os campos abaixo para criar o pedido de venda no Nomus</p>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Pedido</Label>
              <Input value={nomusFields.pedido} onChange={e => updateNomusField("pedido", e.target.value)} placeholder="Número do pedido" className="mt-1 h-9 text-xs font-mono" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Empresa</Label>
              <Select value={nomusFields.empresa} onValueChange={v => updateNomusField("empresa", v)}>
                <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TS">TS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="relative">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Cliente (ERP Nomus){nomusClientId ? <span className="ml-2 text-success font-normal">✓ ID {nomusClientId}</span> : null}
              </Label>
              <div className="relative mt-1">
                <Input
                  value={nomusFields.cliente}
                  onChange={e => searchNomusClients(e.target.value)}
                  onBlur={() => setTimeout(() => setNomusClientOpen(false), 200)}
                  placeholder="Digite o nome para buscar..."
                  className="h-9 text-xs pr-7"
                />
                {nomusClientLoading && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              {nomusClientOpen && nomusClientResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                  {nomusClientResults.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => selectNomusClient(c)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors"
                    >
                      <span className="font-medium">{c.nome}</span>
                      <span className="ml-2 text-muted-foreground">#{c.id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Tipo de Movimentação</Label>
              <Select value={nomusFields.tipoMovimentacao} onValueChange={v => updateNomusField("tipoMovimentacao", v)}>
                <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VENDAS DE MERCADORIAS">VENDAS DE MERCADORIAS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Data de Emissão</Label>
              <div className="flex gap-1 mt-1">
                <Input placeholder="dd/MM/yyyy" value={nomusFields.dataEmissao} onChange={e => updateNomusField("dataEmissao", e.target.value)} className="h-9 text-xs font-mono flex-1" />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"><CalendarIcon className="h-4 w-4" /></Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar mode="single" className={cn("p-3 pointer-events-auto")} selected={(() => { const d = parse(nomusFields.dataEmissao, "dd/MM/yyyy", new Date()); return isValid(d) ? d : undefined; })()} onSelect={(d) => d && updateNomusField("dataEmissao", format(d, "dd/MM/yyyy"))} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Data de Entrega Padrão</Label>
              <div className="flex gap-1 mt-1">
                <Input placeholder="dd/MM/yyyy" value={nomusFields.dataEntregaPadrao} onChange={e => updateNomusField("dataEntregaPadrao", e.target.value)} className="h-9 text-xs font-mono flex-1" />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"><CalendarIcon className="h-4 w-4" /></Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar mode="single" className={cn("p-3 pointer-events-auto")} selected={(() => { const d = parse(nomusFields.dataEntregaPadrao, "dd/MM/yyyy", new Date()); return isValid(d) ? d : undefined; })()} onSelect={(d) => d && updateNomusField("dataEntregaPadrao", format(d, "dd/MM/yyyy"))} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">CFOP</Label>
              <Input placeholder="Ex: 5102" value={nomusFields.cfop} onChange={e => updateNomusField("cfop", e.target.value)} className="mt-1 h-9 text-xs font-mono" />
            </div>
          </div>

          {items.length > 0 && (
            <div className="border-t pt-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">Itens do Pedido (Dados ERP)</p>
              <div className="space-y-3">
                {items.map((item: any, idx: number) => {
                  const erpData = itemErpData[item.id] || { produto: "", quantidade: "1", valorUnitario: "0" };
                  return (
                    <div key={item.id} className="bg-muted/30 rounded-lg p-3 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                      <div className="md:col-span-1">
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Item {idx + 1} - Produto</Label>
                        <Input
                          value={erpData.produto}
                          onChange={e => updateItemErp(item.id, "produto", e.target.value)}
                          placeholder="Código do produto"
                          className="mt-1 h-8 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Quantidade</Label>
                        <Input
                          type="number"
                          value={erpData.quantidade}
                          onChange={e => updateItemErp(item.id, "quantidade", e.target.value)}
                          className="mt-1 h-8 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Valor Unitário (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={erpData.valorUnitario}
                          onChange={e => updateItemErp(item.id, "valorUnitario", e.target.value)}
                          className="mt-1 h-8 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="px-4 pb-4">
          <Button className="gap-1.5 w-full md:w-auto" onClick={handleApprove} disabled={approving}>
            {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {approving
              ? ((wc as any).nomus_order_id ? "Atualizando no ERP..." : "Criando no ERP...")
              : ((wc as any).nomus_order_id ? "Atualizar Pedido no Nomus" : "Criar Pedido no Nomus")}
          </Button>
        </div>
      </motion.div>

      {/* Actions bar */}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
          if (fromTicketId) navigate(`/crm?open_ticket=${fromTicketId}`);
          else navigate("/pedidos-garantia");
        }}>
          <ArrowLeft className="h-3.5 w-3.5" /> {fromTicketId ? "Voltar ao Card" : "Voltar para Pedidos de Garantia"}
        </Button>
      </div>
    </div>
  );
};

export default PGDetailPage;
