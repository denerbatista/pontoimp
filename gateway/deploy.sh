#!/usr/bin/env bash
# Sobe o serviço de push do zero. Rode de dentro de gateway/:
#   ./deploy.sh
# Pode rodar de novo sem medo: pula o que já estiver pronto.
set -euo pipefail
cd "$(dirname "$0")"

wr() { npx --yes wrangler@latest "$@"; }
titulo() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

titulo "1/5 · conferindo o login na Cloudflare"
if ! wr whoami >/dev/null 2>&1; then
  echo "Você ainda não está logado. Abrindo o login da Cloudflare no navegador…"
  wr login
fi
wr whoami | head -5

titulo "2/5 · namespace do KV"
if grep -q 'COLE_O_ID_DO_KV_AQUI' wrangler.toml; then
  saida=$(wr kv namespace create PUSH 2>&1) || { echo "$saida"; exit 1; }
  echo "$saida"
  # o wrangler imprime algo como: id = "abc123…"
  id=$(printf '%s' "$saida" | grep -oE '"[0-9a-f]{32}"' | head -1 | tr -d '"')
  if [ -z "$id" ]; then
    echo
    echo "Não consegui achar o id na saída acima."
    echo "Copie o id e cole no lugar de COLE_O_ID_DO_KV_AQUI no wrangler.toml, e rode de novo."
    exit 1
  fi
  # o .bak é exigido pelo sed do macOS; removemos logo em seguida
  sed -i.bak "s/COLE_O_ID_DO_KV_AQUI/$id/" wrangler.toml && rm -f wrangler.toml.bak
  echo "KV criado e gravado no wrangler.toml: $id"
else
  echo "wrangler.toml já tem um id de KV — pulando."
fi

titulo "3/5 · chaves VAPID"
if wr secret list 2>/dev/null | grep -q VAPID_PRIVADA; then
  echo "As chaves já estão configuradas — pulando."
  echo "(pra trocar o par: wrangler secret delete VAPID_PRIVADA e rode de novo)"
else
  chaves=$(node gerar-chaves.mjs --json)
  publica=$(printf '%s' "$chaves" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).publica))')
  # a privada só existe nesta variável e no secret do Worker: nunca vai pra arquivo nem pra tela
  privada=$(printf '%s' "$chaves" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).privada))')
  printf '%s' "$publica" | wr secret put VAPID_PUBLICA
  printf '%s' "$privada" | wr secret put VAPID_PRIVADA
  unset privada chaves
  echo "Chaves geradas e guardadas como secret."
fi

titulo "4/5 · publicando o Worker"
wr deploy

titulo "5/5 · testando"
url=$(grep -E '^name' wrangler.toml | head -1 | sed 's/.*= *"\(.*\)"/\1/')
echo "Confira no navegador (troque SEU-SUBDOMINIO pelo que apareceu acima):"
echo "  https://$url.SEU-SUBDOMINIO.workers.dev/health        → deve responder {\"ok\":true}"
echo "  https://$url.SEU-SUBDOMINIO.workers.dev/push/chave    → deve devolver a chave pública"
echo
echo "Depois, no app: Ajustes → Conexão → cole essa URL em \"URL do serviço de push\","
echo "salve, e toque em 📡 Avisar com o app fechado."
