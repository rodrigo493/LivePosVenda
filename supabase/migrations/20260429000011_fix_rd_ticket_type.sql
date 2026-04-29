-- Corrige ticket_type dos deals importados do RD Station: pos_venda → negociacao
-- (ADD VALUE precisa ser commitado antes de poder ser usado em UPDATE)
UPDATE public.tickets
SET ticket_type = 'negociacao'
WHERE origin = 'rd_station'
  AND ticket_type = 'pos_venda';
