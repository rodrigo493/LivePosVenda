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

Script único `scripts/cleanup-clients-sem-telefone.mjs`:

- **Critério de exclusão:** `phone` vazio/nulo **E** `whatsapp` vazio/nulo
  **E** sem nenhum registro em `tickets` (clientes com card são pulados).
- **Modo `--dry-run` (padrão):** lista os candidatos (código, nome, criado em,
  contagem de cards) sem deletar.
- **Modo `--apply`:** executa a exclusão dos candidatos.
- O script lê credenciais do `.env`/`.env.local` por conta própria (usa
  `SUPABASE_URL` + service role key). Executado pelo usuário via
  `!node scripts/cleanup-clients-sem-telefone.mjs`.

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
