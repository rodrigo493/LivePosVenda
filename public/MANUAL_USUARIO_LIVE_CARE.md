# 📘 Manual do Usuário — Live Care

**Sistema de Gestão de Assistência Técnica e CRM Operacional**

---

## Sumário

1. [Acesso ao Sistema](#1-acesso-ao-sistema)
2. [Meu Painel (Dashboard Pessoal)](#2-meu-painel)
3. [CRM Pipeline (Kanban)](#3-crm-pipeline)
4. [Clientes](#4-clientes)
5. [Equipamentos](#5-equipamentos)
6. [Chamados (Tickets)](#6-chamados)
7. [Garantias](#7-garantias)
8. [Assistência Técnica](#8-assistência-técnica)
9. [Orçamentos](#9-orçamentos)
10. [Ordens de Serviço](#10-ordens-de-serviço)
11. [Manutenção Preventiva](#11-manutenção-preventiva)
12. [Produtos e Peças](#12-produtos-e-peças)
13. [Relatórios](#13-relatórios)
14. [Importação de Histórico](#14-importação-de-histórico)
15. [Tarefas](#15-tarefas)
16. [Alertas e Prioridades do Dia](#16-alertas-e-prioridades-do-dia)
17. [Dashboard do Administrador](#17-dashboard-do-administrador)
18. [Portal do Cliente](#18-portal-do-cliente)
19. [Configurações](#19-configurações)
20. [Dicas e Boas Práticas](#20-dicas-e-boas-práticas)

---

## 1. Acesso ao Sistema

### Como acessar
- Acesse o endereço fornecido pela empresa no navegador (Chrome, Edge ou Firefox recomendados).
- Faça login com seu **e-mail** e **senha** cadastrados.
- Caso não tenha conta, solicite ao administrador.

### Primeira vez no sistema
- Ao acessar pela primeira vez, confirme seu e-mail clicando no link enviado para sua caixa de entrada.
- Após confirmar, faça login normalmente.

---

## 2. Meu Painel

> **Menu lateral → Meu Painel**

O "Meu Painel" é sua tela principal de trabalho diário. Ele mostra tudo que é relevante **para você**.

### O que você encontra aqui:

#### 🔔 Prioridades do Dia (topo da tela)
Uma saudação personalizada com um resumo automático do seu dia. Exemplo:

> *"Bom dia, João. Hoje você tem 4 tarefas vencidas, 3 tickets sem primeiro contato e 6 clientes sem interação há mais de 2 dias."*

Cinco blocos clicáveis mostram:

| Bloco | Significado |
|-------|------------|
| **Clientes atrasados** | Tickets sem interação há mais de 2 dias |
| **Tarefas vencidas** | Tarefas com prazo expirado e não concluídas |
| **Tarefas para hoje** | Tarefas com vencimento hoje |
| **Sem primeiro contato** | Tickets que ainda não foram movidos da etapa inicial |
| **Sem interação >2 dias** | Tickets parados há mais de 2 dias (exceto os já concluídos) |

**Clique em qualquer bloco** para expandir e ver a lista detalhada dos itens.

#### 📊 Indicadores (KPIs)
- **Ativos**: tickets abertos sob sua responsabilidade
- **Concluídos**: tickets finalizados
- **Atrasados**: tickets sem interação há mais de 2 dias
- **Média s/ interação**: média de dias sem atualização nos seus tickets

#### 📋 Pipeline resumido
Mostra quantos tickets você tem em cada etapa do pipeline.

#### ⚠️ Clientes atrasados
Lista dos clientes cujos tickets estão sem interação, com contador de dias.

#### ✅ Tarefas do dia
Resumo das suas tarefas vencendo hoje, atrasadas e pendentes.

#### 📦 Aguardando peça / 📞 Sem atendimento
Listas rápidas de tickets nessas etapas específicas.

---

## 3. CRM Pipeline

> **Menu lateral → CRM Pipeline**

Visão estilo **Kanban** de todos os atendimentos da assistência técnica.

### Etapas do Pipeline

| Etapa | Descrição |
|-------|-----------|
| **Sem atendimento** | Ticket criado, mas nenhum contato foi feito |
| **Primeiro contato** | Primeiro contato realizado com o cliente |
| **Em análise** | Problema está sendo analisado pela equipe |
| **Separação de peças** | Aguardando peças para resolver o atendimento |
| **Concluído** | Atendimento finalizado com sucesso |
| **Sem interação** | Ticket parado, sem atualizações recentes |

### Como usar

#### Mover um ticket entre etapas
1. **Arraste o card** de uma coluna para outra (drag and drop).
2. O sistema registra automaticamente a movimentação no histórico.
3. A data de última interação é atualizada.

#### Entender os cards
Cada card mostra:
- 👤 **Nome do cliente**
- 🔧 **Equipamento** (número de série e modelo)
- 📝 **Resumo do problema**
- ⏰ **Dias sem interação** (badge vermelho se > 2 dias)
- 🎯 **Prioridade** (badge colorido)
- 💰 **Valor estimado** (se houver)
- 📋 **Número do ticket**

#### Alertas visuais nos cards
- **Borda vermelha + badge "Xd"**: ticket sem interação há mais de 2 dias
- **Badge "Sem contato"**: ticket na etapa "Sem atendimento"
- Cards com alerta são **automaticamente movidos para o topo** da coluna

#### Cabeçalho de cada coluna
- Nome da etapa com cor identificadora
- **Contador de cards** na etapa
- **Total financeiro** dos tickets (soma dos valores estimados)

### Filtros
- Use a **barra de busca** para filtrar por nome de cliente, título do ticket ou número.
- Filtre por **prioridade** (Todas, Urgente, Alta, Normal, Baixa).

---

## 4. Clientes

> **Menu lateral → Clientes**

Cadastro e gerenciamento de todos os clientes da empresa.

### Funcionalidades
- **Criar novo cliente**: botão "Novo Cliente"
- **Editar cliente**: clique no ícone de edição na linha
- **Buscar cliente**: use a barra de busca
- **Dados cadastrais**: nome, documento (CPF/CNPJ), email, telefone, WhatsApp, endereço completo
- **Status**: ativo ou inativo

---

## 5. Equipamentos

> **Menu lateral → Equipamentos**

Registro de todos os equipamentos vinculados a clientes.

### Informações do equipamento
- **Número de série** (identificador único)
- **Modelo** (vinculado ao catálogo de modelos)
- **Cliente** proprietário
- **Lote** de fabricação
- **Data de fabricação, venda e instalação**
- **Status da garantia** (em garantia, expirada, etc.)
- **Data de expiração da garantia**

### Modelos de equipamento
- Cadastro de modelos com nome, categoria, descrição e prazo de garantia padrão
- Compatibilidade com peças e produtos

---

## 6. Chamados (Tickets)

> **Menu lateral → Chamados**

Central de abertura e gerenciamento de chamados técnicos.

### Tipos de chamado
- **Chamado Técnico**: problema técnico geral
- **Garantia**: reclamação dentro da garantia
- **Assistência**: solicitação de assistência técnica

### Status possíveis
| Status | Significado |
|--------|------------|
| Aberto | Recém criado |
| Em análise | Sendo avaliado pela equipe |
| Aguardando informações | Esperando retorno do cliente |
| Aguardando peça | Peça necessária em separação/envio |
| Agendado | Visita ou ação programada |
| Em atendimento | Técnico atuando |
| Aprovado | Orçamento aprovado pelo cliente |
| Reprovado | Orçamento recusado |
| Resolvido | Problema solucionado |
| Fechado | Ticket encerrado |

### Criar um chamado
1. Clique em **"Novo Chamado"**
2. Preencha: cliente, equipamento, tipo, título, descrição, prioridade
3. O sistema gera um número de ticket automaticamente (ex: TK-0001)

### Campos importantes
- **Responsável**: quem está cuidando do atendimento
- **Prioridade**: urgente, alta, normal, baixa
- **Categoria do problema**: tipo de falha
- **Canal**: como o chamado chegou (WhatsApp, telefone, email, etc.)
- **Valor estimado**: previsão de custo do atendimento
- **Notas internas**: observações visíveis apenas para a equipe

---

## 7. Garantias

> **Menu lateral → Garantias**

Gestão de análises de garantia vinculadas a chamados.

### Fluxo de garantia
1. Chamado é aberto como tipo "Garantia"
2. Análise de garantia é criada
3. Equipe avalia: descrição do defeito, análise técnica, data de compra e instalação
4. Decisão: **Aprovada**, **Reprovada** ou **Convertida em OS**

### Informações da análise
- Período de garantia (meses)
- Peças cobertas
- Mão de obra coberta (sim/não)
- Custo interno
- Motivo da aprovação/reprovação
- Veredito final

---

## 8. Assistência Técnica

> **Menu lateral → Assistência**

Solicitações de serviço vinculadas a chamados.

### Tipos de serviço
- Corretiva
- Preventiva
- Inspeção
- Troca de peça
- Suporte

### Status
- Aberto → Orçamento enviado → Agendado → Em andamento → Resolvido/Cancelado

---

## 9. Orçamentos

> **Menu lateral → Orçamentos**

Criação e gestão de orçamentos para clientes.

### Como criar um orçamento
1. Clique em **"Novo Orçamento"**
2. Selecione o cliente e, opcionalmente, o equipamento
3. Adicione itens (peças, serviços, frete)
4. Defina desconto e frete
5. O sistema calcula subtotal e total automaticamente

### Tipos de item
- Peça em garantia
- Peça cobrada
- Serviço em garantia
- Serviço cobrado
- Frete
- Desconto

### Status do orçamento
- Rascunho → Aguardando aprovação → Aprovado/Reprovado → Convertido em OS / Cancelado

### Gerar PDF
- Na tela de detalhe do orçamento, clique em **"Gerar PDF"** para baixar o documento formatado.

---

## 10. Ordens de Serviço

> **Menu lateral → Ordens de Serviço**

Gestão de ordens de serviço (OS) geradas a partir de orçamentos ou diretamente.

### Tipos de OS
- Garantia
- Pós-venda
- Preventiva
- Assistência

### Status
- Aberta → Agendada → Em andamento → Concluída / Cancelada

### Informações da OS
- Número da OS (gerado automaticamente)
- Cliente e equipamento
- Técnico responsável
- Diagnóstico, causa e solução
- Tempo de serviço (horas)
- Itens utilizados (peças e serviços)
- Notas internas

---

## 11. Manutenção Preventiva

> **Menu lateral → Manutenção Prev.**

Planejamento e registro de manutenções preventivas por equipamento.

### Planos de manutenção
- Componente a ser mantido
- Intervalo em meses
- Última manutenção realizada
- Próxima manutenção prevista
- Recomendações

### Eventos de manutenção
- Registro de cada manutenção realizada
- Data, descrição, técnico responsável

---

## 12. Produtos e Peças

> **Menu lateral → Produtos e Peças**

Catálogo completo de peças e produtos.

### Informações do produto
- Código e código secundário
- Nome e descrição
- Categoria, subcategoria, família e grupo
- Custo base e preço sugerido
- Margem de lucro
- Impostos (ICMS, IPI, PIS, COFINS, CSLL, IRPJ)
- Estoque atual e mínimo
- Fornecedor
- Vida útil (meses)
- Compatibilidade com modelos de equipamento
- Status de disponibilidade em estoque

### Importação de produtos
- Importação em massa via arquivo CSV
- Mapeamento de colunas automático

---

## 13. Relatórios

> **Menu lateral → Relatórios**

Relatórios e análises operacionais do sistema.

---

## 14. Importação de Histórico

> **Menu lateral → Importar Histórico**

Importação de dados históricos de atendimentos a partir de planilhas CSV.

### Como importar
1. **Upload**: arraste ou selecione seu arquivo CSV/TXT
2. **Mapeamento**: o sistema sugere a correspondência das colunas. Ajuste se necessário
3. **Validação**: revise os dados — o sistema indica linhas válidas, com alertas ou com erros
4. **Importação**: confirme para gravar os dados no sistema
5. **Resultado**: veja o resumo com total importado, erros e ignorados

### O que é importado
- Clientes (criados automaticamente se não existirem)
- Equipamentos (vinculados ao modelo informado)
- Chamados históricos (com origem "importação")
- Histórico técnico (soluções, peças, fretes)

---

## 15. Tarefas

As tarefas são ações que você precisa realizar, vinculadas ou não a tickets e clientes.

### Criar uma tarefa
Tarefas podem ser criadas a partir do dashboard ou vinculadas a tickets.

### Exemplos de tarefas
- Ligar para cliente
- Pedir vídeo do problema
- Cobrar fornecedor
- Separar peça
- Enviar orçamento
- Confirmar recebimento
- Acompanhar entrega

### Campos da tarefa
| Campo | Descrição |
|-------|-----------|
| Título | Nome resumido da ação |
| Descrição | Detalhes adicionais |
| Ticket relacionado | Chamado vinculado (opcional) |
| Cliente relacionado | Cliente vinculado (opcional) |
| Responsável | Quem deve executar |
| Data de vencimento | Prazo para conclusão |
| Prioridade | Urgente, alta, normal, baixa |
| Status | Pendente, em andamento, concluída |

### Status da tarefa
- **Pendente**: ainda não iniciada
- **Em andamento**: sendo executada
- **Concluída**: finalizada
- **Atrasada**: passou do prazo sem ser concluída (calculado automaticamente)

---

## 16. Alertas e Prioridades do Dia

O sistema monitora automaticamente seus atendimentos e gera alertas visuais.

### Regras de alerta

| Situação | Regra |
|----------|-------|
| **Cliente atrasado** | Ticket sem interação há mais de 2 dias |
| **Tarefa vencida** | Prazo expirado + status ≠ concluída |
| **Tarefa para hoje** | Vencimento = hoje + status pendente/em andamento |
| **Sem primeiro contato** | Ticket na etapa "Sem atendimento" |
| **Ticket parado** | Sem atualização há mais de 2 dias |

### Como os alertas aparecem

1. **No Meu Painel**: seção "Prioridades do dia" no topo
2. **No CRM Pipeline**: badge vermelho com dias de atraso, cards movidos para o topo
3. **Nas listas**: indicadores visuais de prioridade e atraso

### O que conta como "interação"
- Mudança de etapa no pipeline
- Atualização do ticket
- Criação de tarefa vinculada
- Registro de observação

---

## 17. Dashboard do Administrador

> **Menu lateral → Dashboard**

Visão consolidada de toda a operação para gestores.

### O que mostra
- **KPIs gerais**: tickets abertos, concluídos, atrasados, taxa de resolução
- **Visão da equipe**: ranking de usuários por pendências
- **Tickets atrasados por usuário**
- **Tarefas vencidas por usuário**
- **Tickets sem primeiro contato por usuário**
- **Alertas operacionais**: resumo de problemas que precisam de atenção
- **Resumo por IA**: análise automática gerada por inteligência artificial

---

## 18. Portal do Cliente

> **Menu lateral → Portal do Cliente**

Área de acesso para clientes acompanharem seus atendimentos (quando habilitado).

---

## 19. Configurações

> **Menu lateral → Configurações**

Configurações gerais do sistema e da conta do usuário.

---

## 20. Dicas e Boas Práticas

### Para o dia a dia
1. **Comece pelo "Meu Painel"**: veja suas prioridades antes de qualquer coisa
2. **Atualize os tickets diariamente**: mova os cards no pipeline para evitar alertas de atraso
3. **Crie tarefas**: registre tudo que precisa fazer, com prazos
4. **Use o CRM Pipeline**: arraste cards entre colunas para manter o fluxo organizado
5. **Registre observações**: quanto mais informação no ticket, melhor a análise

### Para evitar atrasos
- Responda clientes em até **2 dias** (após esse prazo o sistema alerta automaticamente)
- Verifique diariamente a seção **"Prioridades do dia"**
- Priorize os blocos em vermelho (atrasados e vencidos)
- Conclua tarefas assim que possível para manter o painel limpo

### Atalhos úteis
- **Barra de busca** no CRM: filtre rapidamente por cliente ou ticket
- **Clique nos blocos** de prioridades: veja detalhes sem sair do painel
- **Drag and drop**: arraste cards no Kanban para mudar de etapa rapidamente

---

## ❓ Dúvidas Frequentes

**P: Como sei se estou com atrasos?**
R: Acesse o "Meu Painel". Se houver blocos em vermelho na seção "Prioridades do dia", você tem pendências urgentes.

**P: O que acontece quando arrasto um card no pipeline?**
R: O ticket muda de etapa, a data de interação é atualizada e um registro é criado no histórico técnico.

**P: Posso ver tickets de outros usuários?**
R: No CRM Pipeline todos os tickets são visíveis. No "Meu Painel", você vê apenas os seus.

**P: Como crio uma tarefa vinculada a um ticket?**
R: As tarefas podem ser criadas com um ticket e/ou cliente associados.

**P: O que significa o badge vermelho com "5d" no card?**
R: Significa que o ticket está há 5 dias sem interação. Precisa de atenção urgente.

**P: Quem vê o Dashboard do Administrador?**
R: Apenas usuários com perfil de administrador.

---

*Live Care — Sistema de Gestão de Assistência Técnica*
*Manual v1.0*
