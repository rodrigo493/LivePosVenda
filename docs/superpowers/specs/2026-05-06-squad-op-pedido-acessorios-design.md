# Spec: Integração SquadOS — Botão OP e Pedido Acessórios

**Data:** 2026-05-06
**Projeto:** LivePosVenda + SquadOS
**Status:** Aprovado

---

## Contexto

O LivePosVenda possui páginas de detalhe PA (Pedido Acessórios), PD (Pedido Direto) e PG (Pedido Garantia). Cada página tem:

1. **Tabela de itens** com botão "OP" por item — atualmente chama `notifySquad` apontando para o workflow "Pós Venda"
2. **Formulário Nomus** que cria um pedido de venda no ERP — atualmente chama `notifySquad` apontando para o workflow "Pós Venda"

Ambos os comportamentos precisam ser redirecionados para workflows específicos no SquadOS.

---

## Objetivos

1. **Botão OP (itens):** ao clicar, criar/atualizar instância no workflow "Gerar OP/Compra", step "Solicitar OP/Compra", agrupado por pedido.
2. **Submit Nomus:** ao criar pedido no Nomus com sucesso, criar/atualizar instância no workflow "Fluxo Pedido Acessórios", step "Atualizar Pedido".

Ambos os templates já existem no SquadOS.

---

## Arquitetura

```
Browser (PA/PD/PG)
  ├── Botão OP → supabase.functions.invoke("squad-notify", { target: "gerar-op", ... })
  └── Submit Nomus → supabase.functions.invoke("squad-notify", { target: "pedido-acessorios", ... })

Edge Function squad-notify
  ├── target: "gerar-op"         → POST squad.liveuni.com.br/api/gerar-op
  ├── target: "pedido-acessorios" → POST squad.liveuni.com.br/api/pedido-acessorios
  └── target: "pos-venda" (default) → POST squad.liveuni.com.br/api/pos-venda (comportamento atual)

SquadOS
  ├── /api/gerar-op         → template ILIKE '%Gerar OP%'
  └── /api/pedido-acessorios → template ILIKE '%Pedido Acess%'
```

---

## Fluxo 1 — Botão OP

### Gatilho
Clique no botão "OP" por item na tabela de itens, nas páginas PA, PD e PG.

### Payload enviado
```json
{
  "reference": "PD-0042",
  "url": "https://posvenda.liveuni.com.br/pedidos-direto/uuid",
  "notes": "Produzir/Comprar: V12 Pro"
}
```

### Comportamento no SquadOS (`/api/gerar-op`)
- Busca template `ILIKE '%Gerar OP%'` com `is_active = true`
- Se não existe template → retorna 200 `{ ignored: true }` (silencioso)
- Se não existe instância `running` para essa referência → cria nova instância (step 1 = "Solicitar OP/Compra")
- Se já existe instância `running` → faz append nas notes da instância existente: `notes_existentes + "\n" + nova_note`, retorna 200 `{ merged: true }`
- **Não retorna 409** (diferente do pos-venda)

### Agrupamento
Uma instância por referência de pedido. Vários itens do mesmo pedido acumulam notes na mesma instância.

---

## Fluxo 2 — Submit Nomus

### Gatilho
Sucesso na criação/atualização do pedido de venda no Nomus (após o `handleNomusSubmit` ter retornado sem erro), nas páginas PA, PD e PG.

### Payload enviado
```json
{
  "reference": "PD-0042",
  "url": "https://posvenda.liveuni.com.br/pedidos-direto/uuid",
  "notes": "Pedido criado no Nomus"
}
```

### Comportamento no SquadOS (`/api/pedido-acessorios`)
- Busca template `ILIKE '%Pedido Acess%'` com `is_active = true`
- Se não existe template → retorna 200 `{ ignored: true }` (silencioso)
- Se não existe instância `running` → cria nova instância (step 1 = "Atualizar Pedido")
- Se já existe instância `running` → merge nas notes, retorna 200 `{ merged: true }`

---

## Mudanças por arquivo

### SquadOS

| Arquivo | Mudança |
|---------|---------|
| `src/app/api/gerar-op/route.ts` | Novo — modelado em `/api/pos-venda`, sem 409 no duplicate |
| `src/app/api/pedido-acessorios/route.ts` | Novo — modelado em `/api/pos-venda` |

### LivePosVenda — Edge Function

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/squad-notify/index.ts` | Aceita `target?: string` no body; roteia para URL correta |

### LivePosVenda — Frontend

| Arquivo | Mudança |
|---------|---------|
| `src/lib/squadNotify.ts` | Adiciona `target?: "pos-venda" \| "gerar-op" \| "pedido-acessorios"` ao tipo `NotifySquadParams` |
| `src/pages/PADetailPage.tsx` | Botão OP → `target: "gerar-op"`; submit Nomus → chama `notifySquad` com `target: "pedido-acessorios"` |
| `src/pages/PDDetailPage.tsx` | Idem PA |
| `src/pages/PGDetailPage.tsx` | Idem PA |

---

## Tratamento de Erros

- Template não encontrado → silencioso (200 `ignored: true`), não bloqueia o usuário
- Falha de rede → `toast.warning` já existente no `notifySquad`
- SquadOS fora do ar → erro logado, toast de aviso, não bloqueia criação do pedido Nomus

---

## Fora de Escopo

- Criação dos templates no SquadOS admin (já existem)
- Mudanças no comportamento do botão "Salvar e Enviar ao Squad" (squad_notes) — continua como está
- Novos env vars (reutiliza `SQUAD_TOKEN` / `POS_VENDA_WEBHOOK_SECRET`)
