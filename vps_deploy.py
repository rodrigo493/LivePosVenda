import paramiko
import time

HOST = '103.199.187.99'
USER = 'root'
PASS = 'live28Rmz450cc&&&'

SUPABASE_URL = 'https://ehqkggiuouczmafmlzls.supabase.co'
SUPABASE_KEY = 'sb_publishable_TBXHRRXXZEok0JWK08lbeQ_tcJdv4gZ'

def run(client, cmd, timeout=300):
    print(f'\n$ {cmd}')
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out.strip(): print(out.strip())
    if err.strip(): print('[stderr]', err.strip())
    return out, err

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS)
print('Conectado à VPS!')

# 1. Check existing services
run(client, 'docker service ls')

# 2. Clone or pull repo
run(client, 'mkdir -p /opt/posvenda && cd /opt/posvenda && (git pull 2>/dev/null || git clone https://github.com/rodrigo493/LivePosVenda.git .)')

# 3. Pull latest
run(client, 'cd /opt/posvenda && git pull origin main && git log --oneline -1')

# 4. Build image
print('\nBuilding Docker image (pode demorar 3-5 min)...')
out, err = run(client, f'''cd /opt/posvenda && docker build --no-cache \
  --build-arg VITE_SUPABASE_URL="{SUPABASE_URL}" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="{SUPABASE_KEY}" \
  -t posvenda:latest . 2>&1 | tail -5''', timeout=600)

# 5. Check if service exists
out, _ = run(client, 'docker service ls --filter name=posvenda -q')
service_exists = out.strip()

if service_exists:
    print('\nAtualizando serviço existente...')
    run(client, 'docker service update --image posvenda:latest --force posvenda_posvenda')
else:
    print('\nCriando novo serviço...')
    run(client, '''docker service create \
  --name posvenda_posvenda \
  --replicas 1 \
  --network squad_public \
  --label "traefik.enable=true" \
  --label "traefik.http.routers.posvenda.rule=Host(`posvenda.liveuni.com.br`)" \
  --label "traefik.http.routers.posvenda.entrypoints=websecure" \
  --label "traefik.http.routers.posvenda.tls.certresolver=letsencrypt" \
  --label "traefik.http.services.posvenda.loadbalancer.server.port=80" \
  posvenda:latest''')

# 6. Verify
run(client, 'docker service ps posvenda_posvenda')

client.close()
print('\nDeploy concluído!')
