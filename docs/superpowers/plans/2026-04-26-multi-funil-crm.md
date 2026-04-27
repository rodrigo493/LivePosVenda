# Multi-Funil CRM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o array hardcoded `PIPELINE_STAGES` por múltiplos funis dinâmicos no banco de dados, com dialog de gestão (admin) e controle de acesso por usuário/etapa.

**Architecture:** 4 novas tabelas Supabase (pipelines, pipeline_stages, pipeline_user_access, pipeline_stage_user_access) + coluna pipeline_id em tickets. Frontend: novos hooks React Query + 4 novos componentes CRM + wiring no CrmPipelinePage. RLS garante que cada usuário vê apenas o que foi liberado.

**Tech Stack:** React 18, TypeScript, Supabase (postgres + RLS), @tanstack/react-query, @dnd-kit/sortable (já instalado), shadcn/ui, sonner (toast), Vitest

---

## File Map

**Criar:**
- `supabase/migrations/20260427000001_multi_pipeline.sql`
- `src/hooks/usePipelines.ts`
- `src/hooks/useManagePipelines.ts`
- `src/hooks/useManageStages.ts`
- `src/hooks/useUserAccess.ts`
- `src/components/crm/FunnelSwitcher.tsx`
- `src/components/crm/FunnelManagerDropdown.tsx`
- `src/components/crm/StageRow.tsx`
- `src/components/crm/FunnelDialog.tsx`
- `src/components/crm/UserAccessDialog.tsx`

**Modificar:**
- `src/hooks/usePipeline.ts` — aceitar pipelineId, remover PIPELINE_STAGES export
- `src/pages/CrmPipelinePage.tsx` — adicionar seletor de funil + botão admin
- `src/pages/SettingsPage.tsx` — remover aba Pipeline (substituída pelo dialog)

**Remover:**
- `src/hooks/usePipelineSettings.ts`
- `src/components/crm/PipelineStageSettings.tsx`

---

## Task 1: Migration — Tabelas e seed de dados

**Files:**
- Create: `supabase/migrations/20260427000001_multi_pipeline.sql`

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- supabase/migrations/20260427000001_multi_pipeline.sql

-- 1. Tabela de funis
CREATE TABLE public.pipelines (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  position   INT  NOT NULL DEFAULT 0,
  is_active  BOOL NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

-- Leitura: admin vê tudo; usuário comum vê só funis liberados
CREATE POLICY "pipelines_select" ON public.pipelines FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.pipeline_user_access pua
      WHERE pua.pipeline_id = id AND pua.user_id = auth.uid()
    )
  );
CREATE POLICY "pipelines_admin_write" ON public.pipelines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Etapas de cada funil
CREATE TABLE public.pipeline_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE RESTRICT,
  key         TEXT NOT NULL,
  label       TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT 'hsl(0 0% 45%)',
  delay_days  INT  NOT NULL DEFAULT 3,
  position    INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pipeline_id, key)
);
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stages_select" ON public.pipeline_stages FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.pipeline_stage_user_access sua
      WHERE sua.stage_id = id AND sua.user_id = auth.uid()
    )
  );
CREATE POLICY "stages_admin_write" ON public.pipeline_stages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Acesso de usuários aos funis
CREATE TABLE public.pipeline_user_access (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, pipeline_id)
);
ALTER TABLE public.pipeline_user_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pua_select" ON public.pipeline_user_access FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "pua_admin_write" ON public.pipeline_user_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Acesso de usuários às etapas
CREATE TABLE public.pipeline_stage_user_access (
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, stage_id)
);
ALTER TABLE public.pipeline_stage_user_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "psua_select" ON public.pipeline_stage_user_access FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "psua_admin_write" ON public.pipeline_stage_user_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Adiciona pipeline_id em tickets
ALTER TABLE public.tickets ADD COLUMN pipeline_id UUID REFERENCES public.pipelines(id);

-- 6. Seed: funil padrão "Pós-Venda"
DO $$
DECLARE
  v_pipeline_id UUID;
  stage RECORD;
BEGIN
  INSERT INTO public.pipelines (name, slug, position)
  VALUES ('Pós-Venda', 'pos-venda', 0)
  RETURNING id INTO v_pipeline_id;

  -- Inserir etapas (lendo cor/delay de system_settings se existir)
  FOR stage IN
    SELECT
      s.key,
      s.label,
      COALESCE(
        (SELECT JSON_PARSE_TEXT(ss.value) FROM public.system_settings ss
         WHERE ss.key = 'pipeline_color_' || s.key LIMIT 1),
        s.default_color
      ) AS color,
      COALESCE(
        (SELECT JSON_PARSE_TEXT(ss.value)::int FROM public.system_settings ss
         WHERE ss.key = 'pipeline_delay_' || s.key LIMIT 1),
        s.default_delay
      ) AS delay_days,
      s.pos
    FROM (VALUES
      ('sem_atendimento',  'Sem atendimento',    'hsl(0 0% 45%)',    1,   0),
      ('primeiro_contato', 'Primeiro contato',   'hsl(210 80% 55%)', 2,   1),
      ('em_analise',       'Em análise',         'hsl(38 92% 50%)',  3,   2),
      ('separacao_pecas',  'Separação de peças', 'hsl(280 60% 55%)', 5,   3),
      ('concluido',        'Concluído',          'hsl(142 71% 45%)', 999, 4),
      ('sem_interacao',    'Sem interação',      'hsl(0 84% 60%)',   2,   5)
    ) AS s(key, label, default_color, default_delay, pos)
  LOOP
    INSERT INTO public.pipeline_stages (pipeline_id, key, label, color, delay_days, position)
    VALUES (v_pipeline_id, stage.key, stage.label, stage.color, stage.delay_days, stage.pos);
  END LOOP;

  -- Backfill tickets
  UPDATE public.tickets SET pipeline_id = v_pipeline_id WHERE pipeline_id IS NULL;

  -- Liberar acesso ao funil "Pós-Venda" para todos os usuários não-admin existentes
  INSERT INTO public.pipeline_user_access (user_id, pipeline_id)
  SELECT ur.user_id, v_pipeline_id
  FROM public.user_roles ur
  WHERE ur.role != 'admin'
  ON CONFLICT DO NOTHING;

  -- Liberar acesso a todas as etapas do funil para esses usuários
  INSERT INTO public.pipeline_stage_user_access (user_id, stage_id)
  SELECT pua.user_id, ps.id
  FROM public.pipeline_user_access pua
  CROSS JOIN public.pipeline_stages ps
  WHERE ps.pipeline_id = v_pipeline_id
    AND pua.pipeline_id = v_pipeline_id
  ON CONFLICT DO NOTHING;

