# Problemas Produção — Anexos (Imagens e PDFs)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar upload de JPG, PNG e PDF na aba "Problemas Produção" do TicketDetailDialog, com os arquivos chegando como URLs no payload enviado ao SquadOS.

**Architecture:** O usuário seleciona arquivos antes de enviar; ao clicar "Enviar", os arquivos sobem em paralelo para o bucket Supabase Storage `problemas-producao`, os URLs públicos são incluídos no payload da edge function, que os repassa ao SquadOS. O SquadOS já salva o body completo em `crm_payload` — nenhuma migration no SquadOS é necessária.

**Tech Stack:** React + TypeScript, Supabase Storage SDK, Supabase Edge Functions (Deno), lucide-react

---

## Arquivos modificados

| Arquivo | Ação |
|---|---|
| `supabase/migrations/20260504000001_problemas_producao_bucket.sql` | Criar |
| `supabase/functions/problemas-producao/index.ts` | Modificar |
| `src/components/tickets/TicketDetailDialog.tsx` | Modificar |

---

## Task 1: Criar bucket Supabase Storage

**Arquivo:**
- Criar: `supabase/migrations/20260504000001_problemas_producao_bucket.sql`

- [ ] **Criar o arquivo de migration:**

```sql
-- Migration: bucket problemas-producao para anexos de problemas de produção

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'problemas-producao',
  'problemas-producao',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'staff upload problemas-producao'
  ) THEN
    CREATE POLICY "staff upload problemas-producao"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'problemas-producao'
        AND public.is_staff(auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'public read problemas-producao'
  ) THEN
    CREATE POLICY "public read problemas-producao"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'problemas-producao');
  END IF;
END $$;
```

- [ ] **Aplicar migration no Supabase remoto:**

```bash
npx supabase db push --linked
```

Saída esperada: `Applying migration 20260504000001_problemas_producao_bucket.sql... done`

- [ ] **Commit:**

```bash
git add supabase/migrations/20260504000001_problemas_producao_bucket.sql
git commit -m "feat(storage): bucket problemas-producao para anexos"
```

---

## Task 2: Atualizar edge function para repassar attachments

**Arquivo:**
- Modificar: `supabase/functions/problemas-producao/index.ts`

- [ ] **Substituir o conteúdo completo do arquivo:**

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://posvenda.liveuni.com.br',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SQUAD_URL = 'https://squad.liveuni.com.br/api/problemas-producao/webhook';

interface Attachment {
  url: string;
  name: string;
  type: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { description, client_name, attachments } = body as {
      description?: string;
      client_name?: string;
      attachments?: Attachment[];
    };

    if (!description?.trim() || !client_name?.trim()) {
      return jsonResponse({ error: 'description e client_name são obrigatórios' }, 400);
    }

    const res = await fetch(SQUAD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': 'squad-problemas-webhook-2026',
      },
      body: JSON.stringify({
        description: description.trim(),
        client_name: client_name.trim(),
        received_at: new Date().toISOString(),
        attachments: attachments ?? [],
      }),
    });

    if (res.status === 401) return jsonResponse({ error: 'Autenticação inválida com o SquadOS.' }, 401);
    if (res.status === 400) return jsonResponse({ error: 'Campo obrigatório faltando na requisição.' }, 400);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return jsonResponse({ error: `SquadOS retornou ${res.status}: ${text.slice(0, 300)}` }, 502);
    }

    const data = await res.json().catch(() => ({}));
    return jsonResponse({ id: data?.id ?? null }, 201);

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return jsonResponse({ error: msg }, 500);
  }
});
```

- [ ] **Deploy da edge function:**

```bash
npx supabase functions deploy problemas-producao --no-verify-jwt
```

Saída esperada: `Deployed Functions problemas-producao`

- [ ] **Commit:**

```bash
git add supabase/functions/problemas-producao/index.ts
git commit -m "feat(edge): problemas-producao repassa attachments ao SquadOS"
```

---

## Task 3: UI — seletor de arquivos e chips de preview

**Arquivo:**
- Modificar: `src/components/tickets/TicketDetailDialog.tsx`

- [ ] **Adicionar `Paperclip` ao import de lucide-react** (linha ~3):

Localizar a linha:
```typescript
  Clock, User, Tag, FileText, MessageSquare, Calendar, Package,
  AlertTriangle, Send, Pencil, Check, X, Wrench, Shield, ClipboardList,
