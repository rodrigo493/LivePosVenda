# Spec: Task Alert FAB

**Data:** 2026-04-27  
**Status:** Aprovado

## Visão Geral

Exibir alertas flutuantes (FABs) no CRM quando tarefas do usuário logado atingem o horário agendado ou estão atrasadas. O objetivo é garantir que nenhuma tarefa com `due_date + due_time` passe despercebida.

---

## Comportamento dos FABs

### FAB Verde — "Tarefa vence agora"
- **Forma:** Círculo verde (`#16a34a`) com ícone `✓`
- **Animação:** Glow pulsante suave (2s)
- **Aparece quando:** Existe ao menos uma tarefa do usuário com `due_date + due_time` dentro de uma janela de ±1 minuto do momento atual
- **Badge:** Contador numérico com total de tarefas nessa janela
- **Tooltip ao hover:** "N tarefa(s) vence(m) agora"

### FAB Vermelho — "Tarefa atrasada"
- **Forma:** Quadrado arredondado vermelho (`#dc2626`) com ícone `⚠`
- **Animação:** Glow pulsante rápido (1.1s)
- **Aparece quando:** Existe ao menos uma tarefa do usuário com `due_date + due_time` no passado e `status != 'concluida'`
- **Badge:** Contador numérico com total de tarefas atrasadas
- **Tooltip ao hover:** "N tarefa(s) atrasada(s)"

### Coexistência
Ambos os FABs podem aparecer simultaneamente, empilhados verticalmente:
- Vermelho acima (posição `bottom: ~70px`)
- Verde abaixo (posição `bottom: ~20px`)
- Posição horizontal: canto inferior esquerdo, logo após a sidebar (`left: ~66px`)

---

## Posicionamento

| FAB | Posição |
|-----|---------|
| Verde | `bottom-5 left-[66px]` |
| Vermelho | `bottom-[70px] left-[66px]` |

O FAB do WhatsApp existente permanece no canto inferior direito (`bottom-6 right-24`) sem conflito.

---

## Fluxo de Dados

### Hook `useTaskAlerts`

```typescript
// src/hooks/useTaskAlerts.ts
{
  dueNow: TaskRow[]    // tarefas na janela ±1 min
  overdue: TaskRow[]   // tarefas com due passado, não concluídas
  dismissed: Set<string>
  dismiss: (ids: string[]) => void
}
```

- **Query:** busca tarefas onde `assigned_to = user.id` e `status != 'concluida'`
- **Intervalo:** `refetchInterval: 60_000` (React Query)
- **Classificação:** calculada client-side a cada render com base no `Date.now()`
- **`overdue` (prioridade maior):** `dueTimestamp < now - 60_000ms` — tarefa venceu há mais de 1 minuto
- **`dueNow`:** `now - 60_000ms <= dueTimestamp <= now + 60_000ms` — e NOT overdue
- **Prioridade:** se uma tarefa cair em ambos os critérios (borda exata), é classificada como `overdue`

### Estado de Dispensado

- Armazenado em `localStorage` com chave `task-alerts-dismissed` (array de IDs)
- Ao recarregar o app: IDs dispensados são filtrados removendo tarefas já concluídas (limpeza automática)
- Tarefas ainda pendentes voltam a aparecer no próximo carregamento do app

---

## Navegação ao Clicar

1. FAB some imediatamente (otimista — `dismiss(ids)` chamado antes da navegação)
2. Navega para `/tarefas` via `useNavigate` com `state: { highlightIds: string[] }`
3. `TasksAgendaPage` lê o state e aplica destaque visual nos cards:
   - Borda verde para tarefas de `dueNow`
   - Borda vermelha para tarefas de `overdue`
4. Se o usuário já está em `/tarefas`: apenas dispensa e destaca (sem renavegar)

---

## Escopo

- **Usuários:** Apenas tarefas atribuídas ao usuário logado (`assigned_to = user.id`)
- **Admins:** Mesma regra — veem só as próprias tarefas no FAB
- **Status ignorados:** Tarefas com `status = 'concluida'` nunca geram alerta

---

## Componentes Novos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/hooks/useTaskAlerts.ts` | Query + classificação + estado dismissed |
| `src/components/tasks/TaskAlertFab.tsx` | Renderização dos dois FABs |

## Integração

- `TaskAlertFab` montado em `src/components/layout/AppLayout.tsx`, junto ao `UnreadFab` já existente

---

## Fora do Escopo

- Notificações push / desktop notifications
- Som de alerta
- Alertas para tarefas de outros usuários (admin)
- Antecipação (avisos antes do horário)
- Persistência do dismissed no banco de dados
