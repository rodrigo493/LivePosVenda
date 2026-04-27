-- =============================================================================
-- Seed: Memória Problema → Solução (casos reais de pós-venda)
-- Idempotente via WHERE NOT EXISTS
-- =============================================================================

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Roldana da central estourando elastico', 'Falha TÃ©cnica', 'recomendado a troca da roldana, arcando somente com custo do frete, e elastico que estourou antes do prazo',
       '["Roldanas"]'::jsonb, ARRAY['Funcionamento', 'Troca de componente'], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Roldana da central estourando elastico'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Roldana do v12 antigo dos elasticos com buchas estragadas', 'Falha TÃ©cnica', 'confeccionar peÃ§as e enviar',
       '[]'::jsonb, ARRAY['Componentes', 'Troca de componente'], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Roldana do v12 antigo dos elasticos com buchas estragadas'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'kit acessorios', 'Retorno do correios por endereÃ§o inexistente', '', 'conferimos o endereÃ§o e estaremos enviando novamente',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'kit acessorios' AND sintoma = 'Retorno do correios por endereÃ§o inexistente'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Auxilio de troca de rodinhas 100mm do v12', '', 'Foi enviado um video de auxilio das trocas da rodinhas',
       '[]'::jsonb, ARRAY['Componentes'], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Auxilio de troca de rodinhas 100mm do v12'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Desgaste de rodinhas de V12', '', 'recomendamos que seja trocado as 8 rodinhas 100mm com rolamentos e foi encaminhado para o comercial',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Desgaste de rodinhas de V12'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'Solicitou um video de auxilio para uso da corda do v5', '', 'Foi enviado um video de auxilio de uso das corda',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'Solicitou um video de auxilio para uso da corda do v5'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Rolamento travando e sem lubrificaÃ§Ã£o', '', 'Foi recomendado que seja desmontado e lubrificado com gracha',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Rolamento travando e sem lubrificaÃ§Ã£o'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'SX sem ajuste, com tamanho diferente da plataforma', '', 'Explicamos sobre o ajuste, e foi conversado que ela ajustaria, e foi enviado o video',
       '[]'::jsonb, ARRAY['AcessÃ³rios'], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'SX sem ajuste, com tamanho diferente da plataforma'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'V12 com barulho minimo no exercicio', '', 'Estamos em analise, pois dificil de acontecer',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'V12 com barulho minimo no exercicio'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'V12 com desgaste nas rodinhas fazendo barulho', '', 'Foi informado que seja trocado as rodinhas e transferido pro comercial',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'V12 com desgaste nas rodinhas fazendo barulho'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'fazendo barulho no v4, nos rolamentos', '', 'foi solicitado fotos do rolamento',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'fazendo barulho no v4, nos rolamentos'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V2', 'remo nÃ£o estava encaixando, carrinho com jogo, e molas teoricamente torta', '', 'foi auxiliado o encaixe do remo e passado informaÃ§oes sobre as molas',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V2' AND sintoma = 'remo nÃ£o estava encaixando, carrinho com jogo, e molas teoricamente torta'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'barra abdomen com barulho sem lubrificaÃ§Ã£o', '', 'foi enviado video de lubrificfaÃ§Ã£o, e pedido para inverte as molas e lubrificar os ganchos',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'barra abdomen com barulho sem lubrificaÃ§Ã£o'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'barulho no v12', '', 'foi analisado videos e foi constatado que um barulho de desnivelaÃ§Ã£o de aparelho',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'barulho no v12'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'faltando manipulo 3 pontas e', '', 'vamos estar enviando os manipulos 3 pontas',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'faltando manipulo 3 pontas e'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'roldana muito apertada e pino nÃ£o encaixando', '', 'sujerido que solte um pouco a roldana',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'roldana muito apertada e pino nÃ£o encaixando'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'apresentou barulho no tampo do V4 de madeira', '', 'auxiliamos que seja jogado wd40 para reduzir o barulho do tampo do v4',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'apresentou barulho no tampo do V4 de madeira'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'auxilio de lubrificaÃ§Ã£o e barulho no V12', '', 'Foi recomendado que nÃ£o seja lubrificado pois pode prejudicar mais. E pedir video do barulho do v12',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'auxilio de lubrificaÃ§Ã£o e barulho no V12'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'Foi enviando 2 peÃ§as do Boomerang do mesmo lado', '', 'Vamos estar enviando o lado certo do boomerang',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'Foi enviando 2 peÃ§as do Boomerang do mesmo lado'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'NÃ£o foi enviando chapas com alÃ§as plasticas, puxadores do V8 travado e elastico do pino estourou pelo tamanho menor.', '', 'Estaremos enviando chapa completa juntamente com um novo pino e puxador do v8 e tampa externa',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'NÃ£o foi enviando chapas com alÃ§as plasticas, puxadores do V8 travado e elastico do pino estourou pelo tamanho menor.'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente esta com trilho do v12 enferrujado e entrou em contato com a Re', '', 'Aguardando renne me mandar instruÃ§oes sobre o lixamento e pintura do trilho.',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente esta com trilho do v12 enferrujado e entrou em contato com a Re'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V2', 'cliente entrou em contato falanado que nÃ£o havia ido a barrinha de exercicio', '', 'analisando o video foi vizualizado a barrinha no video junto com o aparelho.',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V2' AND sintoma = 'cliente entrou em contato falanado que nÃ£o havia ido a barrinha de exercicio'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'V5 antigo, cliente adiquiriu um jump modelo antigo, e nÃ£o encaixou', '', 'Foi informado dos ajuste que sÃ£o feito no jump para que ele encaixe',
       '[]'::jsonb, ARRAY['AcessÃ³rios'], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'V5 antigo, cliente adiquiriu um jump modelo antigo, e nÃ£o encaixou'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Tampo danificado pela transportadora, porem nÃ£o foi feito a resalva na nota, pinos chegaram quebrado', '', 'Estamos enviando 2 pinos e um capa do tampo, cliente tendo que arca com mÃ£o de obra na troca da capa.',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Tampo danificado pela transportadora, porem nÃ£o foi feito a resalva na nota, pinos chegaram quebrado'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Foi faltando um pe nivelador, e as cordas completa do reforme', '', 'Entrei em contato com a cliente para poder ta enviando um novo pe nivelador e cordas completa do V5',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Foi faltando um pe nivelador, e as cordas completa do reforme'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Foi passado pelo cliente que houve um acidente com chair com problema na mola', '', 'Mola esta com argola torta, pedi um video para poder anlisar melhor',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Foi passado pelo cliente que houve um acidente com chair com problema na mola'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 PLUS', 'Acabamento da corda (termoretratil) foi soltou sem acabamento na corda', '', 'Cliente hÃ¡ um pedido de acessorios, estaremos enviando juntamente',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 PLUS' AND sintoma = 'Acabamento da corda (termoretratil) foi soltou sem acabamento na corda'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 PLUS', 'Aparelho com um mÃªs de uso , jÃ¡ com tampo descosturando, e barrinha do V2 cross suja', '', 'vamos esta enviando um novo tampo, e vai ser devolvido o danificado',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 PLUS' AND sintoma = 'Aparelho com um mÃªs de uso , jÃ¡ com tampo descosturando, e barrinha do V2 cross suja'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'aparelho aparenta barulho nos pisantes des da compra, agora retomou o barulho', '', 'Vamos esta fornecendo os rolamentos, pois apresenta defeito des da compra',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'aparelho aparenta barulho nos pisantes des da compra, agora retomou o barulho'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'foi faltando nos aparelho da cliente 1 alÃ§a de pÃ© descusturada ,1 mosquetÃ£o,', '', 'vamos enviar o que foi faltando para a cliente',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'foi faltando nos aparelho da cliente 1 alÃ§a de pÃ© descusturada ,1 mosquetÃ£o,'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'foi faltando nos aparelho da cliente, 1 corda v12, 2 pinos de Travas dessa barra superior do v12', '', 'vamos enviar o que foi faltando para a cliente',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'foi faltando nos aparelho da cliente, 1 corda v12, 2 pinos de Travas dessa barra superior do v12'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Rompeu o ElÃ¡stico', '', 'Enviamos um ElÃ¡stico Carrinho (PG) - PAC',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Rompeu o ElÃ¡stico'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Desgaste das rodinhas e estÃ¡ tripidando', '', 'Enviamos 4 rodas e uma sapata externa (PG) - PAC',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Desgaste das rodinhas e estÃ¡ tripidando'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'PeÃ§as faltando', '', 'Enviamos 1 puxador com trava e 3 parafusos -   (PG) - PAC',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'PeÃ§as faltando'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Pino quebrou', '', 'Enviamos um pino da barra abdomem  (PG) - PAC',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Pino quebrou'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Parafuso solto. Sentindo o carrinho solto', '', 'IrÃ¡ verificar se o parafuso relamente estÃ¡ sobrando',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Parafuso solto. Sentindo o carrinho solto'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Barra Frontal saindo a tinta', '', 'Enviamos uma barra frontal (PG)- PAC',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Barra Frontal saindo a tinta'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'V12 e V12 antigo', '', 'PG: 1 elÃ¡stico e 3 roldanas. PA: Kit com 5 elÃ¡sticos e 1 corda nÃ¡utica.',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'V12 e V12 antigo'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Barulho no V4 e no V8 Falou 2 pinos que soltou.', '', 'Enviar suporte das molas e molas (V4), 2 pinos (V8) + PA (Conversor Mat)',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Barulho no V4 e no V8 Falou 2 pinos que soltou.'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'Faltando Parafuso', '', 'Enviamos 4 parafusos (PG) - Sedex',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'Faltando Parafuso'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Barulho nas rodinhas', '', 'Enviamos 4 rodinhas de baixo, 2 roldanas e 4 rolamentos.',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Barulho nas rodinhas'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'NÃ£o foi o suporte do V2 para fixar no V8', '', 'Enviamos 1 suporte superior; 1 suporte inferior fÃªmea; 1 suporte superior fÃªmea e 1 suporte inferior macho (PG) - PAC.',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'NÃ£o foi o suporte do V2 para fixar no V8'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'Faltando Adesivo (V5)', '', '2 kit adesivos',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'Faltando Adesivo (V5)'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Faltando Parafuso (V12)', '', 'Enviamos 2 parafusos e (PG) - Sedex',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Faltando Parafuso (V12)'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'Barulho Reformer', '', 'Enviamos 4 Rodas Skate (PG) - PAC.',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'Barulho Reformer'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Rompeu o ElÃ¡stico', '', 'Enviamos 1 elÃ¡stico do carrinho e 3 roldanas (PG) - Sedex',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Rompeu o ElÃ¡stico'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Ferrugem nos parafusos', '', 'Enviamos 4 parafusos (PG) - PAC',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Ferrugem nos parafusos'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'MosquetÃ£o Danificado', '', '1 Kit ElÃ¡stico (PG) - PAC',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'MosquetÃ£o Danificado'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V1', 'Parafuso gira em falso e solta', '', 'Enviamos peÃ§as novas (PG) OBS.: 1 montagem Espaldar Direita e 1 montagem Espaldar Esquerda.',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V1' AND sintoma = 'Parafuso gira em falso e solta'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'ElÃ¡stico Carrinho', '', 'Enviamos 1 elÃ¡stico carrinho',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'ElÃ¡stico Carrinho'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Barulho nas molas Chair. Inverteu as molas e o barulho continua', '', 'Avisamos que estÃ¡ em teste novo sistema de molas.',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Barulho nas molas Chair. Inverteu as molas e o barulho continua'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Quebrou o eixo da roda do V12 (Carrinho) NF de 03/03/2021. O furo do carrinho novo nÃ£o bate com a furaÃ§Ã£o da estrutura de cima.', '', 'Enviamos estrutura do carrinho. Mas, a furaÃ§Ã£o nÃ£o bate. Renne irÃ¡ verificar como Rodrigo como solucionarÃ¡ o problema.',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Quebrou o eixo da roda do V12 (Carrinho) NF de 03/03/2021. O furo do carrinho novo nÃ£o bate com a furaÃ§Ã£o da estrutura de cima.'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Dano no transporte (Rodonaves)', '', 'Enviar uma parte do piso do V12 (PG) Frete tambÃ©m PG. Passar vÃ­deo e cÃ³digo de rastreio.',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Dano no transporte (Rodonaves)'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'barulho e  a rodinha da frente parece que nÃ£o gira. Precisa de ajuda para montar o Cadilac. O barrel chegou sem proteÃ§Ã£o e manchado.', '', 'Pedimos um teste com pano ou papelÃ£o. Enviamos mensagem em 29/04 perguntando se o barulho continua.',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'barulho e  a rodinha da frente parece que nÃ£o gira. Precisa de ajuda para montar o Cadilac. O barrel chegou sem proteÃ§Ã£o e manchado.'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Foi faltando o Kit', '', 'Enviar o  KIT - PG',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Foi faltando o Kit'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'Avaria do Transporte', '', 'Vai fazer a troca do equipamento',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'Avaria do Transporte'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Rodinhas desgastada. DesnÃ­vel. Cliente pediu para enviar todas as rodinhas para troca. Quer  um vÃ­deo da troca da rodinha de baixo -V12. Ela quer as rodinhas inferiores como garantia. Disse que o problema sempre foi com elas.', '', 'Enviamos 4 rodinhas superior do carrinho.',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Rodinhas desgastada. DesnÃ­vel. Cliente pediu para enviar todas as rodinhas para troca. Quer  um vÃ­deo da troca da rodinha de baixo -V12. Ela quer as rodinhas inferiores como garantia. Disse que o problema sempre foi com elas.'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Estourou o rolamento (Chair nova) e rasgou a sapata.', '', 'Enviar 2 rolamentos e uma sapata. e vÃ­deo de instruÃ§Ã£o para a troca. Enviar cÃ³digo de rastreio. Enviamos 2 rolamentos 6003 2Âª linha e 1 sapata V4. Enviar vÃ­deo troca dos rolamentos e da sapata.',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Estourou o rolamento (Chair nova) e rasgou a sapata.'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', '4 pinos da barra superior e 2 pinos da barra abdominal. Foram todos os elÃ¡sticos dos pinos quebrados. (Whatsapp Renata).', '', 'Enviamos 4 Pinos Barra Superior Direito e 2 Pinos Barra Abdomem.',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = '4 pinos da barra superior e 2 pinos da barra abdominal. Foram todos os elÃ¡sticos dos pinos quebrados. (Whatsapp Renata).'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'ElÃ¡stico estourou com menos de um mÃªs de uso. Plataforma solta com  (A Renata jÃ¡ estÃ¡ resolvendo o problema da plataforma com jogo).', '', 'Enviar 1 elÃ¡stico (PG) Modelo anterior.',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'ElÃ¡stico estourou com menos de um mÃªs de uso. Plataforma solta com  (A Renata jÃ¡ estÃ¡ resolvendo o problema da plataforma com jogo).'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'barulhos em dois lugares na rodinha e tripida.', '', 'Pedimos um teste. Estamos aguardando. Renata estÃ¡ atendendo para venda das rodas em 29/04.Comprou 4 rodinhas 100mm , mandamos acabamento para tirar barrulho da tampa do trilho e um calÃ§o',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'barulhos em dois lugares na rodinha e tripida.'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Ferrugem e Barulho (V12)', '', 'Enviamos: 4 Rolamentos 608-ZZ TIMKEM 1Âª linha e 20 PA CH SI AC 10.9 MA 6x20 RI ET e 1 Spray Preto Premium e 1 Barra ExercÃ­cios',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Ferrugem e Barulho (V12)'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Foi faltando o Kit', '', 'Enviar Sedex - PD 1484',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Foi faltando o Kit'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Foi faltando o Kit', '', 'Enviar Sedex - PD 1487',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Foi faltando o Kit'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'Arranhado na barra. Estofado rasgado. Faltou 6 parafusos da parte inferior.', '', 'Dano da Transportadora: Leandro Cordeiro da  (Renata quem pediu). Enviar tampo novo (trazer o tampo danificado de volta) enviar 6 parafusos que faltou (Frete e valor da capa por conta da transportadora).',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'Arranhado na barra. Estofado rasgado. Faltou 6 parafusos da parte inferior.'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente  reportou que desde adquiriu os equipamentos, seu equipamento V12 esta  desgastando as rodas muito rÃ¡pido', '', '4 Rodas 100mm SHR 88AA e 1 Sapata Externa 4"PVC',
       '["4 - rodas Pretas, 4 espaÃ§adores"]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente  reportou que desde adquiriu os equipamentos, seu equipamento V12 esta  desgastando as rodas muito rÃ¡pido'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Recebeu as rodas e disse que nÃ£o deu certo.', '', 'Enviar 4 rodas pretas jÃ¡ com os rolamentos e ele irÃ¡ enviar de volta as 4 rodas verdes sem os rolamentos.',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Recebeu as rodas e disse que nÃ£o deu certo.'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Barulho nas molas', '', 'O setor de Engenharia jÃ¡ identificou a melhoria a ser feita. EstÃ¡ na fase final do teste, um novo sistema de molas, que resolverÃ¡ o problema do barulho.',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Barulho nas molas'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Desgaste das rodas', '', 'PA-4 rodas com rolamentos encaixados',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Desgaste das rodas'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Estourou o elÃ¡stico', '', 'Enviamos 1 elÃ¡stico do carrinho (PG) PF. 346. Rodrigo irÃ¡ fazer uma visita presencial para analisar o aparelho, dentro de 40 dias.',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Estourou o elÃ¡stico'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Problema no pino', '', 'Enviamos 1 manipulo Knob M14 PASSO 1.5mm PF. 102 e 2 rolamentos 6003 (2Âª linha) RO. 6003',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Problema no pino'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V1', 'Barrel branco que afundou e um gancho laranja que soltou', '', 'vamos mandar outo tampo V1 Barrel, jÃ¡ a barra v8 terra que mandar para nos efetuarmos o conserto',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V1' AND sintoma = 'Barrel branco que afundou e um gancho laranja que soltou'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Roldanas nÃ£o gira.', '', 'Renata jÃ¡ tem os vÃ­deos com a soluÃ§Ã£o. enviar os rolamentos novos o kit completo para fazer a troca. Enviar o vÃ­deo de passo a passo para fazer a troca.Vamos enviar jogo de roudanas completo(com parafuso,buchas , rolamentos e chave )',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Roldanas nÃ£o gira.'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V6', 'A corda foi com tamanho errado', '', 'Enviar 2 cordas nÃ¡uticas 5 m (cada) PG. mesmo endereÃ§o do ultimo envio?