```

Substituir por:
```typescript
  Clock, User, Tag, FileText, MessageSquare, Calendar, Package,
  AlertTriangle, Send, Pencil, Check, X, Wrench, Shield, ClipboardList, Paperclip,
```

- [ ] **Adicionar estado e ref** após `const [producaoSending, setProducaoSending] = useState(false);` (~linha 394):

```typescript
const [producaoFiles, setProducaoFiles] = useState<File[]>([]);
const fileInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Adicionar helper `formatBytes`** logo antes do `return (` do componente (antes da JSX principal, ~linha 1100):

```typescript
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

> Nota: como está dentro da função do componente, declare antes do `return`.

- [ ] **Adicionar handler `handleFileSelect`** logo após o helper `formatBytes`:

```typescript
const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
  const selected = Array.from(e.target.files ?? []);
  const remaining = 5 - producaoFiles.length;

  if (selected.length > remaining) {
    toast.warning(`Máximo 5 arquivos. ${selected.length - remaining} ignorado(s).`);
  }

  const toAdd = selected.slice(0, remaining).filter((file) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error(`"${file.name}" excede 10 MB e foi ignorado.`);
      return false;
    }
    return true;
  });

  setProducaoFiles((prev) => [...prev, ...toAdd]);
  e.target.value = "";
};
```

- [ ] **Substituir a tab "Problemas Produção"** (localizar pelo bloco que começa em `{/* ── Tab: Problemas Produção`):

```tsx
{/* ── Tab: Problemas Produção ──────────────── */}
<TabsContent value="problemas-producao" className="mt-0 space-y-4">
  <div>
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
      Problemas Produção
    </p>
    <p className="text-xs text-muted-foreground mb-3">
      Descreva o problema de produção para enviar ao SquadOS.
    </p>
    <Textarea
      placeholder="Descreva o problema de produção..."
      value={producaoDesc}
      onChange={(e) => setProducaoDesc(e.target.value)}
      className="min-h-[140px] text-sm resize-none"
    />

    {/* Seletor de arquivos */}
    <div className="mt-2">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.pdf"
        className="hidden"
        onChange={handleFileSelect}
      />
      <button
        type="button"
        disabled={producaoSending || producaoFiles.length >= 5}
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
      >
        <Paperclip className="h-3.5 w-3.5" />
        Anexar arquivos
        {producaoFiles.length > 0 && (
          <span className="text-[10px]">({producaoFiles.length}/5)</span>
        )}
      </button>

      {/* Chips de preview */}
      {producaoFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {producaoFiles.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 bg-muted rounded-md px-2 py-1.5 text-xs max-w-[180px]"
            >
              {file.type.startsWith("image/") ? (
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="h-8 w-8 rounded object-cover shrink-0"
                />
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-medium">{file.name}</p>
                <p className="text-[9px] text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              <button
                onClick={() =>
                  setProducaoFiles((prev) => prev.filter((_, idx) => idx !== i))
                }
                className="text-muted-foreground hover:text-destructive shrink-0 ml-1"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>

    <div className="flex justify-end mt-3">
      <Button
        onClick={handleEnviarProducao}
        disabled={producaoSending || !producaoDesc.trim()}
        className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
        size="sm"
      >
        <Send className="h-3.5 w-3.5" />
        {producaoSending ? "Enviando..." : "Enviar para SquadOS"}
      </Button>
    </div>
  </div>
</TabsContent>
```

- [ ] **Verificar TypeScript:**

```bash
npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Commit:**

```bash
git add src/components/tickets/TicketDetailDialog.tsx
git commit -m "feat(ui): seletor de arquivos na aba Problemas Produção"
```

---

## Task 4: Upload + envio integrado

**Arquivo:**
- Modificar: `src/components/tickets/TicketDetailDialog.tsx` — função `handleEnviarProducao`

- [ ] **Substituir completamente a função `handleEnviarProducao`** (localizar pelo comentário `// ── Problemas Produção: envia para SquadOS`):

```typescript
// ── Problemas Produção: envia para SquadOS ───────────────────
const handleEnviarProducao = async () => {
  if (!producaoDesc.trim()) { toast.error("Descreva o problema antes de enviar."); return; }
  const clientName = clientProfile?.name || ticket?.clients?.name || "";
  setProducaoSending(true);
  try {
    // Upload paralelo de arquivos para Storage
    const attachments: { url: string; name: string; type: string }[] = [];
    if (producaoFiles.length > 0) {
      const results = await Promise.all(
        producaoFiles.map(async (file) => {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${ticket.id}/${Date.now()}-${safeName}`;
          const { error: uploadError } = await supabase.storage
            .from("problemas-producao")
            .upload(path, file);
          if (uploadError) throw new Error(`Falha ao enviar "${file.name}": ${uploadError.message}`);
          const { data: urlData } = supabase.storage
            .from("problemas-producao")
            .getPublicUrl(path);
          return { url: urlData.publicUrl, name: file.name, type: file.type };
        })
      );
      attachments.push(...results);
    }

    const { data, error } = await supabase.functions.invoke("problemas-producao", {
      body: { description: producaoDesc.trim(), client_name: clientName, attachments },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    toast.success("Problema enviado ao SquadOS com sucesso");
    setProducaoDesc("");
    setProducaoFiles([]);
  } catch (err: any) {
    toast.error(err?.message || "Falha ao enviar para o SquadOS.");
  } finally {
    setProducaoSending(false);
  }
};
```

- [ ] **Verificar TypeScript:**

```bash
npx tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Commit:**

