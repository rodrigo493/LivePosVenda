import { useState } from "react";
import { Settings, Users, Bell, Database, Mail, Shield, DollarSign, FlaskConical, Save, Brain, Kanban } from "lucide-react";
import { PipelineStageSettings } from "@/components/crm/PipelineStageSettings";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

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
          <TabsTrigger value="pipeline" className="text-xs gap-1.5"><Kanban className="h-3.5 w-3.5" /> Pipeline</TabsTrigger>
          <TabsTrigger value="ia" className="text-xs gap-1.5"><Brain className="h-3.5 w-3.5" /> IA</TabsTrigger>
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

        {/* PIPELINE */}
        <TabsContent value="pipeline">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-6">
            <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
              <Kanban className="h-4 w-4 text-primary" /> Configurações do Pipeline CRM
            </h3>
            <PipelineStageSettings disabled={!isAdmin} />
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
      </Tabs>
    </div>
  );
};

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

export default SettingsPage;
