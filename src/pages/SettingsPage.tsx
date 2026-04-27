import { useState } from "react";
import { Settings, Users, Bell, Database, Mail, Shield, DollarSign, FlaskConical, Save, Brain, UserPlus, Trash2, Pencil, KeyRound, Link, MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { WhatsAppInstancesSettings } from "@/components/settings/WhatsAppInstancesSettings";

function useSystemSettings() {
  return useQuery({
    queryKey: ["system_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("system_settings").select("*").order("category");
      if (error) throw error;
      return data;
    },
  });
}

function useUpdateSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const { error } = await supabase
        .from("system_settings")
        .update({ value: JSON.stringify(value) })
        .eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["system_settings"] }),
  });
}

const roleDescriptions: Record<string, { label: string; access: string }> = {
  admin: { label: "Administrador", access: "Acesso total ao sistema. Pode gerenciar usuários, perfis, configurações e todos os módulos." },
  atendimento: { label: "Atendimento / Suporte", access: "Clientes, chamados, assistência, garantias. Pode abrir tickets e acompanhar atendimentos." },
  tecnico: { label: "Técnico", access: "Ordens de serviço, histórico técnico, manutenção preventiva. Pode registrar diagnóstico e peças." },
  engenharia: { label: "Engenharia", access: "Dashboards, analytics, relatórios técnicos. Acesso a análises de falhas e tendências." },
  financeiro: { label: "Financeiro / Administrativo", access: "Produtos, custos, preços, impostos, relatórios de custo de garantia." },
  cliente: { label: "Cliente", access: "Portal do cliente. Visualiza seus equipamentos, chamados, garantias e manutenções." },
};

const statusSections = [
  { title: "Status de Chamados", items: ["Aberto", "Em análise", "Aguardando informações", "Aguardando peça", "Agendado", "Em atendimento", "Aprovado", "Reprovado", "Resolvido", "Fechado"] },
  { title: "Status de Garantia", items: ["Em análise", "Aprovada", "Reprovada", "Convertida em OS"] },
  { title: "Status de Assistência", items: ["Aberto", "Orçamento enviado", "Agendado", "Em andamento", "Resolvido", "Cancelado"] },
  { title: "Status de Ordens de Serviço", items: ["Aberta", "Agendada", "Em andamento", "Concluída", "Cancelada"] },
];

