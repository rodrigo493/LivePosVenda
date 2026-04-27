# WhatsApp Unread Notifications — Design Spec

## Goal

Fazer com que mensagens WhatsApp não lidas sejam visíveis em qualquer página do app: conversas sobem ao topo no Chat, cards sobem ao topo da coluna no CRM, e um botão flutuante global indica o total de não lidas com mini-lista clicável.

## Architecture

O problema raiz é que `whatsapp_messages` não está na publication do Supabase realtime — sem isso os subscriptions `postgres_changes` existentes não disparam. A correção é uma migration de uma linha. Como fallback, `refetchInterval: 15_000` é adicionado aos hooks relevantes.

O visual "não lida" (borda laranja escura `#c2410c` pulsante com glow + fundo tingido + badge) é aplicado via classes CSS + `@keyframes`. A reordenação no Chat usa `framer-motion` `layout` prop para animação suave. No CRM o sort client-side já existe e passa a funcionar após o fix do realtime.

O botão flutuante global (`UnreadFab`) lê `useWhatsAppConversations` (já carregado globalmente), filtra conversas com `unread_count > 0`, exibe contagem total. Ao clicar expande mini-lista; clicar numa conversa navega para `/chat` com `?client=<id>` que o `ChatPage` lê para pré-selecionar.

## Tech Stack

React 18 + TypeScript, framer-motion (já instalado), react-router-dom `useNavigate` + `useSearchParams`, Supabase PostgreSQL realtime publication, @tanstack/react-query `refetchInterval`.

---

## 1. Database — habilitar realtime

