# WhatsApp QR Code + Página de Perfil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar página de perfil `/meu-perfil` onde cada usuário vê seus dados e conecta seu número WhatsApp escaneando QR code; com indicador de status permanente na barra preta do header.

**Architecture:** Edge function `whatsapp-instance-status` faz proxy seguro para a API Uazapi (token nunca exposto ao frontend). Frontend faz polling de 3s na página de perfil e 30s no header global. Após conexão, `phone_number` é salvo automaticamente no banco.

**Tech Stack:** React 18, TypeScript, TanStack Query, Supabase Edge Functions (Deno), Uazapi REST API, Tailwind CSS, shadcn/ui, sonner (toast), lucide-react

---

## Mapa de arquivos

| Ação | Arquivo | Responsabilidade |
|------|---------|-----------------|
| Criar | `supabase/functions/whatsapp-instance-status/index.ts` | Proxy Uazapi: verifica estado, retorna QR ou phone |
| Criar | `src/hooks/useMyWhatsAppStatus.ts` | Hook de polling para o header (30s) |
| Criar | `src/components/profile/WhatsAppQrConnect.tsx` | QR code + polling 3s + status badge |
| Criar | `src/pages/ProfilePage.tsx` | Página /meu-perfil completa |
| Modificar | `src/App.tsx` | Adiciona rota `/meu-perfil` |
| Modificar | `src/components/layout/AppLayout.tsx` | Indicador de status + link "Meu Perfil" no popover |

---

## Task 1: Edge Function `whatsapp-instance-status`

**Files:**
- Create: `supabase/functions/whatsapp-instance-status/index.ts`

- [ ] **Criar o arquivo da edge function com o conteúdo completo abaixo**

`supabase/functions/whatsapp-instance-status/index.ts`:
```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://posvenda.liveuni.com.br",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { instance_id } = await req.json();
    if (!instance_id) {
      return new Response(JSON.stringify({ error: "instance_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: instance, error: instError } = await adminClient
      .from("pipeline_whatsapp_instances")
      .select("id, user_id, instance_token, base_url, phone_number")
      .eq("id", instance_id)
      .single();

    if (instError || !instance) {
      return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Autorização: dono da instância OU admin
    const isOwner = instance.user_id === user.id;
    if (!isOwner) {
      const { data: roles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const isAdmin = roles?.some((r: { role: string }) => r.role === "admin");
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const token = instance.instance_token;
    const baseUrl = (instance.base_url || "https://liveuni.uazapi.com").replace(/\/$/, "");

    // Verifica estado da conexão
    // NOTA: se o endpoint /instance/connectionState não existir, testar /instance/status
    const stateRes = await fetch(`${baseUrl}/instance/connectionState`, {
      headers: { token },
    });
    const stateData = await stateRes.json().catch(() => ({}));
    // Uazapi GO: { instance: { state: "open"|"close"|"connecting" } } ou { state: "..." }
    const state: string = stateData?.instance?.state ?? stateData?.state ?? "close";

    let qrcode: string | null = null;
    let phone: string | null = null;

    if (state !== "open") {
      // Busca QR code
      // NOTA: se /instance/qrcode não existir, testar /instance/qr ou /instance/connect
      const qrRes = await fetch(`${baseUrl}/instance/qrcode`, {
        headers: { token },
      });
      const qrData = await qrRes.json().catch(() => ({}));
      // Tenta vários campos comuns da resposta Uazapi
      qrcode = qrData?.qrcode ?? qrData?.qr ?? qrData?.base64 ?? null;
    } else {
      // Conectado: busca número do WhatsApp
      // NOTA: se /instance/info não existir, testar /instance/status com mais detalhes
      const infoRes = await fetch(`${baseUrl}/instance/info`, {
        headers: { token },
      });
      const infoData = await infoRes.json().catch(() => ({}));
      // Tenta vários campos comuns
      const wid: string | null =
        infoData?.instance?.wid ??
        infoData?.wid ??
        infoData?.phone ??
        infoData?.instance?.phone ??
        null;

      if (wid) {
        // JID format: "5548999887766@s.whatsapp.net" → "5548999887766"
        phone = wid.includes("@") ? wid.split("@")[0] : wid;
        if (phone && phone !== instance.phone_number) {
          await adminClient
            .from("pipeline_whatsapp_instances")
            .update({ phone_number: phone })
            .eq("id", instance_id);
        }
      }
    }

    return new Response(
      JSON.stringify({ state, qrcode, phone }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in whatsapp-instance-status:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Fazer deploy da edge function**

```bash
npx supabase functions deploy whatsapp-instance-status --no-verify-jwt
```

> Se pedir login: `npx supabase login` primeiro.

- [ ] **Verificar no painel Supabase → Functions que a função aparece**

- [ ] **Commit**

```bash
git add supabase/functions/whatsapp-instance-status/index.ts
git commit -m "feat(whatsapp): edge function whatsapp-instance-status"
```

---

## Task 2: Hook `useMyWhatsAppStatus`

**Files:**
- Create: `src/hooks/useMyWhatsAppStatus.ts`

- [ ] **Criar o hook com o conteúdo abaixo**

`src/hooks/useMyWhatsAppStatus.ts`:
```typescript
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type WaState = "open" | "close" | "connecting" | null;

