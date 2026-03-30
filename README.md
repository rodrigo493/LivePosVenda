# Live Care — Assistência Técnica & Pós-venda

Sistema de gestão de assistência técnica, garantia e pós-venda da **Live Equipamentos**.

## Stack

- **Frontend:** React 18 + TypeScript + Vite 8
- **UI:** shadcn/ui + Tailwind CSS
- **Backend:** Supabase (Auth, Database, Edge Functions)
- **Charts:** Recharts
- **Forms:** React Hook Form + Zod

## Desenvolvimento

```bash
# Instalar dependências
npm install --legacy-peer-deps

# Servidor de desenvolvimento
npm run dev

# Build de produção
npm run build

# Lint
npm run lint

# Testes
npm run test
```

## Deploy

1. `npm run build`
2. Servir a pasta `dist/` com Apache ou Nginx
3. Apache: usar o `.htaccess` incluso para SPA routing
4. Nginx: `try_files $uri $uri/ /index.html`

## Variáveis de Ambiente

Copie `.env.example` para `.env` e preencha com suas credenciais do Supabase.
