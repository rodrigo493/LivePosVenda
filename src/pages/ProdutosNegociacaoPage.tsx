import { useState } from "react";
import { ShoppingBag, Plus, Search, Pencil, Trash2, MoreVertical } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  useDealCatalogProducts,
  useCreateDealCatalogProduct,
  useUpdateDealCatalogProduct,
  useDeleteDealCatalogProduct,
  type DealCatalogProduct,
} from "@/hooks/useDealCatalogProducts";

// ─── Formulário de produto ────────────────────────────────────────────────────

interface ProductFormValues {
  name: string;
  description: string;
  base_price: string;
  visible: boolean;
}

const emptyForm = (): ProductFormValues => ({
  name: "",
  description: "",
  base_price: "",
  visible: true,
});

function ProductDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: ProductFormValues;
  onSubmit: (v: ProductFormValues) => Promise<void>;
  title: string;
}) {
  const [form, setForm] = useState<ProductFormValues>(initial);
  const [saving, setSaving] = useState(false);

  // sync form when dialog opens with new initial values
  const handleOpenChange = (v: boolean) => {
    if (v) setForm(initial);
    onOpenChange(v);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSubmit(form);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="pn-name">Nome *</Label>
            <Input
              id="pn-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nome do produto"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pn-desc">Descrição</Label>
            <Textarea
              id="pn-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Descrição opcional"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pn-price">Valor (R$) *</Label>
            <Input
              id="pn-price"
              type="number"
              min="0"
              step="0.01"
              value={form.base_price}
              onChange={(e) => setForm((f) => ({ ...f, base_price: e.target.value }))}
              placeholder="0,00"
              required
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="pn-visible"
              checked={form.visible}
              onCheckedChange={(v) => setForm((f) => ({ ...f, visible: v }))}
            />
            <Label htmlFor="pn-visible" className="cursor-pointer">
              Exibir na negociação
            </Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

const ProdutosNegociacaoPage = () => {
  const { data: products, isLoading } = useDealCatalogProducts();
  const createProduct = useCreateDealCatalogProduct();
  const updateProduct = useUpdateDealCatalogProduct();
  const deleteProduct = useDeleteDealCatalogProduct();

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<DealCatalogProduct | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = (products || []).filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.description?.toLowerCase().includes(q) ?? false);
  });

  const handleCreate = async (form: ProductFormValues) => {
    await createProduct.mutateAsync({
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      base_price: parseFloat(form.base_price) || 0,
      visible: form.visible,
    });
    toast.success("Produto criado com sucesso.");
  };

  const handleUpdate = async (form: ProductFormValues) => {
    if (!editing) return;
    await updateProduct.mutateAsync({
      id: editing.id,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      base_price: parseFloat(form.base_price) || 0,
      visible: form.visible,
    });
    setEditing(null);
    toast.success("Produto atualizado.");
  };

  const handleToggleVisible = async (product: DealCatalogProduct) => {
    await updateProduct.mutateAsync({ id: product.id, visible: !product.visible });
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await deleteProduct.mutateAsync(deletingId);
    setDeletingId(null);
    toast.success("Produto excluído.");
  };

  const editingForm = (): ProductFormValues =>
    editing
      ? {
          name: editing.name,
          description: editing.description || "",
          base_price: String(editing.base_price),
          visible: editing.visible,
        }
      : emptyForm();

  return (
    <div>
      <PageHeader
        title="Produtos para Negociação"
        description="Catálogo de produtos exibidos nas negociações do CRM"
        icon={ShoppingBag}
        action={
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Novo Produto
          </Button>
        }
      />

      {/* Busca */}
      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabela */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl border shadow-card overflow-hidden"
      >
        {isLoading ? (
          <div className="p-10 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground text-sm">
            Nenhum produto encontrado.{" "}
            <button className="text-primary underline" onClick={() => setCreateOpen(true)}>
              Criar primeiro produto
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/40">
                  {["Nome", "Descrição", "Valor", "Exibir na Negociação", ""].map((h) => (
                    <th
                      key={h}
                      className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-5 py-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => (
                  <tr
                    key={product.id}
                    className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    {/* Nome */}
                    <td className="px-5 py-4">
                      <button
                        className="text-sm font-medium text-primary hover:underline text-left"
                        onClick={() => setEditing(product)}
                      >
                        {product.name}
                      </button>
                    </td>

                    {/* Descrição */}
                    <td className="px-5 py-4 text-sm text-muted-foreground max-w-xs truncate">
                      {product.description || "—"}
                    </td>

                    {/* Valor */}
                    <td className="px-5 py-4 text-sm font-medium whitespace-nowrap">
                      R${" "}
                      {Number(product.base_price).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>

                    {/* Toggle */}
                    <td className="px-5 py-4">
                      <Switch
                        checked={product.visible}
                        onCheckedChange={() => handleToggleVisible(product)}
                        disabled={updateProduct.isPending}
                      />
                    </td>

                    {/* Ações */}
                    <td className="px-5 py-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditing(product)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeletingId(product.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Dialog: criar */}
      <ProductDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initial={emptyForm()}
        title="Novo Produto"
        onSubmit={handleCreate}
      />

      {/* Dialog: editar */}
      <ProductDialog
        open={!!editing}
        onOpenChange={(v) => { if (!v) setEditing(null); }}
        initial={editingForm()}
        title="Editar Produto"
        onSubmit={handleUpdate}
      />

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deletingId} onOpenChange={(v) => { if (!v) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O produto será removido do catálogo permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProdutosNegociacaoPage;