async function getStatus(instanceId: string): Promise<WaState> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token ?? "";
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-instance-status`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ instance_id: instanceId }),
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.state ?? null;
}

// Polling de 30s para o header — retorna estado e instance_id do usuário logado
export function useMyWhatsAppStatus(userId: string | undefined) {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [state, setState] = useState<WaState>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Busca a instância vinculada ao usuário
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("pipeline_whatsapp_instances")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setInstanceId(data?.id ?? null));
  }, [userId]);

  // Inicia polling quando instanceId estiver disponível
  useEffect(() => {
    if (!instanceId) return;

    const check = async () => {
      const s = await getStatus(instanceId);
      if (s !== null) setState(s);
    };

    check();
    intervalRef.current = setInterval(check, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [instanceId]);

  return { state, instanceId };
}
```

- [ ] **Commit**

```bash
git add src/hooks/useMyWhatsAppStatus.ts
git commit -m "feat(whatsapp): hook useMyWhatsAppStatus para polling do header"
```

---

## Task 3: Componente `WhatsAppQrConnect`

**Files:**
- Create: `src/components/profile/WhatsAppQrConnect.tsx`

- [ ] **Criar a pasta e o componente**

`src/components/profile/WhatsAppQrConnect.tsx`:
```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageSquare, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
}

interface StatusResponse {
  state: "open" | "close" | "connecting";
  qrcode: string | null;
  phone: string | null;
}

async function fetchInstanceStatus(instanceId: string): Promise<StatusResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token ?? "";
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-instance-status`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ instance_id: instanceId }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Erro ${res.status}`);
  }
  return res.json();
}

export function WhatsAppQrConnect({ instance }: { instance: Instance }) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wasConnected = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const poll = useCallback(async () => {
    try {
      const result = await fetchInstanceStatus(instance.id);
      setStatus(result);
      setError(null);

      if (result.state === "open" && !wasConnected.current) {
        wasConnected.current = true;
        toast.success(
          result.phone
            ? `WhatsApp conectado! Número: ${result.phone}`
            : "WhatsApp conectado com sucesso!"
        );
        stopPolling();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao verificar status");
    } finally {
      setLoading(false);
    }
  }, [instance.id]);

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, 3_000);
    return stopPolling;
  }, [poll]);

  const retry = () => {
    setError(null);
    setLoading(true);
    wasConnected.current = false;
    poll();
    if (!intervalRef.current) {
      intervalRef.current = setInterval(poll, 3_000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-semibold">Meu WhatsApp</h3>
          <span className="text-xs text-muted-foreground">· {instance.instance_name}</span>
        </div>
        {status && <StatusBadge state={status.state} />}
      </div>

      {/* Loading inicial */}
      {loading && !status && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Verificando conexão...
        </div>
      )}

      {/* Erro */}
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 space-y-2">
          <p className="text-sm text-destructive">
            Não foi possível conectar ao servidor WhatsApp. {error}
          </p>
          <Button variant="outline" size="sm" onClick={retry} className="text-xs gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
          </Button>
        </div>
      )}

      {/* Conectado */}
      {!error && status?.state === "open" && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
          <p className="text-sm font-medium text-emerald-800">WhatsApp conectado com sucesso!</p>
          {status.phone && (
            <p className="text-xs text-emerald-700 mt-1">
              Número: <span className="font-mono">{status.phone}</span>
            </p>
          )}
        </div>
      )}

      {/* QR Code (desconectado ou conectando) */}
      {!error && status && status.state !== "open" && (
        <>
          {status.qrcode ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Escaneie o QR code abaixo com seu WhatsApp para conectar:
              </p>
              <div className="inline-block p-3 bg-white rounded-xl border shadow-sm">
                <img
                  src={status.qrcode}
                  alt="QR Code WhatsApp"
                  className="h-48 w-48"
                />
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1 max-w-xs">
                <p className="font-medium text-foreground">Como escanear:</p>
                <p>1. Abra o WhatsApp no seu celular</p>
                <p>2. Toque em <strong>Aparelhos conectados</strong></p>
                <p>3. Toque em <strong>Conectar aparelho</strong></p>
                <p>4. Aponte a câmera para o QR code acima</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              Aguardando QR code...
            </p>
          )}
        </>
      )}
    </div>
  );
}

function StatusBadge({ state }: { state: "open" | "close" | "connecting" }) {
  if (state === "open")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Conectado
      </span>
    );
  if (state === "connecting")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
        Conectando...
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-full">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Desconectado
    </span>
  );
}
```

