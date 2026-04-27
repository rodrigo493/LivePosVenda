# Laivinha Chat — Floating Widget de Consulta IA

**Data:** 2026-04-27  
**Status:** Aprovado  
**Escopo:** Widget global de chat com a Laivinha, disponível em todas as telas autenticadas do Pós-Venda

---

## 1. Visão Geral

Widget flutuante (floating button + chat bubble) que permite ao staff do Pós-Venda consultar a Laivinha em linguagem natural sobre problemas de equipamentos. A Laivinha busca na base de memória (`memoria_problema_solucao`, 224+ casos reais) e responde usando Gemini 2.5 Flash via OpenRouter.

O chat suporta anexo de imagens e vídeos: o usuário pode enviar mídia junto com a pergunta e a Laivinha analisa visualmente.

Histórico de conversa existe apenas na sessão atual (sem persistência em banco).

---

## 2. Arquitetura

```
[Staff] → clica botão flutuante
       → digita pergunta + (opcional) anexa imagem/vídeo
       → upload de mídia para Storage bucket posvenda-evidencias
                path: chat/{user_id}/{ts}_{filename}
       → supabase.functions.invoke("posvenda-chat", { message, history, media[] })
       → Edge Function posvenda-chat
            ├─ valida JWT do usuário
            ├─ busca na memoria_problema_solucao (model ilike + FTS ts_search)
            ├─ carrega soul_prompt da Laivinha (agentes_config WHERE nome='PosVenda')
            └─ chama OpenRouter gemini-2.5-flash (multimodal se media presente)
       → reply exibido no chat bubble
```

**Componentes novos:**
| Componente | Tipo | Descrição |
|---|---|---|
| `posvenda-chat` | Edge Function | Busca memória + chamada IA multimodal |
| `<LaivinhaChat />` | React Component | Widget flutuante completo |

**Sem nova tabela** — histórico vive em `useState<Message[]>`.

---

## 3. Edge Function: `posvenda-chat`

### Auth
`verify_jwt = true` (padrão). Usa o JWT do usuário logado. Operações de banco com service role key server-side.

### Input
```typescript
{
  message: string;                          // pergunta do usuário
  history: { role: "user"|"assistant"; content: string }[];  // últimas 10 trocas
  media?: { type: "image"|"video"; url: string }[];          // URLs do Storage
}
```

### Output
```typescript
{ reply: string; sources: number }
// sources = número de registros de memória usados
```

### Fluxo
1. Valida JWT (`createClient` com anon key + auth header)
2. Busca `memoria_problema_solucao`:
   - Tenta ilike por modelo detectado na mensagem
   - Fallback: FTS `textSearch('ts_search', palavras, { config: 'portuguese', type: 'plain' })`
   - Retorna até 3 registros com `aprovada = true`
3. Carrega `soul_prompt` de `agentes_config WHERE nome = 'PosVenda' AND ativo = true`
4. Monta system prompt: `soul_prompt` + soluções conhecidas (se houver)
5. Monta messages array:
   - `{ role: "system", content: systemPrompt }`
   - Histórico (últimas 10 mensagens)
   - Mensagem atual — se tiver `media`, usa formato multimodal:
     ```json
     { "role": "user", "content": [
       { "type": "text", "text": "..." },
       { "type": "image_url", "image_url": { "url": "https://..." } }
     ]}
     ```
6. POST para `https://openrouter.ai/api/v1/chat/completions`, modelo `google/gemini-2.5-flash`, `max_tokens: 500`, `temperature: 0.2`
7. **Fallback** (AI_API_KEY ausente ou erro): retorna top-3 soluções da base formatadas como texto markdown

### Limites práticos
- Vídeos até ~50 MB (acima pode causar timeout de 30s na edge function)
- Histórico truncado em 10 mensagens para controlar context window

---

## 4. Componente React: `<LaivinhaChat />`

### Localização
`src/components/laivinha/LaivinhaChat.tsx`  
Injetado em `src/App.tsx` dentro da rota autenticada, fora dos switches de página — sempre presente.

### Estado local (sessão)
```typescript
type Message = { role: "user"|"assistant"; content: string; media?: string[] };
const [open, setOpen]       = useState(false);
const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
const [input, setInput]     = useState("");
const [loading, setLoading] = useState(false);
const [uploads, setUploads] = useState<string[]>([]);  // URLs pendentes
```

### Layout

**Botão flutuante:**
- `fixed bottom-6 right-6 z-50`
- Círculo 56px, fundo violeta (`bg-violet-600 hover:bg-violet-700`)
- Ícone `Brain` (lucide-react)
- Ponto verde se `AI_API_KEY` disponível (verificado via env pública ou sempre mostrado)

**Chat bubble (condicional `open`):**
- `fixed bottom-20 right-6 z-50`
- `w-[380px] h-[520px]` — não redimensionável
- `rounded-2xl shadow-2xl border bg-background flex flex-col`

**Header:**
- Ícone Brain violeta + "Laivinha" + botão fechar
- Subtítulo: "Assistente técnica de pós-venda"

**Área de mensagens:**
- `ScrollArea` com `flex-1`
- Mensagens do assistente: alinhadas à esquerda, fundo `bg-violet-50 border-violet-100`
- Mensagens do usuário: alinhadas à direita, fundo `bg-primary text-primary-foreground`
- Thumbnails inline para imagens; chip de vídeo para vídeos
- Loading: 3 pontos animados (dots) enquanto aguarda resposta

**Input:**
- `Textarea` autoResize máx 3 linhas
- `Enter` envia, `Shift+Enter` quebra linha
- Botão 📎: abre `<input type="file" accept="image/*,video/*" multiple />`
- Após seleção: upload imediato para Storage → thumbnail aparece acima do input
- Botão enviar: desabilitado durante loading ou input vazio sem uploads

**Mensagem de boas-vindas (hardcoded, sem chamar IA):**
> "Olá! Sou a Laivinha 🤖. Pode me perguntar sobre qualquer problema de equipamento — roldanas, elásticos, peças, defeitos comuns. Também consigo analisar fotos e vídeos que você enviar."

---

## 5. Integração com Storage

Reutiliza o bucket `posvenda-evidencias` (já existe, público, 50MB limit).

Path para arquivos do chat: `chat/{user.id}/{timestamp}_{safeName}`

Upload via `supabase.storage.from('posvenda-evidencias').upload(path, file)` direto do client. URL pública via `getPublicUrl(path)`.

---

## 6. Config Supabase

Nenhuma alteração em `config.toml` necessária (`verify_jwt = true` é padrão para a nova função).

`AI_API_KEY` já está configurado como secret do projeto (usado pelo `posvenda-agent-executor`).

---

## 7. Arquivos Afetados

| Arquivo | Ação |
|---|---|
| `supabase/functions/posvenda-chat/index.ts` | Criar |
| `src/components/laivinha/LaivinhaChat.tsx` | Criar |
| `src/App.tsx` | Editar — injetar `<LaivinhaChat />` |

Sem migrations de banco. Sem alterações em `TicketDetailDialog.tsx`.

---

## 8. Fluxo de Erro

| Situação | Comportamento |
|---|---|
| `AI_API_KEY` não configurado | Fallback: exibe soluções da base formatadas |
| OpenRouter retorna erro | Fallback igual acima |
| Upload de mídia falha | Toast de erro, mensagem enviada sem a mídia |
| Usuário não autenticado | Edge function retorna 401, widget mostra erro inline |
| Vídeo > 50MB | Bloqueado no client antes do upload com mensagem de aviso |
