# Motivos de Perda — Design Spec

## Objetivo

Criar um sistema de rastreamento de motivos de perda de negociações no CRM, composto de três partes integradas: (1) página de gestão do catálogo de motivos, (2) seletor multi-escolha dentro do card de ticket, (3) widget KPI no dashboard mostrando os motivos mais frequentes.

---

## Arquitetura de Dados

### Tabela `loss_reasons`

```sql
CREATE TABLE public.loss_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- `active = false` = soft delete (mantém histórico de tickets vinculados)
- `position` reservado para futuro reordenamento; por enquanto ordenar por `label`

### Tabela `ticket_loss_reasons`

```sql
CREATE TABLE public.ticket_loss_reasons (
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  loss_reason_id UUID NOT NULL REFERENCES public.loss_reasons(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, loss_reason_id)
);
```

- PK composta impede duplicatas
- CASCADE: ao deletar um ticket ou motivo, o vínculo é removido automaticamente

### RLS

- `loss_reasons`: SELECT para `authenticated`, INSERT/UPDATE para `authenticated`
- `ticket_loss_reasons`: SELECT/INSERT/DELETE para `authenticated`

### Seed — 20 motivos padrão

1. Cliente acha que não é o momento
2. Cliente não avançou por dependência de terceiros
3. Cliente optou por adiar a decisão sem justificativa clara
4. Cliente quer muito o(s) equipamento(s), mas não tem dinheiro
5. Condição de pagamento não atendeu
6. Duplicidade de cadastro
7. Duplicidade de negociação
8. Falta de dados para contato
9. Falta de espaço
10. Fechou com o concorrente
11. Frete elevado
12. Interagiu inicialmente, mas deixou de responder
13. Lead buscou por equipamentos que não é portfólio da empresa
14. Lead desqualificado
15. Lead sem engajamento desde que entrou
16. Não conseguiu financiamento
17. Prazo de entrega não atende
18. Preço acima do esperado
19. Produto não atende
20. Sem interação após envio da proposta

---

## Página `/motivos-perda`

### Rota

`/motivos-perda` — lazy-loaded em `App.tsx`

### Arquivo

`src/pages/MotivosPerdaPage.tsx`

### Layout

- Header: título "Motivos de Perda" + botão "Novo motivo" (abre form inline no topo da lista)
- Lista de todos os motivos (`active = true` primeiro, depois inativos com visual diferenciado)
- Cada linha: label | contagem de tickets | botão editar | botão desativar/reativar
- Edição inline: clicar em editar transforma o label em `<input>` com botões Salvar/Cancelar
- Criação inline: linha no topo com input vazio + botões Salvar/Cancelar
- Contagem ao lado do label: número de tickets vinculados (incluindo cancelados)

### Hooks

- `useLossReasons()` — busca todos os motivos com contagem via LEFT JOIN
- `useCreateLossReason()` — mutation INSERT
- `useUpdateLossReason()` — mutation UPDATE (label ou active)

---

## Tab no Card de Ticket (TicketDetailDialog)

### Posição

Nova aba após as existentes, trigger: **"Mot. de Perda"** com badge `(N)` onde N = quantidade de motivos selecionados para esse ticket.

### Comportamento

- Conteúdo: grid de chips clicáveis (todos os `loss_reasons` ativos)
- Chip selecionado: estilo `bg-destructive/10 border-destructive text-destructive`
- Chip não selecionado: estilo padrão outline
- Clique: toggle imediato — se não existe vínculo, INSERT em `ticket_loss_reasons`; se existe, DELETE
- Sem botão "Salvar" — cada clique persiste imediatamente
- Loading state no chip durante a mutação
- Aba sempre visível (independente do status do ticket)

### Hooks

- `useTicketLossReasons(ticketId)` — busca motivos vinculados ao ticket
- `useToggleLossReason(ticketId)` — mutation que faz INSERT ou DELETE dependendo do estado atual

---

## Widget no Dashboard

### Arquivo

`src/components/dashboard/LossReasonsWidget.tsx`

### Dados

Query: `ticket_loss_reasons` JOIN `loss_reasons` GROUP BY `loss_reason_id`, COUNT, ordenado DESC por count.

### Layout

- Título da seção: "Principais Motivos de Perda"
- Cards KPI enfileirados: cada card exibe
  - Número grande (count)
  - Label do motivo (truncado em 2 linhas com `line-clamp-2`)
  - Cor: vermelho/destructive (tema de perda)
- Apenas os 10 primeiros (com count > 0) são exibidos
- Se não há dados: estado vazio "Nenhuma negociação perdida registrada"
- Widget adicionado à grade do dashboard abaixo das seções existentes de Pipeline CRM

### Integração no Dashboard

- `src/pages/Dashboard.tsx` (ou `MyDashboardPage.tsx`): importar e renderizar `<LossReasonsWidget />`
- Posição: após o bloco de Pipeline CRM, antes de listas operacionais

---

## Navegação

- Menu lateral: adicionar item "Motivos de Perda" no grupo CRM (junto com /crm, /tarefas, etc.)
- Componente de sidebar: `src/components/layout/AppLayout.tsx` ou arquivo de nav

---

## Fora do Escopo

- Reordenamento drag-and-drop de motivos
- Filtro de tickets por motivo de perda (página de relatórios)
- Exportação CSV de motivos
- Permissões por role (todos os `authenticated` podem ler/escrever)