- [ ] **Commit**

```bash
git add src/components/profile/WhatsAppQrConnect.tsx
git commit -m "feat(profile): componente WhatsAppQrConnect com polling e QR code"
```

---

## Task 4: Página `ProfilePage`

**Files:**
- Create: `src/pages/ProfilePage.tsx`

- [ ] **Criar a página com o conteúdo abaixo**

`src/pages/ProfilePage.tsx`:
```tsx
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
  if (!res.ok) throw new Error(payload.error ?? payload.message ?? `Erro ${res.status}`);
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

  const { data: instance } = useQuery({
    queryKey: ["my_whatsapp_instance", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("pipeline_whatsapp_instances" as any)
        .select("id, instance_name, phone_number, base_url")
        .eq("user_id", user!.id)
        .limit(1)
        .maybeSingle();
      return (data as any) ?? null;
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

        {/* WhatsApp — só aparece se tiver instância vinculada */}
        {instance && (
          <div className="bg-card rounded-xl border shadow-card p-6">
            <WhatsAppQrConnect instance={instance} />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Commit**

```bash
git add src/pages/ProfilePage.tsx
git commit -m "feat(profile): página /meu-perfil com dados pessoais e troca de senha"
```

---

## Task 5: Rota `/meu-perfil` no App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Adicionar o lazy import de ProfilePage logo após os outros imports lazy (linha ~44)**

```tsx
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
```

- [ ] **Adicionar a rota dentro de `<Routes>` (após a rota `/meu-painel`)**

```tsx
<Route path="/meu-perfil" element={<ProfilePage />} />
```

- [ ] **Verificar que o arquivo compila sem erros**

```bash
npm run typecheck
```

- [ ] **Commit**

```bash
git add src/App.tsx
git commit -m "feat(profile): adiciona rota /meu-perfil"
```

---

## Task 6: Indicador de status e link no `AppLayout`

**Files:**
- Modify: `src/components/layout/AppLayout.tsx`

- [ ] **Adicionar os imports necessários no topo do arquivo**

Adicionar na linha dos imports existentes:
```tsx
import { useNavigate } from "react-router-dom";
import { useMyWhatsAppStatus } from "@/hooks/useMyWhatsAppStatus";
import { UserCircle } from "lucide-react";
```

- [ ] **Dentro de `AppLayout`, logo após a linha `const { user, roles, signOut } = useAuth();`, adicionar**

```tsx
const navigate = useNavigate();
const { state: waState } = useMyWhatsAppStatus(user?.id);
```

- [ ] **Adicionar o indicador de status WhatsApp ao lado do avatar, dentro do `<div className="flex items-center gap-3 flex-1 justify-end">`**

Localizar o bloco do sino (`<button className="relative p-2...">`) e adicionar ANTES dele:

```tsx
{waState !== null && (
  <button
    onClick={() => navigate("/meu-perfil")}
    title={
      waState === "open"
        ? "WhatsApp conectado"
        : waState === "connecting"
        ? "WhatsApp conectando..."
        : "WhatsApp desconectado"
    }
    className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-zinc-800 transition-colors"
  >
    <span
      className={`h-2.5 w-2.5 rounded-full ${
        waState === "open"
          ? "bg-emerald-500"
          : waState === "connecting"
          ? "bg-amber-400 animate-pulse"
          : "bg-red-500"
      }`}
    />
  </button>
)}
```

- [ ] **Adicionar link "Meu Perfil" no popover do avatar, ANTES do botão "Sair" (dentro de `<div className="p-2">`)**

Localizar `<div className="p-2">` que contém o botão Sair e substituir por:

```tsx
<div className="p-2">
  <button
    onClick={() => { navigate("/meu-perfil"); }}
    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted rounded-md transition-colors"
  >
    <UserCircle className="h-4 w-4" />
    Meu Perfil
  </button>
  <button
    onClick={signOut}
    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-md transition-colors"
  >
    <LogOut className="h-4 w-4" />
    Sair
  </button>
