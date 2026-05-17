#!/bin/bash
set -e
cd /opt/posvenda

echo "==> [1/4] git pull"
git pull origin main

echo "==> [2/4] Supabase migrations (db push)"
supabase db push

echo "==> [3/4] Supabase edge functions"
supabase functions deploy trigger-automations
supabase functions deploy execute-automations
supabase functions deploy nomus-search
supabase functions deploy nomus-create-purchase-order
supabase functions deploy send-purchase-order-email
supabase functions deploy extract-supplier-quote

echo "==> [4/4] Frontend (Docker build + service update)"
docker build \
  --build-arg VITE_SUPABASE_URL=https://ehqkggiuouczmafmlzls.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TBXHRRXXZEok0JWK08lbeQ_tcJdv4gZ \
  --build-arg VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVocWtnZ2l1b3Vjem1hZm1semxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzODk3ODksImV4cCI6MjA5MTk2NTc4OX0.bavaN4ODiWlLD82YbN7LwjEyQLuUNZMv_b82NXIDxic \
  --build-arg VITE_INSTAGRAM_APP_ID=1761268258581130 \
  -t posvenda:latest .
docker service update --image posvenda:latest --force posvenda_posvenda
docker service ps posvenda_posvenda

echo "Deploy concluido!"