const SettingsPage = () => {
  const { data: settings, isLoading } = useSystemSettings();
  const updateSetting = useUpdateSetting();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  const getSetting = (key: string): string => {
    const s = settings?.find((s) => s.key === key);
    if (!s) return "";
    try {
      const parsed = JSON.parse(String(s.value));
      return String(parsed);
    } catch {
      return String(s.value);
    }
  };

  const getSettingsByCategory = (category: string) => {
    return settings?.filter((s) => s.category === category) || [];
  };

  const handleSave = async (key: string, value: string) => {
    try {
      await updateSetting.mutateAsync({ key, value });
      toast.success("Configuração salva!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    }
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Configurações" description="Ajustes do sistema Live Care" icon={Settings} />
        <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Configurações" description="Ajustes do sistema Live Care" icon={Settings} />

      <Tabs defaultValue="geral" className="space-y-4">
        <TabsList className="bg-muted/50 p-1 gap-1">
          <TabsTrigger value="geral" className="text-xs gap-1.5"><Database className="h-3.5 w-3.5" /> Geral</TabsTrigger>
          <TabsTrigger value="perfis" className="text-xs gap-1.5"><Shield className="h-3.5 w-3.5" /> Perfis</TabsTrigger>
          <TabsTrigger value="status" className="text-xs gap-1.5"><Settings className="h-3.5 w-3.5" /> Status</TabsTrigger>
          <TabsTrigger value="precificacao" className="text-xs gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Precificação</TabsTrigger>
          <TabsTrigger value="manutencao" className="text-xs gap-1.5"><Bell className="h-3.5 w-3.5" /> Manutenção</TabsTrigger>
          <TabsTrigger value="templates" className="text-xs gap-1.5"><Mail className="h-3.5 w-3.5" /> Templates</TabsTrigger>
          <TabsTrigger value="engenharia" className="text-xs gap-1.5"><FlaskConical className="h-3.5 w-3.5" /> Engenharia</TabsTrigger>
<TabsTrigger value="ia" className="text-xs gap-1.5"><Brain className="h-3.5 w-3.5" /> IA</TabsTrigger>
          <TabsTrigger value="nomus" className="text-xs gap-1.5"><Link className="h-3.5 w-3.5" /> Nomus ERP</TabsTrigger>
          {isAdmin && <TabsTrigger value="whatsapp" className="text-xs gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> WhatsApp</TabsTrigger>}
          {isAdmin && <TabsTrigger value="usuarios" className="text-xs gap-1.5"><Users className="h-3.5 w-3.5" /> Usuários</TabsTrigger>}
        </TabsList>

        {/* GERAL */}
        <TabsContent value="geral">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-6">
            <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" /> Configurações Gerais
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {getSettingsByCategory("geral").map((s) => (
                <SettingField key={s.key} settingKey={s.key} label={s.label} value={getSetting(s.key)} onSave={handleSave} disabled={!isAdmin} />
              ))}
            </div>
          </motion.div>
        </TabsContent>

        {/* PERFIS */}
        <TabsContent value="perfis">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-6">
            <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Perfis e Permissões
            </h3>
            <div className="space-y-3">
              {Object.entries(roleDescriptions).map(([role, desc]) => (
                <div key={role} className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] uppercase tracking-wider font-medium bg-primary/10 text-primary px-2 py-0.5 rounded">{role}</span>
                    <span className="text-sm font-medium">{desc.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">{desc.access}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </TabsContent>

        {/* STATUS */}
        <TabsContent value="status">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-6">
            <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
              <Settings className="h-4 w-4 text-primary" /> Status do Sistema
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {statusSections.map((section) => (
                <div key={section.title}>
                  <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">{section.title}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {section.items.map((item) => (
                      <span key={item} className="text-xs bg-muted px-2.5 py-1 rounded-md">{item}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </TabsContent>

        {/* PRECIFICAÇÃO */}
        <TabsContent value="precificacao">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-6">
            <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" /> Parâmetros Padrão de Precificação
            </h3>
            <p className="text-xs text-muted-foreground mb-4">Estes valores serão sugeridos ao cadastrar novos produtos.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {getSettingsByCategory("precificacao").map((s) => (
                <SettingField key={s.key} settingKey={s.key} label={s.label} value={getSetting(s.key)} onSave={handleSave} disabled={!isAdmin} type="number" />
              ))}
            </div>
          </motion.div>
        </TabsContent>

        {/* MANUTENÇÃO */}
        <TabsContent value="manutencao">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-6">
            <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" /> Parâmetros de Manutenção e Alertas
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {getSettingsByCategory("manutencao").map((s) => (
                <SettingField key={s.key} settingKey={s.key} label={s.label} value={getSetting(s.key)} onSave={handleSave} disabled={!isAdmin} type="number" />
              ))}
            </div>
          </motion.div>
        </TabsContent>

        {/* TEMPLATES */}
        <TabsContent value="templates">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-6">
            <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" /> Templates de Comunicação
            </h3>
            <p className="text-xs text-muted-foreground mb-4">Edite as mensagens enviadas automaticamente para clientes.</p>
            <div className="space-y-4">
              {getSettingsByCategory("templates").map((s) => (
                <SettingTextarea key={s.key} settingKey={s.key} label={s.label} value={getSetting(s.key)} onSave={handleSave} disabled={!isAdmin} />
              ))}
            </div>
          </motion.div>
        </TabsContent>

        {/* ENGENHARIA */}
        <TabsContent value="engenharia">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-6">
            <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" /> Parâmetros de Engenharia
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {getSettingsByCategory("engenharia").map((s) => (
                <SettingField key={s.key} settingKey={s.key} label={s.label} value={getSetting(s.key)} onSave={handleSave} disabled={!isAdmin} type="number" />
              ))}
            </div>
          </motion.div>
        </TabsContent>

        {/* IA */}
        <TabsContent value="ia">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-6">
            <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" /> Inteligência Artificial
            </h3>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                <p className="text-sm font-medium text-primary mb-1">IA Integrada</p>
                <p className="text-xs text-muted-foreground">
                  O Live Care utiliza IA integrada para triagem automática de chamados via WhatsApp e geração de relatórios operacionais.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Funcionalidades Ativas</p>
                  <ul className="space-y-1.5 text-sm">
                    <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Triagem automática via WhatsApp/ManyChat</li>
                    <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Relatórios operacionais diários</li>
                    <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Análise de hipóteses técnicas</li>
                    <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Sugestão de peças e próximos passos</li>
                  </ul>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Endpoint ManyChat</p>
                  <p className="text-xs text-muted-foreground mb-2">Configure este URL no ManyChat para receber dados de triagem:</p>
                  <code className="text-xs bg-background px-2 py-1 rounded border block break-all">
                    POST {import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-intake
                  </code>
                  <p className="text-xs text-muted-foreground mt-2">Payload: nome_cliente, telefone, mensagem, equipamento_informado, numero_serie</p>
                </div>
              </div>
            </div>
          </motion.div>
        </TabsContent>
        <TabsContent value="nomus">
          <NomusIdCache />
        </TabsContent>
        {/* WHATSAPP */}
        {isAdmin && (
          <TabsContent value="whatsapp">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-6">
              <WhatsAppInstancesSettings />
            </motion.div>
          </TabsContent>
        )}

        {/* USUÁRIOS */}
        {isAdmin && (
          <TabsContent value="usuarios">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-6">
              <h3 className="font-display font-semibold text-sm mb-6 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Gerenciamento de Usuários
              </h3>
              <UserManagement />
            </motion.div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

type UserRow = { user_id: string; full_name: string; email: string | null; roles: string[] };

const APP_ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "atendimento", label: "Atendimento / Suporte" },
  { value: "tecnico", label: "Técnico" },
  { value: "engenharia", label: "Engenharia" },
  { value: "financeiro", label: "Financeiro / Administrativo" },
  { value: "cliente", label: "Cliente" },
];

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`;

async function callEdge(method: string, body?: object) {
  const { data, error } = await (supabase.functions as any).invoke("manage-users", {
    method,
    body,
  });
  if (error) throw new Error(error.message ?? "Erro desconhecido");
  return data;
}

function UserManagement() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "atendimento" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<"role" | "password" | "info">("role");
  const [editRole, setEditRole] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  // Query direta ao Supabase — evita o mismatch de IDs no edge function GET
  const { data: users = [], isLoading } = useQuery<UserRow[]>({
    queryKey: ["manage_users"],
    queryFn: async () => {
      const [{ data: profiles }, { data: rolesData }] = await Promise.all([
        (supabase as any).from("profiles").select("user_id, full_name, email").order("full_name"),
        (supabase as any).from("user_roles").select("user_id, role"),
      ]);
      const rolesMap: Record<string, string[]> = {};
      for (const r of rolesData ?? []) {
        if (!rolesMap[r.user_id]) rolesMap[r.user_id] = [];
        rolesMap[r.user_id].push(r.role);
      }
      return (profiles ?? []).map((p: any) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email,
        roles: rolesMap[p.user_id] ?? [],
      })) as UserRow[];
    },
  });

  const createMut = useMutation({
    mutationFn: () => callEdge("POST", form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manage_users"] });
      setForm({ full_name: "", email: "", password: "", role: "atendimento" });
      toast.success("Usuário criado com sucesso!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (payload: { user_id: string; role?: string; password?: string; full_name?: string; email?: string }) =>
      callEdge("PATCH", payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["manage_users"] });
      qc.invalidateQueries({ queryKey: ["all-users"] });
      setEditingId(null);
      setEditPassword("");
      if (vars.password) toast.success("Senha alterada!");
      else if (vars.full_name || vars.email) toast.success("Dados atualizados!");
      else toast.success("Perfil atualizado!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (user_id: string) => callEdge("DELETE", { user_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manage_users"] });
      qc.invalidateQueries({ queryKey: ["all-users"] });
      toast.success("Usuário removido.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {/* Form de criação */}
      <div className="border rounded-lg p-4 bg-muted/30">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Novo Usuário</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Nome completo</Label>
            <Input
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              placeholder="João Silva"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">E-mail</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="joao@empresa.com"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Senha</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Mínimo 6 caracteres"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Perfil</Label>
            <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APP_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value} className="text-sm">{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          size="sm"
          className="mt-3 gap-1.5 text-xs"
          onClick={() => createMut.mutate()}
          disabled={!form.full_name || !form.email || !form.password || createMut.isPending}
        >
          <UserPlus className="h-3.5 w-3.5" />
          {createMut.isPending ? "Criando..." : "Criar Usuário"}
        </Button>
      </div>

      {/* Lista de usuários */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Usuários Cadastrados</p>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.user_id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                {editingId === u.user_id ? (
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {editMode === "info" ? (
                      <>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Nome completo"
                          className="h-7 w-36 text-xs"
                        />
                        <Input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          placeholder="E-mail"
                          className="h-7 w-40 text-xs"
                        />
                      </>
                    ) : editMode === "role" ? (
                      <Select value={editRole} onValueChange={setEditRole}>
                        <SelectTrigger className="h-7 w-44 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {APP_ROLES.map((r) => (
                            <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type="password"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        placeholder="Nova senha (mín. 6)"
                        className="h-7 w-44 text-xs"
                      />
                    )}
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        if (editMode === "info") updateMut.mutate({ user_id: u.user_id, full_name: editName || undefined, email: editEmail || undefined });
                        else if (editMode === "role") updateMut.mutate({ user_id: u.user_id, role: editRole });
                        else updateMut.mutate({ user_id: u.user_id, password: editPassword });
                      }}
                      disabled={updateMut.isPending || (editMode === "password" && editPassword.length < 6)}
                    >
                      Salvar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingId(null); setEditPassword(""); }}>
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1 flex-wrap justify-end">
                      {u.roles.map((r) => (
                        <span key={r} className="text-[10px] uppercase tracking-wider font-medium bg-primary/10 text-primary px-2 py-0.5 rounded">
                          {APP_ROLES.find((x) => x.value === r)?.label ?? r}
                        </span>
                      ))}
                      {u.roles.length === 0 && (
                        <span className="text-[10px] text-muted-foreground">Sem perfil</span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Editar nome e e-mail"
                      onClick={() => { setEditingId(u.user_id); setEditMode("info"); setEditName(u.full_name); setEditEmail(u.email ?? ""); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Alterar perfil"
                      onClick={() => { setEditingId(u.user_id); setEditMode("role"); setEditRole(u.roles[0] ?? "atendimento"); }}
                    >
                      <Shield className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Alterar senha"
                      onClick={() => { setEditingId(u.user_id); setEditMode("password"); setEditPassword(""); }}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                    </Button>
                    {u.user_id !== me?.id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        title="Excluir usuário"
                        onClick={() => {
                          if (confirm(`Remover ${u.full_name}?`)) deleteMut.mutate(u.user_id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Reusable setting field component
function SettingField({ settingKey, label, value, onSave, disabled, type = "text" }: {
  settingKey: string; label: string; value: string; onSave: (key: string, value: string) => void; disabled: boolean; type?: string;
}) {
  const [localValue, setLocalValue] = useState(value);
  const changed = localValue !== value;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input
          type={type}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          disabled={disabled}
          step={type === "number" ? "any" : undefined}
          className="flex-1"
        />
        {changed && !disabled && (
          <Button size="sm" className="gap-1 h-9 text-xs" onClick={() => onSave(settingKey, localValue)}>
            <Save className="h-3 w-3" /> Salvar
          </Button>
        )}
      </div>
    </div>
  );
}

function SettingTextarea({ settingKey, label, value, onSave, disabled }: {
  settingKey: string; label: string; value: string; onSave: (key: string, value: string) => void; disabled: boolean;
}) {
  const [localValue, setLocalValue] = useState(value);
  const changed = localValue !== value;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Textarea value={localValue} onChange={(e) => setLocalValue(e.target.value)} disabled={disabled} rows={3} />
      {changed && !disabled && (
        <Button size="sm" className="gap-1 text-xs" onClick={() => onSave(settingKey, localValue)}>
          <Save className="h-3 w-3" /> Salvar
        </Button>
      )}
    </div>
  );
}

function NomusIdCache() {
  const qc = useQueryClient();
  const [type, setType] = useState<"cliente" | "produto">("cliente");
  const [key, setKey] = useState("");
  const [nomusId, setNomusId] = useState("");

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["nomus_id_cache"],
    queryFn: async () => {
      const { data } = await supabase.from("nomus_id_cache").select("*").order("entity_type").order("entity_key");
      return data || [];
    },
  });

  const save = async () => {
    if (!key.trim() || !nomusId) { toast.error("Preencha nome/código e ID Nomus"); return; }
    const { error } = await supabase.from("nomus_id_cache").upsert({ entity_type: type, entity_key: key.trim(), nomus_id: Number(nomusId) }, { onConflict: "entity_type,entity_key" });
    if (error) { toast.error("Erro ao salvar"); return; }
    toast.success("ID Nomus cadastrado!");
    setKey(""); setNomusId("");
    qc.invalidateQueries({ queryKey: ["nomus_id_cache"] });
  };

  const remove = async (id: string) => {
    await supabase.from("nomus_id_cache").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["nomus_id_cache"] });
  };

  const clientes = entries.filter((e: any) => e.entity_type === "cliente");
  const produtos = entries.filter((e: any) => e.entity_type === "produto");

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-6 space-y-6">
      <h3 className="font-display font-semibold text-sm flex items-center gap-2"><Link className="h-4 w-4 text-primary" /> IDs Nomus ERP</h3>
      <p className="text-xs text-muted-foreground">Cadastre aqui os IDs numéricos do Nomus para clientes e produtos. Eles são usados automaticamente ao criar pedidos.</p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end border rounded-lg p-4 bg-muted/30">
        <div>
          <Label className="text-xs">Tipo</Label>
          <Select value={type} onValueChange={(v) => setType(v as any)}>
            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cliente">Cliente</SelectItem>
              <SelectItem value="produto">Produto</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">{type === "cliente" ? "Nome do Cliente (igual no sistema)" : "Código do Produto"}</Label>
          <Input value={key} onChange={e => setKey(e.target.value)} placeholder={type === "cliente" ? "Ex: STUDIO PILATES RAFAELA..." : "Ex: MOP.V12.131"} className="mt-1 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs">ID Nomus</Label>
          <div className="flex gap-2 mt-1">
            <Input value={nomusId} onChange={e => setNomusId(e.target.value)} type="number" placeholder="Ex: 2509" className="h-8 text-xs font-mono" />
            <Button size="sm" onClick={save} className="h-8 px-3"><Save className="h-3 w-3" /></Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[{ label: "Clientes", data: clientes }, { label: "Produtos", data: produtos }].map(({ label, data }) => (
          <div key={label}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
            {isLoading ? <p className="text-xs text-muted-foreground">Carregando...</p> : data.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhum cadastrado</p>
            ) : (
              <div className="space-y-1">
                {data.map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between px-3 py-1.5 rounded bg-muted/40 text-xs">
                    <span className="truncate flex-1">{e.entity_key}</span>
                    <span className="font-mono text-primary ml-3 shrink-0">ID: {e.nomus_id}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 ml-2 shrink-0" onClick={() => remove(e.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default SettingsPage;