END $$;

-- 7. Torna pipeline_id NOT NULL após backfill
ALTER TABLE public.tickets ALTER COLUMN pipeline_id SET NOT NULL;
ALTER TABLE public.tickets ALTER COLUMN pipeline_id SET DEFAULT (
  (SELECT id FROM public.pipelines WHERE slug = 'pos-venda' LIMIT 1)
);
```

- [ ] **Step 2: Aplicar a migration**

```bash
cd C:/VS_CODE/LivePosVenda
npx supabase db push
```

Esperado: `Applying migration 20260427000001_multi_pipeline.sql... done`

- [ ] **Step 3: Verificar no Supabase Studio que as tabelas foram criadas e tickets têm pipeline_id**

Acesse o Supabase Studio e confirme:
- `pipelines` tem 1 linha ("Pós-Venda")
- `pipeline_stages` tem 6 linhas
- `tickets` têm `pipeline_id` preenchido

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260427000001_multi_pipeline.sql
git commit -m "feat(db): tabelas multi-pipeline com seed Pós-Venda e backfill tickets"
```

---

## Task 2: Hook usePipelines

**Files:**
- Create: `src/hooks/usePipelines.ts`

**Contexto:** Hook que lista os pipelines acessíveis ao usuário atual. Admin vê todos (RLS passa). Usuário comum vê apenas os liberados via `pipeline_user_access` (RLS filtra automaticamente).

- [ ] **Step 1: Criar o hook**

```typescript
// src/hooks/usePipelines.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Pipeline {
  id: string;
  name: string;
  slug: string;
  position: number;
  is_active: boolean;
  created_at: string;
}

export function usePipelines() {
  return useQuery({
    queryKey: ["pipelines"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pipelines")
        .select("id, name, slug, position, is_active, created_at")
        .eq("is_active", true)
        .order("position", { ascending: true });
      if (error) throw error;
      return data as Pipeline[];
    },
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/usePipelines.ts
git commit -m "feat(hooks): usePipelines — lista funis acessíveis com RLS"
```

---

## Task 3: Hook usePipelineStages + atualizar usePipeline.ts

**Files:**
- Create: `src/hooks/usePipelineStages.ts`
- Modify: `src/hooks/usePipeline.ts`

- [ ] **Step 1: Criar usePipelineStages.ts**