```bash
git add src/components/tickets/TicketDetailDialog.tsx
git commit -m "feat(logic): upload de anexos no envio para SquadOS"
```

---

## Task 5: Deploy em produção

- [ ] **Push para o repositório remoto:**

```bash
git push origin main
```

- [ ] **Deploy na VPS com build limpo (sem cache):**

```python
import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.199.187.99', username='root', key_filename=r'C:/Users/rodri/.ssh/squad_vps')

cmd = (
    'cd /opt/posvenda && git pull origin main 2>&1 && '
    'docker build --no-cache '
    '--build-arg VITE_SUPABASE_URL=https://ehqkggiuouczmafmlzls.supabase.co '
    '--build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TBXHRRXXZEok0JWK08lbeQ_tcJdv4gZ '
    '--build-arg VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVocWtnZ2l1b3Vjem1hZm1semxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzODk3ODksImV4cCI6MjA5MTk2NTc4OX0.bavaN4ODiWlLD82YbN7LwjEyQLuUNZMv_b82NXIDxic '
    '-t posvenda:latest . 2>&1 | tail -10'
)
_, stdout, stderr = client.exec_command(cmd, timeout=300)
print(stdout.read().decode('utf-8', errors='replace'))
client.close()
```

Saída esperada: termina com `naming to docker.io/library/posvenda:latest done`

- [ ] **Atualizar serviço Docker Swarm:**

```python
import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.199.187.99', username='root', key_filename=r'C:/Users/rodri/.ssh/squad_vps')

_, stdout, _ = client.exec_command(
    'docker service update --image posvenda:latest --force posvenda_posvenda',
    timeout=90
)
print(stdout.read().decode('utf-8', errors='replace'))
client.close()
```

Saída esperada: `Service posvenda_posvenda converged`
