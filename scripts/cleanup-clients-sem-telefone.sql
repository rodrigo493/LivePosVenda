-- ============================================================
-- Limpeza de clientes sem telefone — LivePosVenda
-- ------------------------------------------------------------
-- Critério de exclusão:
--   * phone   sem nenhum dígito  (nulo, vazio ou só caracteres)
--   E whatsapp sem nenhum dígito
--   E o cliente NÃO tem nenhum card (ticket)
--
-- Como usar (Supabase Dashboard > SQL Editor):
--   1. Rode o PASSO 1 e confira a lista de clientes.
--   2. Só então rode o PASSO 2 para excluir.
-- ============================================================

-- ── PASSO 1 — Preview: clientes que serão excluídos ──
SELECT c.client_code,
       c.name,
       c.email,
       c.created_at
FROM clients c
WHERE regexp_replace(coalesce(c.phone, ''),    '\D', '', 'g') = ''
  AND regexp_replace(coalesce(c.whatsapp, ''), '\D', '', 'g') = ''
  AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.client_id = c.id)
ORDER BY c.created_at;

-- ── PASSO 2 — Exclusão (rodar só depois de conferir o PASSO 1) ──
-- DELETE FROM clients c
-- WHERE regexp_replace(coalesce(c.phone, ''),    '\D', '', 'g') = ''
--   AND regexp_replace(coalesce(c.whatsapp, ''), '\D', '', 'g') = ''
--   AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.client_id = c.id);