```typescript
// src/hooks/usePipelineStages.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PipelineStageDB {
  id: string;
  pipeline_id: string;
  key: string;
  label: string;
  color: string;
  delay_days: number;
  position: number;
}

export function usePipelineStages(pipelineId: string | null | undefined) {
  return useQuery({
    queryKey: ["pipeline-stages", pipelineId],
    enabled: !!pipelineId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pipeline_stages")
        .select("id, pipeline_id, key, label, color, delay_days, position")
        .eq("pipeline_id", pipelineId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data as PipelineStageDB[];
    },
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: Atualizar usePipeline.ts**

Substituir o conteúdo de `src/hooks/usePipeline.ts`:

```typescript
// src/hooks/usePipeline.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePipelineTickets(pipelineId: string | null | undefined, userId?: string) {
  return useQuery({
    queryKey: ["pipeline-tickets", pipelineId, userId],
    enabled: !!pipelineId,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      let q = (supabase as any)
        .from("tickets")
        .select("*, clients(name), equipments(serial_number, equipment_models(name)), quotes(id, quote_number, status, service_request_id, warranty_claim_id)")
        .eq("pipeline_id", pipelineId)
        .not("status", "eq", "fechado")
        .order("pipeline_position", { ascending: true })
        .order("last_interaction_at", { ascending: true });
      if (userId) q = q.eq("assigned_to", userId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useMovePipelineStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      stage,
      position,
      pipelineId,
    }: {
      id: string;
      stage: string;
      position: number;
      pipelineId: string;
    }) => {
      const now = new Date().toISOString();

      const { data: stageTickets } = await (supabase as any)
        .from("tickets")
        .select("id, pipeline_position")
        .eq("pipeline_id", pipelineId)
        .eq("pipeline_stage", stage)
        .neq("id", id)
        .order("pipeline_position", { ascending: true });

      const others = stageTickets || [];
      const updates: { id: string; pipeline_position: number }[] = [];
      let pos = 1;
      let inserted = false;

      for (const t of others) {
        if (pos === position && !inserted) {
          updates.push({ id, pipeline_position: pos });
          pos++;
          inserted = true;
        }
        updates.push({ id: t.id, pipeline_position: pos });
        pos++;
      }
      if (!inserted) updates.push({ id, pipeline_position: pos });

      if (stage === "concluido") {
        const { error } = await (supabase as any)
          .from("tickets")
          .update({ pipeline_stage: stage, pipeline_position: position, status: "fechado", closed_at: now, last_interaction_at: now, updated_at: now })
          .eq("id", id);
        if (error) throw error;

        const { data: ticket } = await supabase.from("tickets").select("client_id, title, description, internal_notes").eq("id", id).single();
        if (ticket?.client_id) {
          await (supabase as any).from("client_service_history").insert({
            client_id: ticket.client_id,
            service_date: now,
            device: null,
            problem_reported: ticket.description || ticket.title,
            solution_provided: ticket.internal_notes || null,
            service_status: "concluido",
          });
        }
      } else {
        const { error } = await (supabase as any)
          .from("tickets")
          .update({ pipeline_stage: stage, pipeline_position: position, updated_at: now })
          .eq("id", id);
        if (error) throw error;
      }

      for (const u of updates) {
        if (u.id !== id) {
          await (supabase as any).from("tickets").update({ pipeline_position: u.pipeline_position }).eq("id", u.id);
        }
      }

      const { data: ticket } = await supabase.from("tickets").select("equipment_id").eq("id", id).single();
      if (ticket?.equipment_id) {
        await supabase.from("technical_history").insert({
          equipment_id: ticket.equipment_id,
          event_type: "mudanca_pipeline",
          description: `Pipeline alterado para: ${stage}`,
          reference_type: "ticket",
          reference_id: id,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
      qc.invalidateQueries({ queryKey: ["client_service_history"] });
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/usePipelineStages.ts src/hooks/usePipeline.ts
git commit -m "feat(hooks): usePipelineStages + usePipeline aceita pipelineId dinâmico"
```

---

## Task 4: Hooks useManagePipelines + useManageStages

**Files:**
- Create: `src/hooks/useManagePipelines.ts`
- Create: `src/hooks/useManageStages.ts`

- [ ] **Step 1: Criar useManagePipelines.ts**

```typescript
// src/hooks/useManagePipelines.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function useCreatePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const slug = toSlug(name) + "-" + Date.now().toString(36);
      const { data, error } = await (supabase as any)
        .from("pipelines")
        .insert({ name, slug, position: 999 })
        .select("id, name, slug")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipelines"] });
      toast.success("Funil criado com sucesso");
    },
    onError: () => toast.error("Erro ao criar funil"),
  });
}

export function useUpdatePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await (supabase as any)
        .from("pipelines")
        .update({ name })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipelines"] });
      toast.success("Funil atualizado");
    },
    onError: () => toast.error("Erro ao atualizar funil"),
  });
}

export function useDeletePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Verificar tickets
      const { count, error: countErr } = await (supabase as any)
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("pipeline_id", id);
      if (countErr) throw countErr;
      if ((count ?? 0) > 0) throw new Error(`Não é possível excluir — há ${count} ticket(s) neste funil`);

      const { error } = await (supabase as any).from("pipelines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipelines"] });
      toast.success("Funil excluído");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
```

- [ ] **Step 2: Criar useManageStages.ts**

```typescript
// src/hooks/useManageStages.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PipelineStageDB } from "@/hooks/usePipelineStages";

function toKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") + "_" + Date.now().toString(36);
}

export function useCreateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pipelineId,
      label,
      color,
      delayDays,
      position,
    }: {
      pipelineId: string;
      label: string;
      color: string;
      delayDays: number;
      position: number;
    }) => {
      const key = toKey(label);
      const { data, error } = await (supabase as any)
        .from("pipeline_stages")
        .insert({ pipeline_id: pipelineId, key, label, color, delay_days: delayDays, position })
        .select("id, pipeline_id, key, label, color, delay_days, position")
        .single();
      if (error) throw error;
      return data as PipelineStageDB;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["pipeline-stages", vars.pipelineId] });
      toast.success("Etapa criada");
    },
    onError: () => toast.error("Erro ao criar etapa"),
  });
}

export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      pipelineId,
      label,
      color,
      delayDays,
    }: {
      id: string;
      pipelineId: string;
      label: string;
      color: string;
      delayDays: number;
    }) => {
      const { error } = await (supabase as any)
        .from("pipeline_stages")
        .update({ label, color, delay_days: delayDays })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["pipeline-stages", vars.pipelineId] });
      toast.success("Etapa atualizada");
    },
    onError: () => toast.error("Erro ao atualizar etapa"),
  });
}

