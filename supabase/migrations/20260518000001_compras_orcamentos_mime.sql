-- Permite importar imagens e TXT no Pedido de Compras (além de PDF).
-- O bucket foi criado em 20260515000002 só com 'application/pdf', o que
-- bloqueava o upload de JPG/PNG antes mesmo da leitura por IA.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'text/plain'
]
WHERE id = 'compras-orcamentos';
