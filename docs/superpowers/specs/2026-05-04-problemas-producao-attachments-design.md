# Spec: Anexos em Problemas Produção

**Data:** 2026-05-04  
**Status:** Aprovado

## Objetivo

Permitir que o usuário anexe imagens (JPG, PNG) e documentos (PDF) ao formulário de Problemas Produção no TicketDetailDialog. Os arquivos chegam junto com a descrição no SquadOS.

---

## UI — Aba Problemas Produção

**Arquivo:** `src/components/tickets/TicketDetailDialog.tsx`

Abaixo do textarea, adicionar:

- Botão `+ Anexar arquivos` (ícone `Paperclip`) que aciona `<input type="file" multiple accept=".jpg,.jpeg,.png,.pdf">` oculto
- Lista de chips dos arquivos selecionados:
  - Imagem → thumbnail 40×40px + nome truncado
  - PDF → ícone `FileText` + nome + tamanho (ex: `relatorio.pdf · 240 KB`)
  - Botão `×` em cada chip para remover
- Limites: máx 5 arquivos, 10 MB por arquivo (validados no frontend)
- Arquivos são **opcionais** — descrição continua obrigatória

Estado novo: `const [producaoFiles, setProducaoFiles] = useState<File[]>([])`

---

## Fluxo de Upload (no clique "Enviar")

1. Validar limites (quantidade e tamanho) — abortar com toast se violado
2. `Promise.all` — upload paralelo de cada arquivo para Supabase Storage:
   - Bucket: `problemas-producao` (público)
   - Path: `{ticket_id}/{Date.now()}-{nome_original}`
3. Obter URL público via `supabase.storage.from("problemas-producao").getPublicUrl(path)`
4. Chamar edge function com payload expandido:

```json
{
  "description": "...",
  "client_name": "...",
  "attachments": [
    { "url": "https://...", "name": "foto.jpg", "type": "image/jpeg" }
  ]
}
```

5. Em caso de sucesso: limpar `producaoDesc` e `producaoFiles`

---

## Edge Function — `problemas-producao/index.ts`

- Aceitar campo `attachments?: { url: string; name: string; type: string }[]` no body
- Repassar para o SquadOS webhook sem transformação:

```json
{
  "description": "...",
  "client_name": "...",
  "received_at": "...",
  "attachments": [...]
}
```

---

## SquadOS — Webhook e Banco

**Tabela:** `production_problems`  
**Migration:** adicionar coluna `attachments jsonb default '[]'` se não existir  
**Webhook handler:** salvar `attachments` na coluna ao inserir o registro

---

## Tratamento de Erros

| Situação | Comportamento |
|---|---|
| Arquivo > 10 MB | Toast de erro, arquivo não adicionado |
| > 5 arquivos | Ignora excedentes, toast avisando |
| Upload falha | Aborta tudo, toast com nome do arquivo, nada salvo no Storage |
| Envio sem arquivos | `attachments: []` — funciona normalmente |

---

## Supabase Storage — Bucket `problemas-producao`

- Criar bucket público `problemas-producao` via migration SQL ou dashboard
- RLS: leitura pública (para SquadOS acessar URLs), escrita autenticada