export function useDeleteStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pipelineId }: { id: string; pipelineId: string }) => {
      // Verificar tickets
      const { count, error: countErr } = await (supabase as any)
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("pipeline_id", pipelineId)
        .eq("pipeline_stage", (await (supabase as any).from("pipeline_stages").select("key").eq("id", id).single()).data?.key);
      if (countErr) throw countErr;
      if ((count ?? 0) > 0) throw new Error(`Não é possível excluir — há ${count} ticket(s) nesta etapa`);

      const { error } = await (supabase as any).from("pipeline_stages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["pipeline-stages", vars.pipelineId] });
      toast.success("Etapa excluída");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useReorderStages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pipelineId, stages }: { pipelineId: string; stages: { id: string; position: number }[] }) => {
      await Promise.all(
        stages.map(({ id, position }) =>
          (supabase as any).from("pipeline_stages").update({ position }).eq("id", id)
        )
      );
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["pipeline-stages", vars.pipelineId] });
    },
    onError: () => toast.error("Erro ao reordenar etapas"),
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useManagePipelines.ts src/hooks/useManageStages.ts
git commit -m "feat(hooks): useManagePipelines e useManageStages — CRUD de funis e etapas"
```

---

## Task 5: Hook useUserAccess

**Files:**
- Create: `src/hooks/useUserAccess.ts`

- [ ] **Step 1: Criar useUserAccess.ts**

```typescript
// src/hooks/useUserAccess.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface UserSummary {
  user_id: string;
  full_name: string;
  email: string;
}

export interface UserAccessData {
  pipelineIds: Set<string>;
  stageIds: Set<string>;
}

export function useAllUsers() {
  return useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      // Busca todos os usuários não-admin via profiles + user_roles
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("user_id, full_name, email")
        .order("full_name", { ascending: true });
      if (error) throw error;

      // Filtra admins
      const { data: adminRoles } = await (supabase as any)
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const adminIds = new Set((adminRoles || []).map((r: any) => r.user_id));

      return (data as UserSummary[]).filter((u) => !adminIds.has(u.user_id));
    },
    staleTime: 60_000,
  });
}

export function useUserAccess(userId: string | null) {
  return useQuery({
    queryKey: ["user-access", userId],
    enabled: !!userId,
    queryFn: async (): Promise<UserAccessData> => {
      const [{ data: pua }, { data: psua }] = await Promise.all([
        (supabase as any)
          .from("pipeline_user_access")
          .select("pipeline_id")
          .eq("user_id", userId),
        (supabase as any)
          .from("pipeline_stage_user_access")
          .select("stage_id")
          .eq("user_id", userId),
      ]);
      return {
        pipelineIds: new Set((pua || []).map((r: any) => r.pipeline_id)),
        stageIds: new Set((psua || []).map((r: any) => r.stage_id)),
      };
    },
  });
}

export function useSaveUserAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      pipelineIds,
      stageIds,
    }: {
      userId: string;
      pipelineIds: string[];
      stageIds: string[];
    }) => {
      // Limpar tudo e reinserir
      await Promise.all([
        (supabase as any).from("pipeline_user_access").delete().eq("user_id", userId),
        (supabase as any).from("pipeline_stage_user_access").delete().eq("user_id", userId),
      ]);

      if (pipelineIds.length > 0) {
        const { error } = await (supabase as any)
          .from("pipeline_user_access")
          .insert(pipelineIds.map((pid) => ({ user_id: userId, pipeline_id: pid })));
        if (error) throw error;
      }

      if (stageIds.length > 0) {
        const { error } = await (supabase as any)
          .from("pipeline_stage_user_access")
          .insert(stageIds.map((sid) => ({ user_id: userId, stage_id: sid })));
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["user-access", vars.userId] });
      toast.success("Acesso salvo com sucesso");
    },
    onError: () => toast.error("Erro ao salvar acesso"),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useUserAccess.ts
git commit -m "feat(hooks): useUserAccess — listar usuários e gerenciar acesso a funis/etapas"
```

---

## Task 6: Componente FunnelSwitcher

**Files:**
- Create: `src/components/crm/FunnelSwitcher.tsx`

- [ ] **Step 1: Criar FunnelSwitcher.tsx**

```tsx
// src/components/crm/FunnelSwitcher.tsx
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePipelines, type Pipeline } from "@/hooks/usePipelines";

interface FunnelSwitcherProps {
  currentPipelineId: string | null;
  onSelect: (pipeline: Pipeline) => void;
}

