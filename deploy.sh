#!/bin/bash
set -e
cd /opt/posvenda
git pull
docker build \
  --build-arg VITE_SUPABASE_URL=https://ehqkggiuouczmafmlzls.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TBXHRRXXZEok0JWK08lbeQ_tcJdv4gZ \
  -t posvenda:latest .
docker service update --image posvenda:latest --force posvenda_posvenda
docker service ps posvenda_posvenda
echo "Deploy concluido!"
