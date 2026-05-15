// src/pages/FornecedoresPage.tsx
import { useState } from "react";
import { Building2, Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";

import { NomusPessoaSearch } from "@/components/compras/NomusPessoaSearch";
import {
  useSuppliers,
  useUpsertSupplier,
  useDeleteSupplier,
} from "@/hooks/useSuppliers";
import type { Supplier } from "@/types/purchaseOrder";

// ---------------------------------------------------------------------------
// Form state shape
// ---------------------------------------------------------------------------
interface FormState {
  nomus_pessoa_id: number | null;
  nome: string;
  email: string;
  telefone: string;
  contato: string;
  observacoes: string;
}

const EMPTY_FORM: FormState = {
  nomus_pessoa_id: null,
  nome: "",
  email: "",
  telefone: "",
  contato: "",
  observacoes: "",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function FornecedoresPage() {
  const { data: suppliers, isLoading } = useSuppliers();
  const upsertSupplier = useUpsertSupplier();
  const deleteSupplier = useDeleteSupplier();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  // Search filter
  const [search, setSearch] = useState("");

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function openCreate() {
    setEditingSupplier(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(supplier: Supplier) {
    setEditingSupplier(supplier);
    setForm({
      nomus_pessoa_id: supplier.nomus_pessoa_id,
      nome: supplier.nome,
      email: supplier.email ?? "",
      telefone: supplier.telefone ?? "",
      contato: supplier.contato ?? "",
      observacoes: supplier.observacoes ?? "",
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingSupplier(null);
    setForm(EMPTY_FORM);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------
  async function handleSave() {
    if (!form.nomus_pessoa_id || !form.nome.trim()) {
      toast.error("Selecione um fornecedor do Nomus antes de salvar.");
      return;
    }

    try {
      await upsertSupplier.mutateAsync({
        ...(editingSupplier ? { id: editingSupplier.id } : {}),
        nomus_pessoa_id: form.nomus_pessoa_id,
        nome: form.nome.trim(),
        email: form.email.trim() || null,
        telefone: form.telefone.trim() || null,
        contato: form.contato.trim() || null,
        observacoes: form.observacoes.trim() || null,
        ativo: true,
      });
      toast.success(editingSupplier ? "Fornecedor atualizado." : "Fornecedor adicionado.");
      closeDialog();
    } catch {
      toast.error("Erro ao salvar fornecedor.");
    }
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------
  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteSupplier.mutateAsync(deleteTarget.id);
      toast.success("Fornecedor removido.");
    } catch {
      toast.error("Erro ao remover fornecedor.");
    } finally {
      setDeleteTarget(null);
    }
  }

  // -------------------------------------------------------------------------
  // Filter
  // -------------------------------------------------------------------------
  const filtered = (suppliers ?? []).filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.nome.toLowerCase().includes(q) ||
      (s.email ?? "").toLowerCase().includes(q) ||
      (s.telefone ?? "").toLowerCase().includes(q) ||
      (s.contato ?? "").toLowerCase().includes(q)
    );
  });

  const isEditing = !!editingSupplier;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div>
      <PageHeader
        title="Fornecedores"
        description="Agenda de e-mails e contatos de fornecedores (vinculados ao Nomus)"
        icon={Building2}
        action={
          <Button size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> Adicionar fornecedor
          </Button>
        }
      />

      {/* Search */}
      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, e-mail, telefone, contato..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl border shadow-card overflow-hidden"
      >
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : !filtered.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {search.trim()
              ? "Nenhum fornecedor encontrado com esse filtro."
              : (
                <>
                  Nenhum fornecedor cadastrado.{" "}
                  <button className="text-primary underline" onClick={openCreate}>
                    Adicionar primeiro fornecedor
                  </button>
                </>
              )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  {["Nome", "E-mail", "Telefone", "Contato", "Ativo", ""].map((h) => (
                    <th
                      key={h}
                      className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium">{s.nome}</td>
                    <td className="px-4 py-3 text-sm">{s.email || "—"}</td>
                    <td className="px-4 py-3 text-sm font-mono">{s.telefone || "—"}</td>
                    <td className="px-4 py-3 text-sm">{s.contato || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={s.ativo ? "default" : "secondary"}
                        className={s.ativo ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200" : ""}
                      >
                        {s.ativo ? "Sim" : "Não"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title="Editar"
                          onClick={() => openEdit(s)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 border-destructive/30"
                          title="Excluir"
                          onClick={() => setDeleteTarget(s)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Editar fornecedor" : "Adicionar fornecedor"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Nomus search — read-only in edit mode */}
            <div className="space-y-1.5">
              <Label>Pessoa no Nomus <span className="text-destructive">*</span></Label>
              {isEditing ? (
                <Input value={form.nome} disabled className="bg-muted/50" />
              ) : (
                <NomusPessoaSearch
                  categoria="fornecedor"
                  value={form.nome || null}
                  onSelect={(p) => {
                    setField("nomus_pessoa_id", p.id);
                    setField("nome", p.nome);
                    if (p.email) setField("email", p.email);
                  }}
                  placeholder="Buscar fornecedor no Nomus..."
                />
              )}
              {!isEditing && (
                <p className="text-[11px] text-muted-foreground">Digite ao menos 2 letras para buscar</p>
              )}
            </div>

            {/* E-mail */}
            <div className="space-y-1.5">
              <Label htmlFor="supplier-email">E-mail</Label>
              <Input
                id="supplier-email"
                type="email"
                placeholder="fornecedor@empresa.com.br"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
              />
            </div>

            {/* Telefone */}
            <div className="space-y-1.5">
              <Label htmlFor="supplier-telefone">Telefone</Label>
              <Input
                id="supplier-telefone"
                type="tel"
                placeholder="(11) 99999-0000"
                value={form.telefone}
                onChange={(e) => setField("telefone", e.target.value)}
              />
            </div>

            {/* Contato */}
            <div className="space-y-1.5">
              <Label htmlFor="supplier-contato">Contato</Label>
              <Input
                id="supplier-contato"
                placeholder="Nome do contato responsável"
                value={form.contato}
                onChange={(e) => setField("contato", e.target.value)}
              />
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <Label htmlFor="supplier-obs">Observações</Label>
              <Textarea
                id="supplier-obs"
                placeholder="Informações adicionais..."
                rows={3}
                value={form.observacoes}
                onChange={(e) => setField("observacoes", e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={upsertSupplier.isPending}
            >
              {upsertSupplier.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover fornecedor</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{deleteTarget?.nome}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSupplier.isPending ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