export function FunnelSwitcher({ currentPipelineId, onSelect }: FunnelSwitcherProps) {
  const { data: pipelines = [] } = usePipelines();
  const current = pipelines.find((p) => p.id === currentPipelineId);

  // Oculta se o usuário tem acesso a apenas 1 funil
  if (pipelines.length <= 1) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1 text-muted-foreground">
          <ChevronDown className="h-3.5 w-3.5" />
          <span className="text-xs">trocar funil</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        {pipelines.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent ${
              p.id === currentPipelineId ? "bg-accent text-accent-foreground font-medium" : "text-foreground"
            }`}
          >
            {p.name}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/crm/FunnelSwitcher.tsx
git commit -m "feat(crm): FunnelSwitcher — popover para trocar entre funis"
```

---

## Task 7: Componente StageRow

**Files:**
- Create: `src/components/crm/StageRow.tsx`

- [ ] **Step 1: Criar StageRow.tsx**

```tsx
// src/components/crm/StageRow.tsx
import { useState } from "react";
import { GripVertical, Pencil, Trash2, Check, X } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PipelineStageDB } from "@/hooks/usePipelineStages";

const STAGE_COLORS = [
  "hsl(0 0% 45%)",
  "hsl(210 80% 55%)",
  "hsl(38 92% 50%)",
  "hsl(280 60% 55%)",
  "hsl(142 71% 45%)",
  "hsl(0 84% 60%)",
  "hsl(199 89% 48%)",
  "hsl(330 81% 60%)",
  "hsl(24 95% 53%)",
  "hsl(262 83% 58%)",
];

interface StageRowProps {
  stage: PipelineStageDB;
  onEdit: (id: string, label: string, color: string, delayDays: number) => void;
  onDelete: (id: string) => void;
}

export function StageRow({ stage, onEdit, onDelete }: StageRowProps) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(stage.label);
  const [color, setColor] = useState(stage.color);
  const [delayDays, setDelayDays] = useState(stage.delay_days);

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stage.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  function handleSave() {
    if (!label.trim()) return;
    onEdit(stage.id, label.trim(), color, delayDays);
    setEditing(false);
  }

  function handleCancel() {
    setLabel(stage.label);
    setColor(stage.color);
    setDelayDays(stage.delay_days);
    setEditing(false);
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-card">
      {/* Row principal */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: stage.color }} />
        <span className="flex-1 text-sm">{stage.label}</span>
        {!editing && (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(stage.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>

      {/* Form inline de edição */}
      {editing && (
        <div className="border-t px-3 pb-3 pt-2 space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Nome</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 mt-1" autoFocus />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Cor</label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {STAGE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-6 w-6 rounded-md transition-all ${color === c ? "ring-2 ring-primary ring-offset-1" : ""}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Dias para "atrasado"</label>
            <Input
              type="number"
              min={1}
              value={delayDays}
              onChange={(e) => setDelayDays(Number(e.target.value))}
              className="h-8 w-24 mt-1"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Check className="h-3.5 w-3.5 mr-1" /> Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/crm/StageRow.tsx
git commit -m "feat(crm): StageRow — linha de etapa com edição inline e drag handle"
```

---

## Task 8: Componente FunnelDialog

**Files:**
- Create: `src/components/crm/FunnelDialog.tsx`

- [ ] **Step 1: Criar FunnelDialog.tsx**

```tsx
// src/components/crm/FunnelDialog.tsx
import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StageRow } from "@/components/crm/StageRow";
import { usePipelineStages, type PipelineStageDB } from "@/hooks/usePipelineStages";
import { useCreatePipeline, useUpdatePipeline } from "@/hooks/useManagePipelines";
import { useCreateStage, useUpdateStage, useDeleteStage, useReorderStages } from "@/hooks/useManageStages";
import type { Pipeline } from "@/hooks/usePipelines";

interface FunnelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  pipeline?: Pipeline | null;
  onCreated?: (pipeline: Pipeline) => void;
}

export function FunnelDialog({ open, onOpenChange, mode, pipeline, onCreated }: FunnelDialogProps) {
  const [name, setName] = useState("");
  const { data: stages = [] } = usePipelineStages(mode === "edit" ? pipeline?.id : null);
  const [localStages, setLocalStages] = useState<PipelineStageDB[]>([]);

  const createPipeline = useCreatePipeline();
  const updatePipeline = useUpdatePipeline();
  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();
  const reorderStages = useReorderStages();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (open) {
      setName(mode === "edit" ? (pipeline?.name ?? "") : "");
      setLocalStages(stages);
    }
  }, [open, mode, pipeline, stages]);

  useEffect(() => {
    setLocalStages(stages);
  }, [stages]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLocalStages((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  async function handleAddStage() {
    if (!pipeline?.id && mode === "edit") return;
    // Para modo criação, stages serão adicionadas após criar o pipeline
    const newStage: PipelineStageDB = {
      id: `temp-${Date.now()}`,
      pipeline_id: pipeline?.id ?? "",
      key: "",
      label: "Nova etapa",
      color: "hsl(210 80% 55%)",
      delay_days: 3,
      position: localStages.length,
    };
    setLocalStages((prev) => [...prev, newStage]);
  }

  async function handleEditStage(id: string, label: string, color: string, delayDays: number) {
    setLocalStages((prev) =>
      prev.map((s) => (s.id === id ? { ...s, label, color, delay_days: delayDays } : s))
    );
    if (pipeline?.id && !id.startsWith("temp-")) {
      await updateStage.mutateAsync({ id, pipelineId: pipeline.id, label, color, delayDays });
    }
  }

  async function handleDeleteStage(id: string) {
    if (id.startsWith("temp-")) {
      setLocalStages((prev) => prev.filter((s) => s.id !== id));
      return;
    }
    if (!pipeline?.id) return;
    await deleteStage.mutateAsync({ id, pipelineId: pipeline.id });
    setLocalStages((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleSave() {
    if (!name.trim()) return;

    if (mode === "create") {
      const newPipeline = await createPipeline.mutateAsync(name.trim());
      // Criar etapas novas
      for (let i = 0; i < localStages.length; i++) {
        const s = localStages[i];
        await createStage.mutateAsync({
          pipelineId: newPipeline.id,
          label: s.label,
          color: s.color,
          delayDays: s.delay_days,
          position: i,
        });
      }
      onCreated?.(newPipeline);
    } else if (pipeline) {
      await updatePipeline.mutateAsync({ id: pipeline.id, name: name.trim() });
      // Reordenar etapas existentes
      const existingStages = localStages.filter((s) => !s.id.startsWith("temp-"));
      if (existingStages.length > 0) {
        await reorderStages.mutateAsync({
          pipelineId: pipeline.id,
          stages: existingStages.map((s, i) => ({ id: s.id, position: i })),
        });
      }
      // Criar etapas novas (temp-)
      const tempStages = localStages.filter((s) => s.id.startsWith("temp-"));
      for (let i = 0; i < tempStages.length; i++) {
        const s = tempStages[i];
        await createStage.mutateAsync({
          pipelineId: pipeline.id,
          label: s.label,
          color: s.color,
          delayDays: s.delay_days,
          position: existingStages.length + i,
        });
      }
    }

    onOpenChange(false);
  }

  const isSaving =
    createPipeline.isPending ||
    updatePipeline.isPending ||
    createStage.isPending ||
    updateStage.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Criar novo funil" : "Editar funil"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="funnel-name">Nome do funil</Label>
            <Input
              id="funnel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Comercial, Suporte..."
              className="mt-1"
              autoFocus
            />
          </div>

          <Tabs defaultValue="stages">
            <TabsList className="w-full">
              <TabsTrigger value="stages" className="flex-1">Etapas</TabsTrigger>
              <TabsTrigger value="access" className="flex-1" disabled>Acesso (em breve)</TabsTrigger>
            </TabsList>

            <TabsContent value="stages" className="space-y-2 mt-3">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={localStages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  {localStages.map((stage) => (
                    <StageRow
                      key={stage.id}
                      stage={stage}
                      onEdit={handleEditStage}
                      onDelete={handleDeleteStage}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              <button
                onClick={handleAddStage}
                className="w-full rounded-lg border border-dashed py-2 text-sm text-primary hover:bg-accent transition-colors flex items-center justify-center gap-1"
              >
                <Plus className="h-4 w-4" /> Adicionar etapa
              </button>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
            {isSaving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/crm/FunnelDialog.tsx
git commit -m "feat(crm): FunnelDialog — criar/editar funil com etapas e drag-to-reorder"
```

---

## Task 9: Componente UserAccessDialog

**Files:**
- Create: `src/components/crm/UserAccessDialog.tsx`

- [ ] **Step 1: Criar UserAccessDialog.tsx**

```tsx
// src/components/crm/UserAccessDialog.tsx
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { usePipelines } from "@/hooks/usePipelines";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { useAllUsers, useUserAccess, useSaveUserAccess } from "@/hooks/useUserAccess";

interface UserAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function PipelineAccessRow({
  pipelineId,
  pipelineName,
  checkedPipelines,
  checkedStages,
  onTogglePipeline,
  onToggleStage,
}: {
  pipelineId: string;
  pipelineName: string;
  checkedPipelines: Set<string>;
  checkedStages: Set<string>;
  onTogglePipeline: (pid: string, stageIds: string[]) => void;
  onToggleStage: (sid: string) => void;
}) {
  const { data: stages = [] } = usePipelineStages(pipelineId);
  const isPipelineChecked = checkedPipelines.has(pipelineId);

  return (
    <div className="mb-3">
      <div className={`flex items-center gap-3 rounded-t-lg border px-3 py-2 ${isPipelineChecked ? "bg-card" : "bg-muted/20"}`}>
        <Checkbox
          checked={isPipelineChecked}
          onCheckedChange={() => onTogglePipeline(pipelineId, stages.map((s) => s.id))}
        />
        <span className="text-sm font-semibold flex-1">{pipelineName}</span>
        <span className="text-xs text-muted-foreground">{stages.length} etapas</span>
      </div>

      {isPipelineChecked && stages.length > 0 && (
        <div className="border border-t-0 rounded-b-lg bg-muted/10 px-3 py-2 space-y-1.5">
          {stages.map((stage) => (
            <div key={stage.id} className="flex items-center gap-3 pl-2">
              <Checkbox
                checked={checkedStages.has(stage.id)}
                onCheckedChange={() => onToggleStage(stage.id)}
              />
              <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: stage.color }} />
              <span className={`text-sm ${checkedStages.has(stage.id) ? "text-foreground" : "text-muted-foreground"}`}>
                {stage.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function UserAccessDialog({ open, onOpenChange }: UserAccessDialogProps) {
  const { data: users = [] } = useAllUsers();
  const { data: pipelines = [] } = usePipelines();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { data: access } = useUserAccess(selectedUserId);
  const saveAccess = useSaveUserAccess();

  const [checkedPipelines, setCheckedPipelines] = useState<Set<string>>(new Set());
  const [checkedStages, setCheckedStages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (access) {
      setCheckedPipelines(new Set(access.pipelineIds));
      setCheckedStages(new Set(access.stageIds));
    }
  }, [access]);

  useEffect(() => {
    if (open && users.length > 0 && !selectedUserId) {
      setSelectedUserId(users[0].user_id);
    }
  }, [open, users]);

  function handleTogglePipeline(pipelineId: string, stageIds: string[]) {
    setCheckedPipelines((prev) => {
      const next = new Set(prev);
      if (next.has(pipelineId)) {
        next.delete(pipelineId);
        setCheckedStages((ps) => {
          const ns = new Set(ps);
          stageIds.forEach((sid) => ns.delete(sid));
          return ns;
        });
      } else {
        next.add(pipelineId);
        setCheckedStages((ps) => {
          const ns = new Set(ps);
          stageIds.forEach((sid) => ns.add(sid));
          return ns;
        });
      }
      return next;
    });
  }

  function handleToggleStage(stageId: string) {
    setCheckedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  }

  async function handleSave() {
    if (!selectedUserId) return;
    await saveAccess.mutateAsync({
      userId: selectedUserId,
      pipelineIds: [...checkedPipelines],
      stageIds: [...checkedStages],
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle>Acesso de usuários</DialogTitle>
        </DialogHeader>

        <div className="flex h-[480px]">
          {/* Lista de usuários */}
          <div className="w-44 border-r flex-shrink-0">
            <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Usuários</p>
            <ScrollArea className="h-[calc(480px-36px)]">
              <div className="px-2 space-y-1">
                {users.map((u) => (
                  <button
                    key={u.user_id}
                    onClick={() => setSelectedUserId(u.user_id)}
                    className={`w-full flex flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent ${
                      u.user_id === selectedUserId ? "bg-accent" : ""
                    }`}
                  >
                    <span className="text-sm font-medium leading-none">{u.full_name}</span>
                    <span className="text-xs text-muted-foreground truncate w-full">{u.email}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Painel de funis e etapas */}
          <div className="flex-1 flex flex-col">
            {selectedUserId ? (
              <>
                <div className="px-4 py-3 border-b">
                  <p className="text-sm text-muted-foreground">
                    Selecione quais funis e etapas o usuário pode acessar
                  </p>
                </div>
                <ScrollArea className="flex-1 px-4 py-3">
                  {pipelines.map((p) => (
                    <PipelineAccessRow
                      key={p.id}
                      pipelineId={p.id}
                      pipelineName={p.name}
                      checkedPipelines={checkedPipelines}
                      checkedStages={checkedStages}
                      onTogglePipeline={handleTogglePipeline}
                      onToggleStage={handleToggleStage}
                    />
                  ))}
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                Selecione um usuário
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!selectedUserId || saveAccess.isPending}>
            {saveAccess.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verificar se ScrollArea e Checkbox existem**

```bash
ls "C:/VS_CODE/LivePosVenda/src/components/ui/scroll-area.tsx"
ls "C:/VS_CODE/LivePosVenda/src/components/ui/checkbox.tsx"
```

Se não existirem, instalar via shadcn:

```bash
cd C:/VS_CODE/LivePosVenda
npx shadcn@latest add scroll-area checkbox
```

- [ ] **Step 3: Commit**

```bash
git add src/components/crm/UserAccessDialog.tsx
git commit -m "feat(crm): UserAccessDialog — controle granular de acesso por usuário/funil/etapa"
```

---

## Task 10: Componente FunnelManagerDropdown

**Files:**
- Create: `src/components/crm/FunnelManagerDropdown.tsx`

- [ ] **Step 1: Criar FunnelManagerDropdown.tsx**

```tsx
// src/components/crm/FunnelManagerDropdown.tsx
import { useState } from "react";
import { Settings, Pencil, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FunnelDialog } from "@/components/crm/FunnelDialog";
import { UserAccessDialog } from "@/components/crm/UserAccessDialog";
import type { Pipeline } from "@/hooks/usePipelines";

interface FunnelManagerDropdownProps {
  currentPipeline: Pipeline | null;
  onPipelineCreated: (pipeline: Pipeline) => void;
}

export function FunnelManagerDropdown({ currentPipeline, onPipelineCreated }: FunnelManagerDropdownProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" /> Editar funil
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Criar funil
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAccessOpen(true)}>
            <Users className="h-4 w-4 mr-2" /> Acesso de usuários
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <FunnelDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        pipeline={currentPipeline}
      />

      <FunnelDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onCreated={(p) => {
          setCreateOpen(false);
          onPipelineCreated(p);
        }}
      />

      <UserAccessDialog open={accessOpen} onOpenChange={setAccessOpen} />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/crm/FunnelManagerDropdown.tsx
git commit -m "feat(crm): FunnelManagerDropdown — ⚙️ com Editar/Criar/Acesso de usuários"
```

---

## Task 11: Integrar CrmPipelinePage

**Files:**
- Modify: `src/pages/CrmPipelinePage.tsx`

- [ ] **Step 1: Substituir imports e estado**

No topo de `CrmPipelinePage.tsx`, remover:
```typescript
import { usePipelineTickets, useMovePipelineStage, PIPELINE_STAGES } from "@/hooks/usePipeline";
import { usePipelineSettings, getDelayMap } from "@/hooks/usePipelineSettings";
```

Adicionar:
```typescript
import { usePipelineTickets, useMovePipelineStage } from "@/hooks/usePipeline";
import { usePipelines } from "@/hooks/usePipelines";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { FunnelSwitcher } from "@/components/crm/FunnelSwitcher";
import { FunnelManagerDropdown } from "@/components/crm/FunnelManagerDropdown";
import type { Pipeline } from "@/hooks/usePipelines";
```

- [ ] **Step 2: Adicionar estado currentPipelineId**

Após `const { user, roles } = useAuth();`, adicionar:

```typescript
const isAdmin = roles.includes("admin");
const { data: pipelines = [] } = usePipelines();
const [currentPipeline, setCurrentPipeline] = useState<Pipeline | null>(null);

// Inicializa com o primeiro pipeline disponível
useEffect(() => {
  if (pipelines.length > 0 && !currentPipeline) {
    setCurrentPipeline(pipelines[0]);
  }
}, [pipelines, currentPipeline]);

const { data: stages = [] } = usePipelineStages(currentPipeline?.id);
const stageKeySet = useMemo(() => new Set<string>(stages.map((s) => s.key)), [stages]);
const delayMap = useMemo(() => {
  const map: Record<string, number> = {};
  stages.forEach((s) => { map[s.key] = s.delay_days; });
  return map;
}, [stages]);
```

- [ ] **Step 3: Atualizar usePipelineTickets**

Substituir:
```typescript
const { data: tickets, isLoading } = usePipelineTickets(viewAll ? undefined : user?.id);
const { data: stageConfigs } = usePipelineSettings();
const delayMap = useMemo(() => getDelayMap(stageConfigs), [stageConfigs]);
```

Por:
```typescript
const { data: tickets, isLoading } = usePipelineTickets(currentPipeline?.id, viewAll ? undefined : user?.id);
```

- [ ] **Step 4: Atualizar o `grouped` memo**

Substituir a linha:
```typescript
PIPELINE_STAGES.forEach((s) => (map[s.key] = []));
```

Por:
```typescript
stages.forEach((s) => (map[s.key] = []));
```

- [ ] **Step 5: Atualizar useMovePipelineStage calls**

Localizar todos os `moveStage.mutate({` no arquivo e adicionar `pipelineId: currentPipeline?.id ?? ""`:

```typescript
moveStage.mutate({ id: activeId, stage: overStage, position: newPos, pipelineId: currentPipeline?.id ?? "" });
```

- [ ] **Step 6: Atualizar o header (onde fica o título da página)**

Localizar o PageHeader ou o título "Pipeline CRM" e adicionar os novos componentes. Substituir o bloco do título por:

```tsx
<div className="flex items-center gap-2">
  <span className="font-bold text-lg">{currentPipeline?.name ?? "Pipeline CRM"}</span>
  <FunnelSwitcher
    currentPipelineId={currentPipeline?.id ?? null}
    onSelect={setCurrentPipeline}
  />
  {isAdmin && (
    <>
      <div className="w-px h-5 bg-border" />
      <FunnelManagerDropdown
        currentPipeline={currentPipeline}
        onPipelineCreated={setCurrentPipeline}
      />
    </>
  )}
</div>
```

- [ ] **Step 7: Atualizar as StageColumns para usar stages dinâmicos**

Localizar o map de `PIPELINE_STAGES.map(...)` que renderiza as colunas e substituir por `stages.map(...)`.

- [ ] **Step 8: Verificar compilação TypeScript**

```bash
cd C:/VS_CODE/LivePosVenda && npm run typecheck 2>&1 | head -40
```

Corrigir todos os erros de tipo antes de commitar.

- [ ] **Step 9: Rodar lint**

```bash
npm run lint 2>&1 | head -30
```

Corrigir warnings/errors.

- [ ] **Step 10: Commit**

```bash
git add src/pages/CrmPipelinePage.tsx
git commit -m "feat(crm): CrmPipelinePage integra multi-funil dinâmico com seletor e admin controls"
```

---

## Task 12: Cleanup — remover código legado

**Files:**
- Delete: `src/hooks/usePipelineSettings.ts`
- Delete: `src/components/crm/PipelineStageSettings.tsx`
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Verificar que usePipelineSettings não é mais importado em nenhum arquivo**

```bash
grep -r "usePipelineSettings\|PipelineStageSettings" "C:/VS_CODE/LivePosVenda/src" --include="*.tsx" --include="*.ts"
```

Se retornar resultados (além dos próprios arquivos), remover os imports antes de deletar.

- [ ] **Step 2: Remover a aba "Pipeline" de SettingsPage.tsx**

Localizar a aba "Pipeline" em `src/pages/SettingsPage.tsx` que usa `PipelineStageSettings` e removê-la.

- [ ] **Step 3: Deletar arquivos legados**

```bash
rm "C:/VS_CODE/LivePosVenda/src/hooks/usePipelineSettings.ts"
rm "C:/VS_CODE/LivePosVenda/src/components/crm/PipelineStageSettings.tsx"
```

- [ ] **Step 4: Verificar compilação final**

```bash
npm run typecheck && npm run lint && npm run build 2>&1 | tail -20
```

Esperado: sem erros.

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "chore(crm): remove usePipelineSettings e PipelineStageSettings legados"
```

---

## Checklist de verificação manual

Após todas as tasks, verificar no browser:

- [ ] CRM abre mostrando o funil "Pós-Venda" com as 6 etapas existentes
- [ ] Tickets existentes aparecem nas colunas corretas
- [ ] Drag-and-drop de tickets entre colunas funciona
- [ ] Admin vê o ícone ⚙️; usuário comum não vê
- [ ] ⚙️ → Editar funil: abre dialog, permite renomear, reordenar/editar/excluir etapas
- [ ] ⚙️ → Criar funil: cria funil, aparece no seletor e no kanban
- [ ] ⚙️ → Acesso de usuários: lista usuários, checkboxes de funis e etapas funcionam, salva
- [ ] "▾ trocar funil" aparece somente quando há mais de 1 funil
- [ ] Usuário sem admin não acessa funil que não foi liberado
- [ ] Excluir etapa com tickets exibe toast de erro
- [ ] Excluir funil com tickets exibe toast de erro
