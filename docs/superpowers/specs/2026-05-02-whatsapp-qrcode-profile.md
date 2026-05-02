# Spec: Página de Perfil + Conexão WhatsApp via QR Code

**Data:** 2026-05-02  
**Projeto:** LivePosVenda  
**Status:** Aprovado

---

## Objetivo

Permitir que cada usuário conecte seu número WhatsApp (instância Uazapi vinculada a ele) escaneando um QR code diretamente na página de perfil. Após conexão, o `phone_number` da instância é atualizado automaticamente no banco. Um indicador permanente na barra superior mostra o estado da conexão em tempo real.

---

## Escopo

### Incluído
- Página `/meu-perfil` com dados pessoais e seção WhatsApp
- Edge function `whatsapp-instance-status` (proxy seguro para Uazapi)
- Indicador de status (bolinha verde/vermelha) no header para usuários com instância vinculada
- Link "Meu Perfil" no popover do avatar no header
- Atualização automática de `phone_number` após conexão bem-sucedida
- Troca de senha pelo próprio usuário na página de perfil

### Excluído
- Criação ou vinculação de instâncias (permanece exclusivo para admin em Configurações)
- Push via WebSocket / Supabase Realtime
- Notificações push de desconexão

---

## Arquitetura

### Novos arquivos

| Arquivo | Tipo | Responsabilidade |
|---------|------|------------------|
| `src/pages/ProfilePage.tsx` | Página React | Exibe dados pessoais + seção WhatsApp |
| `src/components/profile/WhatsAppQrConnect.tsx` | Componente | QR code, polling, status badge |
| `supabase/functions/whatsapp-instance-status/index.ts` | Edge Function | Proxy Uazapi → retorna estado + QR + telefone |

### Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `src/App.tsx` | Adiciona rota `/meu-perfil` + lazy import de ProfilePage |
| `src/components/layout/AppLayout.tsx` | Indicador de status no header + link "Meu Perfil" no popover |

---

## Edge Function: `whatsapp-instance-status`

### Entrada
```
POST /functions/v1/whatsapp-instance-status
Authorization: Bearer <jwt>
{ "instance_id": "uuid" }
```

### Lógica
1. Valida JWT — rejeita 401 se inválido
2. Busca `pipeline_whatsapp_instances` WHERE `id = instance_id`
3. Autorização: `row.user_id = auth.uid()` OU usuário tem role `admin` (verificado via `user_roles` com service role key) — caso contrário 403
4. `GET {base_url}/instance/connectionState` com header `token: {instance_token}`
   - **Nota:** endpoint exato a confirmar na API Uazapi; alternativas: `/instance/status`, `/instance/state`
5. Se estado ≠ `open`: `GET {base_url}/instance/qrcode` → retorna base64
   - **Nota:** endpoint exato a confirmar; o campo da resposta pode ser `qrcode`, `base64`, ou `qr`
6. Se estado = `open`:
   - `GET {base_url}/instance/info` → extrai número conectado
   - **Nota:** campo do número na resposta a confirmar; candidatos: `wid`, `phone`, `jid`, `pushName`
   - Se `phone_number` no banco for diferente → `UPDATE pipeline_whatsapp_instances SET phone_number = <numero>`
7. Retorna `{ state, qrcode, phone }`

### Resposta
```json
{
  "state": "open" | "close" | "connecting",
  "qrcode": "data:image/png;base64,..." | null,
  "phone": "5548996068686" | null
}
```

### Segurança
- Token Uazapi nunca é exposto ao frontend
- Usuário só acessa instância onde `user_id = auth.uid()` (admin acessa qualquer)
- Sem parâmetros de query — tudo via body POST autenticado

---

## Componente: `WhatsAppQrConnect`

### Props
```ts
interface Props {
  instance: {
    id: string;
    instance_name: string;
    phone_number: string | null;
    base_url: string;
  };
}
```

### Comportamento
- Ao montar: chama edge function para obter estado inicial
- Se `state !== "open"`: inicia polling a cada **3 segundos**
- Se `state === "open"`: para polling, exibe número conectado + toast de sucesso (apenas na primeira vez que abre)
- Estados visuais:
  - `open` → badge verde "Conectado" + número + mensagem de sucesso
  - `connecting` → badge âmbar animado "Conectando..." + QR code
  - `close` → badge vermelho "Desconectado" + QR code + instrução de scan
- Instrução: *"Abra o WhatsApp → Aparelhos conectados → Conectar aparelho"*
- QR code renderizado como `<img src={qrcode} />` (base64 direto)
- Polling para quando componente é desmontado (cleanup no useEffect)

---

## Indicador no Header (`AppLayout`)

### Lógica
- Ao montar o layout: busca `pipeline_whatsapp_instances` WHERE `user_id = auth.uid()` LIMIT 1
- Se nenhuma instância → sem indicador
- Se tem instância → inicia polling a cada **30 segundos** chamando a edge function
- Renderiza ao lado do avatar:
  - `●` verde: `state === "open"` — tooltip "WhatsApp conectado"
  - `●` âmbar piscando (animate-pulse): `state === "connecting"` — tooltip "WhatsApp conectando..."
  - `●` vermelho: `state === "close"` — tooltip "WhatsApp desconectado"
- Clique na bolinha navega para `/meu-perfil`

---

## Página: `ProfilePage`

### Seção 1 — Dados Pessoais
- Avatar circular com iniciais (mesma cor laranja do header)
- Nome completo, e-mail
- Roles exibidas como badges (igual ao popover)
- Job functions exibidas como badges secundários
- Troca de senha: campo senha nova (mín. 6 chars) + botão Salvar → chama `manage-users` PATCH

### Seção 2 — Meu WhatsApp
- Visível apenas se o usuário tem `pipeline_whatsapp_instances` com `user_id = auth.uid()`
- Título da instância + componente `<WhatsAppQrConnect />`
- Se usuário não tem instância: seção oculta (sem mensagem de erro)

### Rota
`/meu-perfil` — acessível por todos os usuários autenticados

---

## Navegação

### Popover do avatar (AppLayout)
Adicionar antes do botão "Sair":
```
[UserCircle] Meu Perfil  →  navega para /meu-perfil
```

---

## Tratamento de erros

| Situação | Comportamento |
|----------|--------------|
| Uazapi offline / timeout | Exibe "Não foi possível conectar ao servidor WhatsApp. Tente novamente." + botão Tentar Novamente |
| Instância sem user_id | Seção WhatsApp não aparece |
| Edge function retorna 403 | Exibe "Instância não vinculada a este usuário" |
| QR code expirado (Uazapi renova automaticamente) | Próximo poll já traz o novo QR — transparente para o usuário |

---

## Testes manuais esperados

- [ ] Usuário sem instância vinculada: seção WhatsApp não aparece, sem indicador no header
- [ ] Usuário com instância desconectada: vê QR code + bolinha vermelha no header
- [ ] Escanear QR: status muda para conectado, phone_number atualizado no banco, bolinha vira verde
- [ ] Admin: pode ver QR de qualquer instância via /meu-perfil (a dele) ou Settings (todas)
- [ ] Polling para ao navegar para outra página (sem memory leak)