**Migration:** `supabase/migrations/20260427000060_enable_whatsapp_realtime.sql`

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
```

Isso faz os subscriptions `postgres_changes` existentes em `ChatPage.tsx` e `CrmPipelinePage.tsx` dispararem de verdade quando uma mensagem é inserida.

---

## 2. Hook — refetchInterval fallback

**Arquivo:** `src/hooks/useWhatsAppConversations.ts`

Adicionar `refetchInterval: 15_000` ao `useQuery` existente. Sem alterar nenhuma lógica de ordenação ou `unread_count` (já corretas).

---

## 3. Visual "não lida" — Chat page

**Arquivo:** `src/pages/ChatPage.tsx`

Substituir as classes do item de conversa com `unread_count > 0`:

- **Container:** `bg-[#f97316]/10 border border-[#c2410c] animate-unread-pulse`
- **Avatar:** adicionar dot `absolute top-[-1px] right-[-1px] w-[10px] h-[10px] bg-[#c2410c] rounded-full border-2 border-background animate-dot-pulse`
- **Nome:** `text-[#f97316] font-bold`
- **Timestamp:** `text-[#f97316] font-semibold`
- **Badge:** `bg-[#c2410c] text-white` (já existe, só cor muda)
- **Animação suave de reordenação:** envolver cada item com `motion.div` com prop `layout` e `key={conv.client_id}`

**Keyframes** adicionados em `src/index.css`:

```css
@keyframes unread-border-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(194,65,12,.8), 0 0 8px 2px rgba(234,88,12,.4); border-color: #c2410c; }
  50%       { box-shadow: 0 0 0 4px rgba(194,65,12,0), 0 0 16px 6px rgba(234,88,12,.7); border-color: #ea580c; }
}
@keyframes unread-dot-pulse {
  0%, 100% { transform: scale(1);   box-shadow: 0 0 0 0 rgba(194,65,12,.6); }
  50%       { transform: scale(1.2); box-shadow: 0 0 0 4px rgba(194,65,12,0); }
}
.animate-unread-pulse { animation: unread-border-pulse 1.8s ease-in-out infinite; }
.animate-dot-pulse    { animation: unread-dot-pulse 1.8s ease-in-out infinite; }
```

---

## 4. Visual "não lida" — CRM Kanban cards

**Arquivo:** `src/pages/CrmPipelinePage.tsx` — bloco de renderização do card (linhas ~725–760)

Substituir as classes condicionais existentes (`border-emerald-400 ring-1 ring-emerald-300`) pelo novo tratamento quando `unreadWpp > 0`:

- **Container do card:** `bg-[#f97316]/[0.06] border-[#c2410c] animate-unread-pulse`
- **Header de não lida:** faixa no topo do card com dot pulsante + texto "N mensagens não lidas" em laranja
- **Badge:** `bg-[#c2410c] text-white`

A ordenação `_unreadWhatsapp` dentro de cada coluna já existe e passa a funcionar após o fix do realtime.

---

## 5. Hook global de realtime — useWhatsAppRealtimeSync

**Arquivo novo:** `src/hooks/useWhatsAppRealtimeSync.ts`

Hook que contém APENAS o subscription realtime e o `refetchInterval`. Chamado uma vez no topo do app (em `AppRoutes` dentro de `AppLayout`) para garantir que o canal fique ativo independente de qual página o usuário está.

```typescript
export function useWhatsAppRealtimeSync() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("whatsapp-global-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
        qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);
}
```

**Wiring:** Chamar `useWhatsAppRealtimeSync()` dentro de `AppLayout` ou num componente-wrapper sempre montado. Os subscriptions existentes em `ChatPage` e `CrmPipelinePage` podem ser removidos (redundantes).

---

## 6. Botão flutuante global — UnreadFab

**Arquivo novo:** `src/components/whatsapp/UnreadFab.tsx`

```
Props: nenhuma
State: isOpen (boolean) — controla mini-lista expandida
Data: useWhatsAppConversations() — filtra unread_count > 0
```

Comportamento:
- Se `totalUnread === 0`: renderiza `null` (FAB some quando tudo lido)
- Posição: `fixed bottom-20 right-6 z-40` — acima do conteúdo mas abaixo do `LaivinhaChat` (que usa `z-50`). Ajustar após verificar posição real do LaivinhaChat.
- **Fechado:** botão pill laranja com `💬 N não lidas`
- **Aberto:** mini-lista acima do botão com até 5 conversas não lidas, cada uma mostrando nome + preview truncado + badge de contagem
- Clicar numa conversa: `navigate('/chat?client=<client_id>')` + fecha o fab
- Clique fora (`onClick` no overlay `fixed inset-0 z-30`): fecha o fab

**Wiring em `App.tsx`:** `<UnreadFab />` adicionado junto ao `<LaivinhaChat />` dentro do `CrmPermissionsProvider`.

---

## 7. ChatPage — pré-seleção por query param

**Arquivo:** `src/pages/ChatPage.tsx`

Adicionar leitura de `useSearchParams`:

```typescript
const [searchParams] = useSearchParams();
const clientParam = searchParams.get("client");
```

No `useEffect` de inicialização: se `clientParam` estiver presente e existir nas conversas, selecionar essa conversa automaticamente (substituindo o comportamento atual que seleciona a primeira).

---

## Data Flow

```
Nova mensagem WhatsApp (webhook INSERT)
  └── supabase_realtime publication (fix migration)
      └── postgres_changes subscription (useWhatsAppRealtimeSync — global)
          ├── invalidate ["whatsapp-conversations"]
          │   └── useWhatsAppConversations refetch → lista reordenada + unread_count
          │       ├── ChatPage: itens com unread sobem + visual laranja pulsante
          │       └── UnreadFab: totalUnread > 0 → FAB aparece com contagem
          └── invalidate ["pipeline-tickets"]
              └── CrmPipelinePage: _unreadWhatsapp recalculado → card sobe na coluna + visual laranja pulsante

Usuário clica conversa no Chat
  └── markConversationRead(clientId) → whatsapp_last_read_at = now()
      └── invalidate ["whatsapp-conversations"] → unread_count zerado → visual some

Usuário clica no UnreadFab → navega para /chat?client=<id>
  └── ChatPage lê ?client → pré-seleciona conversa → markConversationRead
```

---

## Out of Scope

- Som/notificação de sistema (push notification do browser)
- Marcar como lido diretamente pelo UnreadFab sem abrir o chat
- Filtro "somente não lidas" permanente no Chat
- Indicador de não lidas na sidebar (já há badge de unread no item Chat)