</div>
```

- [ ] **Verificar que o arquivo compila sem erros**

```bash
npm run typecheck
```

- [ ] **Commit**

```bash
git add src/components/layout/AppLayout.tsx src/hooks/useMyWhatsAppStatus.ts
git commit -m "feat(header): indicador WhatsApp + link Meu Perfil no avatar"
```

---

## Task 7: Teste manual e ajustes de endpoints Uazapi

- [ ] **Iniciar o servidor de desenvolvimento**

```bash
npm run dev
```

- [ ] **Abrir o sistema e clicar no avatar → "Meu Perfil"**

Verificar: página carrega, dados de nome/e-mail/roles aparecem corretamente.

- [ ] **Verificar bolinha no header**

Se o usuário logado tiver instância vinculada (`user_id` preenchido em `pipeline_whatsapp_instances`), a bolinha deve aparecer. Se não aparecer, checar no Supabase se o `user_id` está preenchido na tabela.

- [ ] **Verificar QR code / status da instância**

Abrir DevTools → Network → filtrar por `whatsapp-instance-status`. Verificar a resposta da edge function. Se retornar erro 500, checar os logs no painel Supabase → Logs → Edge Functions.

- [ ] **Se endpoint Uazapi retornar 404 em `/instance/connectionState`**

Abrir os logs da edge function no Supabase e identificar o endpoint correto. Testar:
- `/instance/status`
- `/instance/state`

Após identificar, atualizar a edge function no arquivo e fazer novo deploy:
```bash
npx supabase functions deploy whatsapp-instance-status --no-verify-jwt
```

- [ ] **Se campo do QR code vier vazio**

Verificar no log o JSON completo da resposta Uazapi para `/instance/qrcode`. Identificar o campo correto e ajustar na edge function (atualmente tenta `qrcode`, `qr`, `base64`).

- [ ] **Testar fluxo completo: escanear QR code**

1. Abrir a página `/meu-perfil`
2. QR code aparece (instância desconectada)
3. Escanear com WhatsApp
4. Status muda para "Conectado" em até 3s
5. Toast aparece com o número
6. Verificar no Supabase que `phone_number` foi atualizado na tabela `pipeline_whatsapp_instances`
7. Bolinha no header fica verde

- [ ] **Commit final se ajustes foram necessários**

```bash
git add supabase/functions/whatsapp-instance-status/index.ts
git commit -m "fix(whatsapp): ajusta endpoints Uazapi após teste manual"
```
