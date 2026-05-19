# Página de Clientes — Coluna Telefone e Limpeza

**Data:** 2026-05-18
**Branch:** `feat/clientes-coluna-telefone`

## Contexto

A página de Clientes (`src/pages/ClientsPage.tsx`) não exibe telefone, embora a
tabela `clients` já tenha as colunas `phone` e `whatsapp`. O usuário pediu
quatro coisas; a investigação mostrou que duas já funcionam.

### Diagnóstico

| Pedido | Situação |
|---|---|
| Exibir telefone | Coluna existe no banco, falta exibir na UI. **Fazer.** |
| Importar contatos dos cards do CRM | Todo `ticket` já referencia um `client` existente (`client_id NOT NULL`). Admin já lista todos os clientes. Nada a importar. **Só validar.** |
| Novo card salvar nome+telefone | Já implementado em `CrmPipelinePage.tsx` (dialog "Novo Cliente") e na edge function `create-crm-card`. **Só validar.** |
| Deletar clientes sem telefone | Trabalho real. **Fazer.** |

## Escopo

### Parte 1 — Coluna Telefone (`ClientsPage.tsx`)

- Adicionar coluna "Telefone" no cabeçalho da tabela, logo após "Nome".
- Valor exibido: `client.whatsapp || client.phone || "—"` (coluna unificada).
- Incluir telefone no filtro de busca: comparar dígitos normalizados do termo
  contra `phone` e `whatsapp` normalizados.

### Parte 2 — Limpeza de clientes sem telefone

Arquivo SQL `scripts/cleanup-clients-sem-telefone.sql`, executado no SQL Editor
do Supabase. (O `.env` local só tem a chave pública/anon — sem service role
key, um script Node não consegue deletar em massa por causa do RLS. O SQL
Editor roda com privilégio total e é mais transparente.)

- **Critério de exclusão:** `phone` sem nenhum dígito **E** `whatsapp` sem
  nenhum dígito **E** sem nenhum registro em `tickets` (clientes com card são
  pulados).
- **Passo 1 — preview:** `SELECT` lista os candidatos (código, nome, email,
  criado em) sem deletar.
- **Passo 2 — exclusão:** `DELETE` (comentado no arquivo) executado só após
  conferir o preview.

### Fora de escopo

- Alterações de schema (colunas já existem).
- Edge functions.
- Fluxo de criação de card (já grava nome+telefone).

## Critérios de aceite

1. A página de Clientes exibe a coluna "Telefone" preenchida para clientes que
   têm `phone` ou `whatsapp`.
2. A busca encontra clientes por número de telefone.
3. O script lista corretamente em dry-run e exclui apenas clientes sem telefone
   e sem cards quando aplicado.
4. Build (`npm run build`) passa sem erros.
