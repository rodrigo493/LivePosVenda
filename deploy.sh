#!/bin/bash
set -e
docker build --no-cache \
  --build-arg VITE_SUPABASE_URL=https://ehqkggiuouczmafmlzls.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TBXHRRXXZEok0JWK08lbeQ_tcJdv4gZ \
  -t posvenda:latest /opt/posvenda
docker service update --image posvenda:latest --force posvenda_posvenda
docker service ps posvenda_posvenda