Travessa Prudente de Moraes . Casa 04. Bairro Campos
Parnaiba-Piaui',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V6' AND sintoma = 'A corda foi com tamanho errado'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Problema na rodinhas inferiores (Verificar NF 786).', '', 'Enviamos 4 rodas inferiores com rolamentos e calÃ§o. Enviar vÃ­deo para instruÃ§Ã£o da troca das rodas inferiores e colocaÃ§Ã£o do calÃ§o.',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Problema na rodinhas inferiores (Verificar NF 786).'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Barulho nas molas', '', 'O setor de Engenharia jÃ¡ identificou a melhoria a ser feita. EstÃ¡ na fase final do teste, um novo sistema de molas, que resolverÃ¡ o problema do barulho.',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Barulho nas molas'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Barulho nas molas', '', 'O setor de Engenharia jÃ¡ identificou a melhoria a ser feita. EstÃ¡ na fase final do teste, um novo sistema de molas, que resolverÃ¡ o problema do barulho.',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Barulho nas molas'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Barulho nas molas', '', 'O setor de Engenharia jÃ¡ identificou a melhoria a ser feita. EstÃ¡ na fase final do teste, um novo sistema de molas, que resolverÃ¡ o problema do barulho.',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Barulho nas molas'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'Capa estofado V5  rasgada', '', 'Enviar capa estofado V5 Plus G',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'Capa estofado V5  rasgada'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'desgaste em 2 rodinhas do V12', '', 'Enviar 2 rodinhas e um calÃ§o',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'desgaste em 2 rodinhas do V12'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'equipamento todo riscado no transporte', '', 'trocar equipamento todo',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'equipamento todo riscado no transporte'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'barrulho no carrinho V12', '', 'Por favor verifique , antes de fazer outro vÃ­deo se os pÃ©s niveladores ( 5 ) estÃ£o todos encostados no piso. SÃ£o dois pÃ©s de cada lado do aparelho e um no meio embaixo da central , esperando nota fiscal para analize da garantia',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'barrulho no carrinho V12'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'quebra do pino fixador do tampo, mandar junto 4 rodas 100mm 2 elÃ¡sticos e 8 buchas limitadoura ( us.v5.122)', '', 'emviaremos tampo completo (estofado e tampo de aÃ§o com porca )',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'quebra do pino fixador do tampo, mandar junto 4 rodas 100mm 2 elÃ¡sticos e 8 buchas limitadoura ( us.v5.122)'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'Capa barra pÃ©', '', 'enviado correios',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'Capa barra pÃ©'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'mola extra forte vermelha', '', 'enviado correios',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'mola extra forte vermelha'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'Quebra da Barra PÃ©', '', 'Troca Assistencia',
       '["915"]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'Quebra da Barra PÃ©'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Elastico Danificando no mesmo Local', '', 'Elastico Danificou por ser colocado de forma incorreta e cliente terÃ¡ que comprar um novo elastico e colocar de forma correta',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Elastico Danificando no mesmo Local'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Parafusos enferujando', '', 'Foi orientado a limpar os parafusos e pinta-los',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Parafusos enferujando'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Barulho no V12 ( provavelmente no rolamento da Central )', '', 'Foi orientado a realizar a troca das rodas e os rolamentos do equipamento',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Barulho no V12 ( provavelmente no rolamento da Central )'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'DeformaÃ§Ã£o das rodas  do carinho V12', '', 'Foi orentado ao instrutor a instruir o aluno a nÃ£o deixar o aluno bater o carinho na tampa do equipamento',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'DeformaÃ§Ã£o das rodas  do carinho V12'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'problema na pintura no V5 modelo 2024 e  Sapata dos pedais do V4', '', 'Equipamento V5 sera trocado',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'problema na pintura no V5 modelo 2024 e  Sapata dos pedais do V4'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'Avaria no conversor e no estofado', '', 'Conversor Mat serÃ¡ trocado na garantia',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'Avaria no conversor e no estofado'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V1', 'deformaÃ§Ã£o no estofado ( afundamento )', '', 'Estofado  V1 e jÃ¡ foi enviado , ( o estofado novo chegou mas chegou rasgado e ao invÃ©s de mandarmos outro , pedi para levar no tapeceiro para trocar o corvinho , foi cobrado R$ 150,00 e jÃ¡ foi feito o reembolso 05/09/25',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V1' AND sintoma = 'deformaÃ§Ã£o no estofado ( afundamento )'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Riscos nos equipamentos ocasionado pelo transporte', '', 'SerÃ¡ enviado junto com os acessÃ³rios que a cliente adquiriu um spray  preto fosco e o adesivo de danificou  e iquando receber irei orientar para a cliente retocar os riscos',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Riscos nos equipamentos ocasionado pelo transporte'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente contratou um tecnico para efetuar a montagem e o mesmo esta com dificuldade para realizar a montagem', '', 'Foi realizada uma vÃ­deo chamada para orientar na montagem',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente contratou um tecnico para efetuar a montagem e o mesmo esta com dificuldade para realizar a montagem'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente esta com problema na roda do equipamento', '', 'cliente comprou 1 roda e foi enviado 3 rodas e os espaÃ§adares pela garantia',
       '[]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente esta com problema na roda do equipamento'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'Cliente esta com  o problema no mordedor , nÃ£o esta segurando a corda', '', 'Cliente foi orientada a testar os mordedores e estÃ£o em perfeito estado, a cliente e que esta tendo dificuldade em manusear o equipamento mas jÃ¡ passei as orientaÃ§Ãµes',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'Cliente esta com  o problema no mordedor , nÃ£o esta segurando a corda'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente esta com barulho no equipamento V8', '', 'Cliente foi orientada a  testar todas as roldanas para verificar a abertura  das barras  e vou enviado video do procedimento',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente esta com barulho no equipamento V8'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente achando que esta faltando furos na torre do V8x do lado da barrinha de exercÃ­cio', '', 'Foi enviado um  video explicando sobre os furos da torre do V8x',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente achando que esta faltando furos na torre do V8x do lado da barrinha de exercÃ­cio'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'Cliente estÃ¡ com dificuldade de encaixar o Had Bar', '', 'Foi realizado uma vÃ­deo chamada orientando para regular as manoplas do V5 Reformer e apÃ³s isso os acessÃ³rios jÃ¡ estÃ£o encaixando (informaÃ§Ã£o passada pela cliente)',
       '[]'::jsonb, ARRAY['AcessÃ³rios', 'VÃ­deo Chamada'], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'Cliente estÃ¡ com dificuldade de encaixar o Had Bar'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'Cliente alegou que recebeu o equipamento com o estofado danificado', '', 'Enviei mensagem orientando que o equipamento danificou pelo manuseio incorreto  mas que mesmo assim iremos efetuar a troca pela garantia, mas que queria falar com ele para orientar sobre o uso do equipamento',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'Cliente alegou que recebeu o equipamento com o estofado danificado'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente recebeu as arruelas de plasticos para ser colocadas', '', 'Irei  orienta-la para efetuar a colocaÃ§Ã£o das arruelas',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente recebeu as arruelas de plasticos para ser colocadas'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V1', 'Cliente esta com o estofado do V1 deformado  Branco)', '', 'estofado serÃ¡ trocado do equipamento',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V1' AND sintoma = 'Cliente esta com o estofado do V1 deformado  Branco)'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relata que o carinho do V12 esta trepidando', '', 'As rodas do equipamento estÃ£o gastas e instrui a cliente que tem que ser trocada',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relata que o carinho do V12 esta trepidando'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente recebeu o equipamento desmontado e solicitou um vÃ­deo completo de montagem', '', 'Enviei um  o manual de montagem e informei a ele caso seja necessÃ¡rio irei realizar uma vÃ­deo chamada para auxilia-lo na montagem do equipamento',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente recebeu o equipamento desmontado e solicitou um vÃ­deo completo de montagem'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente esta com problema no manipulo da barra abdomem', '', 'Foi orientado a encaixar e nÃ£o apertar e orientei tambÃ©m para que toda vez que for colocada a barra abdomen verificar se o sextavado nÃ£o esta aparecendo',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente esta com problema no manipulo da barra abdomem'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'Cliente comprou o jump modelo antigo e nÃ£o esta encaixando no equipamento', '', 'SerÃ¡ enviado um Jump novo  modelo antigo, serÃ¡ enviado de brinde um caixa grande de exercÃ­cios pelo ocorrido com a cliente',
       '["Jump Modelo redondo", "caixa Grande de exercÃ­cios"]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'Cliente comprou o jump modelo antigo e nÃ£o esta encaixando no equipamento'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente precisa de um auxilio para trocar as rodas do V12', '', 'Enviei o vÃ­deo orientando a troca das rodas',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente precisa de um auxilio para trocar as rodas do V12'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente eta com barulho co carinho do V12', '', 'Elastico da plataforma estÃ¡  desgastado e informei que tem que ser trocado e ira realizar o pedido com a consultora Deborah',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente eta com barulho co carinho do V12'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relatou que  estourou a rodinha do equipamento', '', 'Instrui a cliente a verificar se o equipamento estÃ¡ no esquadro e enviei o vÃ­deo orinetando  como ela farÃ¡ a verificaÃ§Ã£o e estou aguardando ela realizar o procedimento',
       '["4 rodas 100mm preta, 8 rolamentos 1 linha tinkene 4 espacadores"]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relatou que  estourou a rodinha do equipamento'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente esta com problema nas rodas do V12', '', 'Instrui a cliente a verificar se o equipamento estÃ¡ no esquadro e enviei o vÃ­deo orinetando  como ela farÃ¡ a verificaÃ§Ã£o e estou aguardando ela realizar o procedimento',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente esta com problema nas rodas do V12'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente esta com dficuldade de colocar o pino   no carinho do V12', '', 'Foi orientado a passar a broca no tampo e no carinh o para facilitar o encaixe do Pino',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente esta com dficuldade de colocar o pino   no carinho do V12'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente esta com o rolamento da roda do V12 estourado ( roda modelo Interissa)', '', 'Enviei a ele o modelo do rolamento que tem que ser comprtado para ficar mais em conta',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente esta com o rolamento da roda do V12 estourado ( roda modelo Interissa)'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente esta com o elastico Danificado', '', 'Informei que o elastico tem que ser subistituido por um novo',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente esta com o elastico Danificado'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente estava com a roldana da barra movel travada e devido a isso tirou toda a tinta da barra', '', 'Cliente foi orientada a soltar o parafuso da barra e com isso resolveu o problema e foi instruida a retocar com um spray preto fosco',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente estava com a roldana da barra movel travada e devido a isso tirou toda a tinta da barra'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V1', 'Cliente reportou que o estofado do V1 Barrel esta afundando', '', 'SerÃ¡ trocado o estofado completo do equipamento V1',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V1' AND sintoma = 'Cliente reportou que o estofado do V1 Barrel esta afundando'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente relatou de a barra foi faltando uma buxinha da roldana mas pelo video que ela me enviou eu constatei que estava montada invertida e que o tÃ©cnico montou errado e consequentemente perdeu uma buxinha', '', 'Foi orientada a inverter a barra, ela chamou o tÃ©cnico para inverter a barra e o mesmo acabou encontrando a buxinha e o equipamento ficou tudo certo',
       '[]'::jsonb, ARRAY['Envio de VÃ­deo explicativo'], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente relatou de a barra foi faltando uma buxinha da roldana mas pelo video que ela me enviou eu constatei que estava montada invertida e que o tÃ©cnico montou errado e consequentemente perdeu uma buxinha'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente esta com o tampo do V12 aparentemente solto, solicitei o vÃ­deo para poder analisar o que esta acontecendo com o Tampo ( video enviado)', '', 'Foi orientado ao cliene retirar o tampo , analisar os rolamentos e estiver tudo ok, lubrificar e montar novamente',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente esta com o tampo do V12 aparentemente solto, solicitei o vÃ­deo para poder analisar o que esta acontecendo com o Tampo ( video enviado)'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V6', 'Cliente recebeu os elÃ¡sticos do V6 compridos', '', 'Foi feita uma vÃ­deo chamada e iremos enviar o elastico correto do V6 Antigo (2 pares)',
       '["Kit de elÃ¡stico V6"]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V6' AND sintoma = 'Cliente recebeu os elÃ¡sticos do V6 compridos'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente esta com um V12 com desgaste da roda e outro como barulho nas rodas', 'Desgaste Natural', 'Foi enviado varios vÃ­deos e o equipamento foi adquirido em setembro de 2024, o desgaste da roda  esta dentro do esperado e o cliente foi instruido a comprar rodas novas',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente esta com um V12 com desgaste da roda e outro como barulho nas rodas'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relatou que as rodas do equipamento estÃ¡ desgastada e estÃ£o fazendo Barulho', '', 'ApÃ³s enviado o vÃ­deo foi constatado',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relatou que as rodas do equipamento estÃ¡ desgastada e estÃ£o fazendo Barulho'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente relatou que as alÃ§as estÃ£o descosturando', '', 'SerÃ£o enviadas um par de alÃ§as pÃ© pela garantia',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente relatou que as alÃ§as estÃ£o descosturando'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'ElÃ¡stico da torre do equipamento se soltou do mosquetÃ£o', 'Falha TÃ©cnica', 'SerÃ¡ enviado 2 elÃ¡sticos pela garantia',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'ElÃ¡stico da torre do equipamento se soltou do mosquetÃ£o'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente Relatou que esta fazendo barulho nas rodas e que somente uma desgastou', 'Falha TÃ©cnica', 'Foi feito uma vÃ­deo chamada e orintei  o cliente a colocar o equipamento no nivel colocando calÃ§os e serÃ¡ enviada 1 rodinha e 2 dois rolamentos 1 linha na garantia',
       '[]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente Relatou que esta fazendo barulho nas rodas e que somente uma desgastou'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Cliente relatou que as molas do equipamento estÃ£o fazendo barulho', 'Falha TÃ©cnica', 'SerÃ¡ enviado os anÃ©is para ser colocado na parte interna das molas',
       '["4- aneis da mola"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Cliente relatou que as molas do equipamento estÃ£o fazendo barulho'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente relatou problema na pintura na torre lado bucha do equipamento', 'Falha Interna', 'Foi enviado uma nova torre para a cliente',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente relatou problema na pintura na torre lado bucha do equipamento'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente reportou que foi faltando dois manipulos da barra laranja', 'Falha Interna', 'SerÃ¡ enviado os dois manipulos que estÃ£o faltando',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente reportou que foi faltando dois manipulos da barra laranja'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente esta relatando qe a barra abdomen esta fazendo barulho no V5, V8 e V4 esta fazendo Barulho nas molas', '', 'Realizei uma vÃ­deo chamada com a secretÃ¡ria Simone orientndo sobre a barra abdomen dos dois equipamentos e orintei para passar silicone ou um Ã³leo lubificante, V4 foi invertido as molas e instrui ela a soltar a barra pÃ© para ser alinhada',
       '[]'::jsonb, ARRAY['VÃ­deo Chamada'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente esta relatando qe a barra abdomen esta fazendo barulho no V5, V8 e V4 esta fazendo Barulho nas molas'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus Torre', 'Cliente estava com dificudade em montar a torre do equipamento V5 e nÃ£o estava conseguindo', '', 'Foi realizada uma vÃ­deo chamada para orientar na montagem',
       '[]'::jsonb, ARRAY['VÃ­deo Chamada'], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus Torre' AND sintoma = 'Cliente estava com dificudade em montar a torre do equipamento V5 e nÃ£o estava conseguindo'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8 Plus', 'Cliente relata que o elastico esta danificando rapidamente', '', 'SerÃ¡ enviado um par de elastico, um par de pino da barra abdomem e duas roldanas da torre pela garantia autorizado pela RÃª',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8 Plus' AND sintoma = 'Cliente relata que o elastico esta danificando rapidamente'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relatou que foi faltando um pÃ© nivelador e que um lado do trilho chegou aranhado', '', 'Sera enviado o pÃ© nivelador e o spray preto fosco na garantia',
       '["1- Spray preto fosco, 1 pÃ© nivelador"]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relatou que foi faltando um pÃ© nivelador e que um lado do trilho chegou aranhado'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus Torre', 'Cliente relatou que foi um pÃ© do equipamento V5 do mesmo lado ( pÃ© certo Ã© esquerdo)', '', 'SerÃ¡ enviado a peÃ§a correta na segunda- feira e um Jump de bonificaÃ§Ã£o para reparar o erro',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus Torre' AND sintoma = 'Cliente relatou que foi um pÃ© do equipamento V5 do mesmo lado ( pÃ© certo Ã© esquerdo)'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente solicitou auxilio na montagem do equipamento V5 plus e no V8x', '', 'Foi realizada uma video chamada para  auxiliar na montagem',
       '[]'::jsonb, ARRAY['VÃ­deo Chamada'], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente solicitou auxilio na montagem do equipamento V5 plus e no V8x'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente recebeu o equipamento Com a tampa laranja descascando e com o adesivo da barra abdomen danificado', 'Falha TÃ©cnica', 'SerÃ¡ enviado as tampas laranjas e o adesivo da barra abdomen',
       '["2 tampas laranjas do V12 e o adesivo da barra abdomen"]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente recebeu o equipamento Com a tampa laranja descascando e com o adesivo da barra abdomen danificado'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relatou que comprou as rodas e com 3 meses as rodas jÃ¡ danificaram', '', 'SerÃ¡ enviado as rodas , rolamentos e espaÃ§adores pela garantia',
       '["4- rodas 100mm", "4- rolamentos 608 1 linha", "4- espaÃ§adores"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relatou que comprou as rodas e com 3 meses as rodas jÃ¡ danificaram'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5X Torre', 'Cliente relatou que as molas da torre nÃ£o foram, pedi fotos e perguntei sobre os acessÃ³rios (alÃ§a pÃ© , alÃ§a mÃ£o)  se ela recebeu', 'Falha Interna', 'SerÃ¡ enviado o kit molas junto com com o PA que a cliente comprou',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5X Torre' AND sintoma = 'Cliente relatou que as molas da torre nÃ£o foram, pedi fotos e perguntei sobre os acessÃ³rios (alÃ§a pÃ© , alÃ§a mÃ£o)  se ela recebeu'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relatou sobre os desgastes das rodinhas e enviou um vÃ­deo reportando que o carrinho esta cangorrando sobre os trilhos', '', 'Foi enviado um vÃ­deo orientando sobre a verificaÃ§Ã£o do esquadro do equipamento e posteriormente iremos verificar sobre o equipamento estÃ¡ nivelado no chÃ£o',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relatou sobre os desgastes das rodinhas e enviou um vÃ­deo reportando que o carrinho esta cangorrando sobre os trilhos'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente relatou que os  pÃ©s do V8X estÃ£o saindo a pintura do lado de cima', '', 'Foi enviado um pÃ© do equipamento, porem a cliente relata que os outros 3 tambÃ©m estÃ£o com detalhes na pintura',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente relatou que os  pÃ©s do V8X estÃ£o saindo a pintura do lado de cima'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus Torre', 'Cliente relatou de nÃ£o foi a capa da barra pÃ© do equipamento', 'Falha Interna', 'SerÃ¡ enviada a capa juntamente com o PA 332 para o cliente',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus Torre' AND sintoma = 'Cliente relatou de nÃ£o foi a capa da barra pÃ© do equipamento'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente relatou que a mola do Equipamento apresentou defeito', 'Falha TÃ©cnica', 'Cliente comprou 6 molas e serÃ¡ enviado 1 junto na garantia',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente relatou que a mola do Equipamento apresentou defeito'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V1', 'Cliente relatou que o estofado do equipamento esta afundando', 'Falha Interna', 'SerÃ¡ enviado o estofado completo  novo na garantia para a cliente',
       '["Envie do tampÃ³ V1 e 1 mola V8  verde"]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V1' AND sintoma = 'Cliente relatou que o estofado do equipamento esta afundando'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V1', 'Cliente relatou que o estofado do equipamento esta afundando', 'Falha Interna', 'SerÃ¡ enviado o estofado completo  novo na garantia para a cliente',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V1' AND sintoma = 'Cliente relatou que o estofado do equipamento esta afundando'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Cliente relatou que as sapatas do V4 estÃ£o muito prÃ³ximas e esta esfregando uma a outra e jÃ¡ danificou a mesma', 'Falha TÃ©cnica', 'Foi realizado uma vÃ­deo chamada orientando para soltar os parafusos da sapata e afastar uma da outra, aparentemente problema resolvido mas ela ficou de acompanhar  se realmente resolveu para que posteriormente eu possa enviar as novas sapatas',
       '[]'::jsonb, ARRAY['VÃ­deo Chamada'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Cliente relatou que as sapatas do V4 estÃ£o muito prÃ³ximas e esta esfregando uma a outra e jÃ¡ danificou a mesma'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relatou que o carinho do equipamento esta realizando barulho, solicitei vÃ­deos para seguir com o atendimento , vou enviado o vÃ­deo e foi constatato que a porca do tampo estava solto', '', 'Orientei  para apertar e orientei para acompanhar se  a  porca nÃ£o ira soltar novamente e caso soltar novamente orientei para troca seja substituida por uma nova',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relatou que o carinho do equipamento esta realizando barulho, solicitei vÃ­deos para seguir com o atendimento , vou enviado o vÃ­deo e foi constatato que a porca do tampo estava solto'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus Torre', 'Cliente relatou que a plataforna estava solta, e que a principio estava sem a bucha mas na verdade estava Ã© solto e tambÃ©m ira conferir o aperto da torre tambÃ©m e apÃ³s esse procedimento ira me passar o feedback', '', 'Foi realizado uma vÃ­deo chamada e constatei que a bucha esta no equipamento  orientei  o procedimento  para apertar os parafusos que apresentam estar soltos',
       '[]'::jsonb, ARRAY['VÃ­deo Chamada'], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus Torre' AND sintoma = 'Cliente relatou que a plataforna estava solta, e que a principio estava sem a bucha mas na verdade estava Ã© solto e tambÃ©m ira conferir o aperto da torre tambÃ©m e apÃ³s esse procedimento ira me passar o feedback'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Cliente reportou que as molas de um lado estÃ£o fazendo barulho', 'Desgaste Natural', 'Oriente a cliente inverter as molas de lado e mesmo assim apÃ³s a inverÃ§Ã£o o barulho continuou, orientei a passar silicone de esteiria no encaixes do equipamento e estou aguardando ela realizar o procedimento para me passar o Feedback',
       '[]'::jsonb, ARRAY['Barulho nas molas'], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Cliente reportou que as molas de um lado estÃ£o fazendo barulho'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus Torre', 'Cliente relatou que a plataforna estava solta, e que a principio estava sem a bucha mas na verdade estava Ã© solto e tambÃ©m ira conferir o aperto da torre tambÃ©m e apÃ³s esse procedimento ira me passar o feedback', '', 'Foi realizado uma vÃ­deo chamada e constatei que a bucha esta no equipamento  orientei  o procedimento  para apertar os parafusos que apresentam estar soltos',
       '[]'::jsonb, ARRAY['VÃ­deo Chamada'], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus Torre' AND sintoma = 'Cliente relatou que a plataforna estava solta, e que a principio estava sem a bucha mas na verdade estava Ã© solto e tambÃ©m ira conferir o aperto da torre tambÃ©m e apÃ³s esse procedimento ira me passar o feedback'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Tarcisio esta realizando a montagem e no momento de desenbalar nÃ£o observou que a embalagem do V12 estava rasgada ou algo parecido e nÃ£o visualizou e o tampo do carinho estava rasgado', '', 'SerÃ¡ enviado um tampo na garantia para o cliente',
       '["Tampo madeira completo  do carinho V12"]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Tarcisio esta realizando a montagem e no momento de desenbalar nÃ£o observou que a embalagem do V12 estava rasgada ou algo parecido e nÃ£o visualizou e o tampo do carinho estava rasgado'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente comprou as rodas 110mm no mÃªs de maio e uma das rodas jÃ¡ danificou', '', 'SerÃ¡ enviado as rodas,rolamentos e os espaÃ§adores pela garantia',
       '["4 rodas 110mm, 8 rolamentos 608 1Âª linha , 4 espacadores"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente comprou as rodas 110mm no mÃªs de maio e uma das rodas jÃ¡ danificou'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5X Torre', 'Cliente relatou que recebeu o equipamento sem um dos mordedores da corda', 'Falha Interna', 'SerÃ¡ enviado um mordedor para o cliente na garantia',
       '["1 chapa mordedor superior completo"]'::jsonb, ARRAY['Faltando PeÃ§a'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5X Torre' AND sintoma = 'Cliente relatou que recebeu o equipamento sem um dos mordedores da corda'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus Torre', 'Cliente Reportou que o protetor da barra pÃ© esta descosturando', 'Falha TÃ©cnica', 'SerÃ¡ enviado um capa da barra pÃ© pela garantia',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus Torre' AND sintoma = 'Cliente Reportou que o protetor da barra pÃ© esta descosturando'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus Torre', 'Cliente relatou que umas da corda do V5 chegou danificada', '', 'SerÃ¡ enviada uma corda completa pela garantia',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus Torre' AND sintoma = 'Cliente relatou que umas da corda do V5 chegou danificada'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente reportou que um dos V12 que comprou nÃ£o foi os Pinos d barra superior', '', 'Sera enviado via correios os 4 pinos para o Libano',
       '["4 pinos da barra superior com elastico"]'::jsonb, ARRAY['Faltando PeÃ§a'], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente reportou que um dos V12 que comprou nÃ£o foi os Pinos d barra superior'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Cliente reportou que as sapatas do V4 deformaram', '', 'SerÃ¡ enviado pela garantia o par de sapatas',
       '["1 par de sapatas"]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Cliente reportou que as sapatas do V4 deformaram'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relatou que dois Knob do V12 estou ( saiu a parte plastica do metal) e o pino da plataforma do carrinho foi colocado incorretamente e entortou', 'Falha TÃ©cnica', 'SerÃ¡ enviado 2 knobs e o pino t do tampo pela garantia',
       '["2 Knob V12 , 1 Pino T de Carga"]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relatou que dois Knob do V12 estou ( saiu a parte plastica do metal) e o pino da plataforma do carrinho foi colocado incorretamente e entortou'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente reportou que o manipulo do equipamento estourou e informei que serÃ¡ enviado um novo pela garantia', '', 'SerÃ¡ enviado um manipulo pela garantia',
       '["2 Knob Barra Abdm"]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente reportou que o manipulo do equipamento estourou e informei que serÃ¡ enviado um novo pela garantia'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente relatou que o equipamento V8x estava com a barra muito fazendo barulho e por video chamada constatei que os parafusos da roldana estava muito apertadas, quem montou foi um tecnico e pedi para que solicitasse que voltasse para realizar os ajustes', 'Falha TÃ©cnica', 'Foi realizado uma vÃ­deo chamada no dia 02/09/2025 e o tecnico realizouos ajustes nas roldanas e orientei sobre o uso da barra abdomen e da barra de exercÃ­cios',
       '[]'::jsonb, ARRAY['VÃ­deo Chamada'], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente relatou que o equipamento V8x estava com a barra muito fazendo barulho e por video chamada constatei que os parafusos da roldana estava muito apertadas, quem montou foi um tecnico e pedi para que solicitasse que voltasse para realizar os ajustes'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente Relatou de um de seus Knob do equipamento V12 desmontou', '', 'SerÃ¡ enviado um Knob novo pela garantia',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente Relatou de um de seus Knob do equipamento V12 desmontou'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'Cliente relatou que estava movimentando muito e por vÃ­deo chamada foi constatado que o equipamento estava tudo solto e os parafusos superior da torre estavam invertidos', '', 'Foi realizado uma vÃ­deo chamada',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'Cliente relatou que estava movimentando muito e por vÃ­deo chamada foi constatado que o equipamento estava tudo solto e os parafusos superior da torre estavam invertidos'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V1', 'Cliente reportou que o equipamento barrel esta afundando e que o V8 esta fazendo barulho de madeira quando realiza o exercÃ­cio', '', 'Foi orientado a realizar o aperto dos parafusos',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V1' AND sintoma = 'Cliente reportou que o equipamento barrel esta afundando e que o V8 esta fazendo barulho de madeira quando realiza o exercÃ­cio'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V1', 'Cliente reportou que seu equipamento V1 Barrel afundou o estofado', '', 'SerÃ¡ enviado um tampo do V1 pela garantia',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V1' AND sintoma = 'Cliente reportou que seu equipamento V1 Barrel afundou o estofado'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Cliente reportou que os rolamentos do equipamento V4 chair estorou e iremos enviar os rolamentos pela garantia', '', 'SerÃ¡ enviado os rolamentos pela garantia',
       '["4 rolamentois 6003 2 linha  4 espacadores"]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Cliente reportou que os rolamentos do equipamento V4 chair estorou e iremos enviar os rolamentos pela garantia'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente possue um V12 Mormaii antigo e esta precisando da rondana do carinho que segura a cordinha', '', 'Solicitei a medida da roldana para podemos providenciar a fabricaÃ§Ã£o da mesma',
       '["1- rolete", "1 mosquetÃ£o"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente possue um V12 Mormaii antigo e esta precisando da rondana do carinho que segura a cordinha'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente reportou que o equipamento barrel esta afundando e que o V12 esta fazendo barulho de madeira quando realiza o exercÃ­cio', '', 'SerÃ¡ enviado o Tampo do V1 pela garantia',
       '["1- tampo V1 completo"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente reportou que o equipamento barrel esta afundando e que o V12 esta fazendo barulho de madeira quando realiza o exercÃ­cio'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente  Relatou que  o Knob da barra abdome e s pinos da torre quebraram', '', 'Sera enviado os itens pela garantia',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente  Relatou que  o Knob da barra abdome e s pinos da torre quebraram'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V1', 'Cliente recebeu o equipamento V1 e na hora que foi testa-lo jÃ¡ afundou o tampo , informei a ele que serÃ¡ enviado um novo pela garantia', 'Falha Interna', 'SerÃ¡ enviado o Tampo do V1 pela garantia',
       '["Estofado do V1"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V1' AND sintoma = 'Cliente recebeu o equipamento V1 e na hora que foi testa-lo jÃ¡ afundou o tampo , informei a ele que serÃ¡ enviado um novo pela garantia'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Cliente reportou que o Knob do equipamento estourou e disse que a garantia Ã© de 12 meses , como esses prazo se estendeu estarei verificando com a engenharia a possibilidade de estar enviando o knob pela garantia', '', 'Foi enviado 2 Knobs pela garantia',
       '["2 - Knob"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Cliente reportou que o Knob do equipamento estourou e disse que a garantia Ã© de 12 meses , como esses prazo se estendeu estarei verificando com a engenharia a possibilidade de estar enviando o knob pela garantia'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Cliente relatou que a mola do equipamento a trava da sapatas se soltou e a trava rasgou as sapatas', '', 'SerÃ¡ enviado um par de sapatas pela garantia',
       '["2 - Sapatas V4"]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Cliente relatou que a mola do equipamento a trava da sapatas se soltou e a trava rasgou as sapatas'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente solicitou auxilio na montagem do equipamento V12  e verifiquei que a barra superior esta montada invertida, cliente jÃ¡ inverteu a barra e jÃ¡ esta correto e informou que chegou faltando um pÃ© nivelador e informei que serÃ¡ enviado um pÃ© nivelador', '', 'SerÃ¡ enviado os pÃ©s niveladores pela garantia',
       '[]'::jsonb, ARRAY['Troca de componente'], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente solicitou auxilio na montagem do equipamento V12  e verifiquei que a barra superior esta montada invertida, cliente jÃ¡ inverteu a barra e jÃ¡ esta correto e informou que chegou faltando um pÃ© nivelador e informei que serÃ¡ enviado um pÃ© nivelador'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus Torre', 'Cliente Relatou que o puxador da barra pÃ©, espanou', '', 'SerÃ¡ enviado um par de puxador pela garantia',
       '["2- puxdores completos"]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus Torre' AND sintoma = 'Cliente Relatou que o puxador da barra pÃ©, espanou'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V1', 'Cliente relatou que o tampo do V1 afundou', '', 'SerÃ¡ enviado um tampo completo pela garantia',
       '["1 - completo V1"]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V1' AND sintoma = 'Cliente relatou que o tampo do V1 afundou'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente reportou que nÃ£o foi o kit do equipamento V8X ( Kit molas, e kit completo )', '', 'SerÃ¡ enviado o kit completo para o cliente',
       '["Kit completo enviado"]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente reportou que nÃ£o foi o kit do equipamento V8X ( Kit molas, e kit completo )'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente relatou de um da alÃ§a mÃ£o foi diferente ( mole sem o tubo interno )', '', 'SerÃ¡ enviado um par de alÃ§a mÃ£o pela garantia',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente relatou de um da alÃ§a mÃ£o foi diferente ( mole sem o tubo interno )'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus Torre', 'Cliente relatou que a base aonde corre as rodas do equipamento esta descascando a tinta', '', 'SerÃ¡ enviado o quadro do dois lados para o cliente',
       '["2 - quadro do V5 plus"]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus Torre' AND sintoma = 'Cliente relatou que a base aonde corre as rodas do equipamento esta descascando a tinta'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relatou que as tampas laranjas estÃ£o desplacando a tinta', 'Falha Interna', 'SerÃ¡ enviado as tampas laranjas pela garantia',
       '["2- Tampas laranjas V12"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relatou que as tampas laranjas estÃ£o desplacando a tinta'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V2 Remo', 'Cliente relatou que o carrinho do V2 Cross esta aparentemente  com umas das rodas quebradas', '', 'SerÃ¡ enviado 4 rodas e 4 rolamentos 1Âª Linha pela garantia',
       '[]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V2 Remo' AND sintoma = 'Cliente relatou que o carrinho do V2 Cross esta aparentemente  com umas das rodas quebradas'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente relatou que quando a barra abdomen foi, trocada, ele disse que mandou o knob e os pinos (fato que nÃ£o aconteceu ) mas mesmo assim serÃ¡ enviado os pinos e o Kinob na cor preta', '', 'SerÃ¡ enviado pela garantia',
       '["2 - Pinos da torre", "1 - Knob"]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente relatou que quando a barra abdomen foi, trocada, ele disse que mandou o knob e os pinos (fato que nÃ£o aconteceu ) mas mesmo assim serÃ¡ enviado os pinos e o Kinob na cor preta'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V8X', 'Cliente relatou que a trava da barrinha do equipamento V8x espanou, pino e borboleta', '', 'SerÃ¡ enviado as peÃ§as pela garantia',
       '["1- pino puxador barrinha", "1 parafuso Â¼", "1- porca manipulo Â¼ borboleta"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V8X' AND sintoma = 'Cliente relatou que a trava da barrinha do equipamento V8x espanou, pino e borboleta'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'Cliente relatou que  a barra pÃ¨ quebrou pela segunda vez', '', 'SerÃ¡ enviado pela garantia a barra pÃ© modelo 2025 para resolvermos o problema',
       '["Barra PÃ© modelo 2025"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'Cliente relatou que  a barra pÃ¨ quebrou pela segunda vez'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus Torre', 'Cliente relatou que quebrou a segunda barra pÃ©', '', 'SerÃ¡ enviado a barra pÃ© modelo 2025',
       '["Barra PÃ© modelo 2025"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus Torre' AND sintoma = 'Cliente relatou que quebrou a segunda barra pÃ©'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Cliente relatou que as molas do equipamento estÃ£o fazendo barulho', '', 'SerÃ¡ enviado os anÃ©is para ser colocado na parte interna das molas',
       '["4- aneis da mola"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Cliente relatou que as molas do equipamento estÃ£o fazendo barulho'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V1', 'Cliente relatou que um dos manipulos da V1 espanou a rosca', '', 'Passei a ela 3 possibilidades, a primeira e desmontar o equipamento e nos enviar para efetuar o reparo, a segunda e pedir para um tecnico refazer a rosca e colocar um manipilo maior e a terceira e que possamos enviar a porca solda e o manipulo para estar trocando as peÃ§as',
       '[]'::jsonb, ARRAY[]::text[], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V1' AND sintoma = 'Cliente relatou que um dos manipulos da V1 espanou a rosca'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V1', 'Cliente relatou que o estofado do V1 afundou', '', 'SerÃ¡ enviado um tampo nova pela garantia',
       '["1- tampo V1 completo"]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V1' AND sintoma = 'Cliente relatou que o estofado do V1 afundou'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relata que o elastico esta danificando rapidamente,', '', 'SerÃ¡ enviado as 2 roldanas da central pela garantia',
       '["2- roldanas central", "4 bucha do rolamento", "4 Rolamento"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relata que o elastico esta danificando rapidamente,'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente tem um V12 Antigo Mormaii e o rolete que prente o elÃ¡stico quebrou', '', 'serÃ¡ enviado o rolete e o mosquetÃ£o pela garantia',
       '[]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente tem um V12 Antigo Mormaii e o rolete que prente o elÃ¡stico quebrou'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Cliente reportou que a trava do equipamento das sapatas quebrou', '', 'SerÃ¡ enviado a trava pela garantia e o anÃ©is para serem colocados nas molas',
       '["Trava sapata completa V4 e anÃ©is molas V4"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Cliente reportou que a trava do equipamento das sapatas quebrou'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente reportou que a tampa laranja do equipamento esta desplacando a tinta', '', 'SerÃ¡ enviado pela garantia',
       '["2- tampas laranjas V12"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente reportou que a tampa laranja do equipamento esta desplacando a tinta'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'Cliente relatou que a  capa da barra pÃ© esta soltando a costura', '', 'SerÃ¡ enviado a capa da barra pÃ© pela garantia',
       '["1- Capa Barra PÃ©"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'Cliente relatou que a  capa da barra pÃ© esta soltando a costura'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus Torre', 'Cliente Relatou que foi faltando os mosquetÃµes do moitÃ£o', '', 'SerÃ¡ enviado pela garantia os mosquetoes pela garantia',
       '["2- mosquetÃ£o 6x60"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus Torre' AND sintoma = 'Cliente Relatou que foi faltando os mosquetÃµes do moitÃ£o'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relatou que as rodas do equipamento estÃ¡ desgastada e estÃ£o fazendo Barulho', '', 'SerÃ¡ enviado as rodas, rolamentos e os espaÃ§adores pela garantia',
       '["4- rodas", "8 rolamentos", "espacadores"]'::jsonb, ARRAY[]::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relatou que as rodas do equipamento estÃ¡ desgastada e estÃ£o fazendo Barulho'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Cliente relatou que a trava das pedaleiras da V4 estou a rosca e com isso rasgou as sapatas da pedaleiras', '', 'SerÃ¡ enviado pela garantia a trava e as sapatas',
       '["2- sapatas V4", "trava e borboleta V4"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Cliente relatou que a trava das pedaleiras da V4 estou a rosca e com isso rasgou as sapatas da pedaleiras'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relatou que as rodas danificaram com menos de 6 meses de uso', '', 'SerÃ¡ enviado as rodas, rolamentos e os espaÃ§adores pela garantia',
       '["4-rodas 100mm", "8 rolamentos 1 linha", "4 espaÃ§ador"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relatou que as rodas danificaram com menos de 6 meses de uso'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus', 'Cliente  relatou que foi faltando dois parafusos de um dos equipamentos V5', '', 'SerÃ¡ enviado os parafusos e tambem o kit de elÃ¡sticos do V8X',
       '["3- pafusos", "3 porcas", "arruelas", "kit elÃ¡stico V8X"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus' AND sintoma = 'Cliente  relatou que foi faltando dois parafusos de um dos equipamentos V5'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Cliente relatou que as sapatas do V4 esÃ£o soltando a costura', '', 'SerÃ¡ enviado as duas sapatas pela garantia',
       '["2 sapatas V4"]'::jsonb, ARRAY['Troca de componente'], true
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Cliente relatou que as sapatas do V4 esÃ£o soltando a costura'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V1', 'Cliente relatou que o tampo do V1 afundou e estÃ¡ fazendo barrulho', '', 'SerÃ¡ enviado pela garantia um tampo novo',
       '["tampo V1"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V1' AND sintoma = 'Cliente relatou que o tampo do V1 afundou e estÃ¡ fazendo barrulho'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Cliente relatou varias vezes que as molas do V4 Chair esta fazendo barulho', '', 'SerÃ¡ enviado os anÃ©is para ser colocado na parte interna das molas',
       '["4- aneis da mola"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Cliente relatou varias vezes que as molas do V4 Chair esta fazendo barulho'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relatou que as tampas laranjas  quebraram', '', 'SerÃ¡ enviado as tampas novas pela garantia mas orientei a cliente que a quebra ocorrei por o carrrinho bater varias vez na tampa do trilho',
       '["2- tampa do trilho V12", "1 elÃ¡stico carrinho V12"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relatou que as tampas laranjas  quebraram'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus Torre', 'Cliente relatou que a pintura do quadro no local que as rodas atuam estÃ£oi desplacando a pintura', '', 'SerÃ¡ enviado os dois quadros com adesivo pela garantia',
       '["1- quadro direito", "1- quadro esquerdo"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus Torre' AND sintoma = 'Cliente relatou que a pintura do quadro no local que as rodas atuam estÃ£oi desplacando a pintura'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relatou que o equipamento esta fazendo barulho', '', 'SerÃ¡ enviado as rodas em garantia',
       '["4 rodas 100mm preta,  4 espacadores"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relatou que o equipamento esta fazendo barulho'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V1', 'Cliente relatou que o Tampo do V1 esta afundando', '', 'SerÃ¡ enviado pela garantia um tampo Novo',
       '["1- tampo V1 completo"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V1' AND sintoma = 'Cliente relatou que o Tampo do V1 esta afundando'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente comprou as rodas 110mm no mÃªs de setembro  e uma das rodas jÃ¡ danificou', '', 'SerÃ¡ enviado duas rodas pela a Garantia e o cliente irÃ¡ comprar 6 rodas',
       '["2 rodas 100mm"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente comprou as rodas 110mm no mÃªs de setembro  e uma das rodas jÃ¡ danificou'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relatou que o elÃ¡stico do v12 e do V8x jÃ¡ estÃ£o com defeito', '', 'SerÃ¡ enviado os elÃ¡sticos do carrinho do V12 e do V8X pela garantia',
       '["Kit elÃ¡stico V8x", "elÃ¡stico carrinho V12"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relatou que o elÃ¡stico do v12 e do V8x jÃ¡ estÃ£o com defeito'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relatou que os elÃ¡stico estorou em pouco tempo', '', 'SerÃ¡ enviado o elÃ¡stico pela garantia',
       '["1- elÃ¡stico carrinho V12"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relatou que os elÃ¡stico estorou em pouco tempo'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente comprou as rodas do v12 e foram 100mm, sendo o equipamento dele utiliza 110mm', '', 'SerÃ¡ enviado as rodas de 100mm para trocar nas 100mm',
       '["4- rodas 100mm"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente comprou as rodas do v12 e foram 100mm, sendo o equipamento dele utiliza 110mm'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente Relatou que foi faltando o Knob do equipamento V12', '', 'SerÃ¡ enviado o Knob pela garantia',
       '["2- Knob V12 preto", "branco"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente Relatou que foi faltando o Knob do equipamento V12'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V2', 'Cliente reportou que suporte do V2 foi o de parde e ele irÃ¡ aclopar no V8', '', 'SerÃ¡ enviado o suporte lado direto',
       '["1- kit fixaÃ§Ã£o V8 lado direito"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V2' AND sintoma = 'Cliente reportou que suporte do V2 foi o de parde e ele irÃ¡ aclopar no V8'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V1', 'Cliente recebeu reportou que o tampo do equipamento afundou', '', 'SerÃ¡ enviado o Tampo do V1 pela garantia',
       '["1- tampo V1 completo"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V1' AND sintoma = 'Cliente recebeu reportou que o tampo do equipamento afundou'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V1', 'Cliente recebeu reportou que o tampo do equipamento afundou', '', 'SerÃ¡ enviado o Tampo do V1 pela garantia',
       '["1- tampo V1 completo"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V1' AND sintoma = 'Cliente recebeu reportou que o tampo do equipamento afundou'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V1', 'Cliente recebeu reportou que o tampo do equipamento afundou', '', 'SerÃ¡ enviado o Tampo do V1 pela garantia',
       '["1- tampo V1 completo"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V1' AND sintoma = 'Cliente recebeu reportou que o tampo do equipamento afundou'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Cliente reportou que a sapata da pedaleira foi um um furo devido a um grande estar saindo de dentro para fora', '', 'SerÃ¡ enviado as duas sapatas pela garantia',
       '["2- sapatas V4  areia"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Cliente reportou que a sapata da pedaleira foi um um furo devido a um grande estar saindo de dentro para fora'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus Torre', 'Cliente relatou que nÃ£o foi junto ao equipamento o kit molas da torre e a cinta de seguranÃ§a', '', 'SerÃ¡ enviado pela garantia',
       '["1- Kit molas", "1- Cinta de SeguranÃ§a"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus Torre' AND sintoma = 'Cliente relatou que nÃ£o foi junto ao equipamento o kit molas da torre e a cinta de seguranÃ§a'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus Torre', 'Cliente relatou que os estofados estÃ£o trincando como resecamento', '', 'SerÃ¡ enviado pela garantia',
       '["1- tampo V1 completo", "1- apoio cabeÃ§a V5", "2 - ombreiras", "2- sapatas"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus Torre' AND sintoma = 'Cliente relatou que os estofados estÃ£o trincando como resecamento'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Cliente relatou que seu aparelho foi sem os elÃ¡sticos', '', 'SerÃ¡ enviado',
       '["1- Kit elÃ¡stico v4 Chair"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Cliente relatou que seu aparelho foi sem os elÃ¡sticos'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Cliente relatou que a trava do equipamentoestorou com pouco tempode uso', '', 'SerÃ¡ enviado pela garantia',
       '["1- Trava da sapata e porcaborboleta 1", "4"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Cliente relatou que a trava do equipamentoestorou com pouco tempode uso'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V5 Plus Torre', 'Cliente relatou que sua capa do barra pÃ© danificou com pouco tempo de uso', '', 'SerÃ¡ enviado pela garantia',
       '["1- Capa Barra PÃ©"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V5 Plus Torre' AND sintoma = 'Cliente relatou que sua capa do barra pÃ© danificou com pouco tempo de uso'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relatou que seu elÃ¡stico do equipamento estorou com pouco tempo de uso', '', 'SerÃ¡ enviado um elÃ¡stico novo pela garantia',
       '["1- elÃ¡stico carrinho V12"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relatou que seu elÃ¡stico do equipamento estorou com pouco tempo de uso'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relatou que as rodas do equipamento estÃ¡ desgastada e estÃ£o fazendo Barulho', '', 'SerÃ¡ enviado pela garantia',
       '["4- rodas 100mm", "8 rolamentos 608-ZZ Timken ( 1 linha )"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relatou que as rodas do equipamento estÃ¡ desgastada e estÃ£o fazendo Barulho'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Cliente reportou que a barra abdomen soltou a solda do pino da barra', '', 'SerÃ¡ enviado a barra Abdomem pela garantia',
       '["1- Barra Abdomen Completa"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Cliente reportou que a barra abdomen soltou a solda do pino da barra'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Cliente relatou que a plataforma do pisante se soltou e quebrou a plataforma', '', 'SerÃ¡ enviado pela garantia',
       '["1- Plataforma V4 Novo cmpleto"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Cliente relatou que a plataforma do pisante se soltou e quebrou a plataforma'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V1', 'Cliente relatou que o tampo do V1 afundou e im dos pÃ©s do V5 foi enviado errado', '', 'SerÃ¡ envaido pela garantia',
       '["1-Tampo V1", "PÃ©s torre Esq", "Kit elÃ¡stico V4"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V1' AND sintoma = 'Cliente relatou que o tampo do V1 afundou e im dos pÃ©s do V5 foi enviado errado'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Cliente reportou que a trava do equipamento das sapatas quebrou', '', 'SerÃ¡ enviado pela garantia',
       '["1- porca borboleta 1", "4", "trava spata V4"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Cliente reportou que a trava do equipamento das sapatas quebrou'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relatou que comprou as rodas para o V12 antigo e enviaram as rodas 110 mm e com isso desgatou prematuramente os roletes debaixo', '', 'SerÃ¡ enviado pela garantia',
       '["4 - rodas 100mm", "8 rolamentos 608 1 linha", "4 - espaÃ§ador v12", "4 bucha limitadora do v12 antigo"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relatou que comprou as rodas para o V12 antigo e enviaram as rodas 110 mm e com isso desgatou prematuramente os roletes debaixo'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V12', 'Cliente relatou que seu elÃ¡stico do equipamento estorou com pouco tempo de uso depois que comprou os elÃ¡sticos recentemente', '', 'SerÃ¡ enviado pela garantia',
       '["Kit Elasticos V12 antigo", "Corda Nautica"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V12' AND sintoma = 'Cliente relatou que seu elÃ¡stico do equipamento estorou com pouco tempo de uso depois que comprou os elÃ¡sticos recentemente'
);

INSERT INTO public.memoria_problema_solucao
  (modelo_aparelho, sintoma, causa_raiz, solucao_md, pecas, tags, aprovada)
SELECT 'V4', 'Cliente Relatou que que a trava do equipamento V4 estorou a solda da trava da sapata', '', 'SerÃ¡ envaido pela garantia',
       '["Trava da sapata completa", "Porca Borboleta 1", "4"]'::jsonb, ARRAY['Troca de componente'], false
WHERE NOT EXISTS (
  SELECT 1 FROM public.memoria_problema_solucao
  WHERE modelo_aparelho = 'V4' AND sintoma = 'Cliente Relatou que que a trava do equipamento V4 estorou a solda da trava da sapata'
);
