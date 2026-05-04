import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/layout/PageHeader";
import { User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { WhatsAppQrConnect } from "@/components/profile/WhatsAppQrConnect";

const MANAGE_USERS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`;

async function callManageUsers(method: string, body?: object) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token ?? "";
  const res = await fetch(MANAGE_USERS_URL, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((payload as any).error ?? (payload as any).message ?? `Erro ${res.status}`);
  return payload;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  atendimento: "Atendimento / Suporte",
  tecnico: "Técnico",
  engenharia: "Engenharia",
  financeiro: "Financeiro / Administrativo",
  cliente: "Cliente",
};

const JOB_LABELS: Record<string, string> = {
  vendedor: "Vendedor",
  pre_vendedor: "Pré-vendedor",
  atendente_pos_venda: "Atendente de pós venda",
  atendente_assistencia: "Atendente de assistência técnica",
};

export default function ProfilePage() {
  const { user } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["my_profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase
          .from("profiles" as any)
          .select("full_name, email, job_functions")
          .eq("user_id", user!.id)
          .single(),
        supabase
          .from("user_roles" as any)
          .select("role")
          .eq("user_id", user!.id),
      ]);
      return {
        full_name: (p as any)?.full_name ?? user?.user_metadata?.full_name ?? "",
        email: (p as any)?.email ?? user?.email ?? "",
        job_functions: ((p as any)?.job_functions ?? []) as string[],
        roles: ((r ?? []) as any[]).map((x) => x.role as string),
      };
    },
  });

  const { data: instances } = useQuery({
    queryKey: ["my_whatsapp_instances", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("pipeline_whatsapp_instances" as any)
        .select("id, instance_name, phone_number, base_url")
        .eq("user_id", user!.id)
        .order("instance_name");
      return ((data as any[]) ?? []);
    },
  });

  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((n: string) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "?";

  const savePassword = async () => {
    if (newPassword.length < 6) { toast.error("Senha mínima de 6 caracteres"); return; }
    setSavingPwd(true);
    try {
      await callManageUsers("PATCH", { user_id: user!.id, password: newPassword });
      toast.success("Senha alterada com sucesso!");
      setNewPassword("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar senha");
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <div>
      <PageHeader title="Meu Perfil" description="Seus dados e configurações pessoais" icon={User} />

      <div className="max-w-2xl space-y-6">
        {/* Dados pessoais */}
        <div className="bg-card rounded-xl border shadow-card p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
              <span className="text-lg font-semibold text-orange-400">{initials}</span>
            </div>
            <div>
              <p className="text-base font-semibold">{profile?.full_name}</p>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
            </div>
          </div>

          {profile && profile.roles.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                Perfis
              </p>
              <div className="flex flex-wrap gap-1.5">
                {profile.roles.map((r) => (
                  <span
                    key={r}
                    className="text-[10px] uppercase tracking-wider font-medium bg-primary/10 text-primary px-2 py-0.5 rounded"
                  >
                    {ROLE_LABELS[r] ?? r}
                  </span>
                ))}
              </div>
            </div>
          )}

          {profile && profile.job_functions.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                Funções
              </p>
              <div className="flex flex-wrap gap-1.5">
                {profile.job_functions.map((f) => (
                  <span
                    key={f}
                    className="text-[10px] bg-muted border px-2 py-0.5 rounded text-muted-foreground"
                  >
                    {JOB_LABELS[f] ?? f}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 border-t space-y-1.5">
            <Label className="text-xs">Trocar senha</Label>
            <div className="flex gap-2 max-w-xs">
              <Input
                type="password"
                placeholder="Nova senha (mín. 6 caracteres)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                className="h-8 text-xs shrink-0"
                disabled={newPassword.length < 6 || savingPwd}
                onClick={savePassword}
              >
                {savingPwd ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </div>

        {/* WhatsApp — um card por instância vinculada ao usuário */}
        {instances && instances.map((inst) => (
          <div key={inst.id} className="bg-card rounded-xl border shadow-card p-6">
            <WhatsAppQrConnect instance={inst} />
          </div>
        ))}
      </div>
    </div>
  );
}
