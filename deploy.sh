#!/bin/bash
set -e
cd /opt/posvenda
git pull
docker build \
  --build-arg VITE_SUPABASE_URL=https://ehqkggiuouczmafmlzls.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TBXHRRXXZEok0JWK08lbeQ_tcJdv4gZ \
  --build-arg VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVocWtnZ2l1b3Vjem1hZm1semxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzODk3ODksImV4cCI6MjA5MTk2NTc4OX0.bavaN4ODiWlLD82YbN7LwjEyQLuUNZMv_b82NXIDxic \
  -t posvenda:latest .
docker service update --image posvenda:latest --force posvenda_posvenda
docker service ps posvenda_posvenda
echo "Deploy concluido!"
