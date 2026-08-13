# Instruções de deploy — para um agente com credencial da Cloudflare

Este documento é auto-contido. Siga na ordem e reporte o resultado no fim.

## Objetivo

Publicar o Worker `pontoimp-push` na conta Cloudflare do usuário. Ele é o
serviço que entrega as notificações do app PontoImp quando o celular está com o
app fechado. Sem ele o app funciona, mas os avisos só tocam com a aba aberta.

## Contexto

- Repositório: `https://github.com/denerbatista/pontoimp`
- O Worker vive em `gateway/`; o app (GitHub Pages) já está publicado e não precisa de nada.
- O código está pronto e testado. **Não é necessário alterar código.** Se você
  achar que precisa mudar algo, pare e reporte antes de mudar.

## Pré-requisitos

Acesso de escrita ao repositório `denerbatista/pontoimp` (para commitar o id do
KV, ver a seção Restrições) e credencial da Cloudflare, de uma destas formas:

- `CLOUDFLARE_API_TOKEN` no ambiente (preferido), ou
- `wrangler login` interativo.

Se usar token, ele precisa destes escopos, na conta do usuário:

| Escopo | Nível |
|---|---|
| Workers Scripts | Edit |
| Workers KV Storage | Edit |
| Account Settings | Read |

Se a conta tiver mais de uma organização, defina também `CLOUDFLARE_ACCOUNT_ID`.

## Passos

```bash
git clone https://github.com/denerbatista/pontoimp
cd pontoimp/gateway
./deploy.sh
```

O `deploy.sh` é idempotente e faz tudo: confere o login, cria o namespace KV,
grava o id no `wrangler.toml`, gera o par de chaves VAPID, sobe as duas como
secret e publica o Worker.

Se preferir controlar passo a passo, é o equivalente a:

```bash
npx wrangler kv namespace create PUSH     # cole o id no wrangler.toml
node gerar-chaves.mjs                     # gera o par VAPID
npx wrangler secret put VAPID_PUBLICA     # cole a pública
npx wrangler secret put VAPID_PRIVADA     # cole a privada
npx wrangler deploy
```

## Restrições

1. **Nunca commite `VAPID_PRIVADA`**, nem em `wrangler.toml`, nem em qualquer
   arquivo. Ela existe só como secret do Worker. O `deploy.sh` já cuida disso —
   a privada nunca toca o disco.
2. **Não imprima a chave privada** na saída, em log, ou no relatório final.
3. Não altere `ORIGEM_PERMITIDA` no `wrangler.toml`. Ela está apontando para
   `https://denerbatista.github.io`, que é onde o app roda. Mudar para `*`
   abriria o serviço para qualquer origem.

3b. **Não renomeie o Worker.** O `name = "pontoimp-push"` no `wrangler.toml`
   precisa ficar como está: o app tem a URL embutida em `index.html`
   (`https://pontoimp-push.dener70.workers.dev`), e com o nome certo o usuário
   não precisa configurar nada. Se a URL final sair diferente disso — outro
   subdomínio workers.dev, por exemplo — **reporte a URL real**, porque aí o
   usuário terá que preencher o campo à mão nos Ajustes.
4. O `deploy.sh` grava o id do KV no `wrangler.toml`. **Commite e dê push dessa
   mudança na `main`** — sem isso o id se perde e o próximo deploy cria um KV
   novo, vazio, e as inscrições existentes param de receber. O id do KV não é
   segredo; pode ir para o repositório à vontade.

   O único arquivo que você deve alterar é o `wrangler.toml`, e só a linha do
   `id`. Se precisar mexer em qualquer outra coisa, pare e reporte antes.

   ```bash
   git add wrangler.toml
   git commit -m "Grava o id do KV do serviço de push"
   git push origin main
   ```

## Verificação

Depois do deploy, com `URL` = a URL do Worker que o wrangler imprimiu:

```bash
curl -s "$URL/health"        # esperado: {"ok":true}
curl -s "$URL/push/chave"    # esperado: {"publica":"B..."} com ~87 caracteres
```

Os dois precisam responder. Se `/push/chave` devolver `{"publica":null}`, os
secrets não foram gravados — repita o passo das chaves.

Confirme também que o cron ficou ativo: no painel da Cloudflare, o Worker
`pontoimp-push` deve mostrar um trigger `* * * * *`. Sem ele nada é entregue.

Testes locais (não precisam de rede, servem para confirmar que nada quebrou):

```bash
cd ..
npm install
npm test        # 21 motor + 18 cifra + 24 worker + 36 UI
```

## Reporte no fim

Devolva ao usuário exatamente estes itens:

1. A URL pública do Worker (ex.: `https://pontoimp-push.SUBDOMINIO.workers.dev`)
2. A resposta do `/health` e do `/push/chave`
3. Se o cron de 1 minuto está ativo
4. Se houve commit (e em qual branch)

E instrua o usuário a terminar no celular, que é o passo que nenhum agente pode fazer:

> Abra o app → Ajustes → Conexão → cole a URL em "URL do serviço de push" →
> Salvar → volte e toque em **📡 Avisar com o app fechado** → depois em
> **✉️ Testar push**. A notificação deve chegar em segundos, mesmo com o app fechado.

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `Authentication error [code: 10000]` | token sem escopo de Workers | refazer o token com os escopos da tabela acima |
| `KV namespace 'PUSH' is not valid` | id não gravado no `wrangler.toml` | rodar `wrangler kv namespace create PUSH` e colar o id |
| `/push/chave` devolve `null` | secrets não gravados | `wrangler secret put VAPID_PUBLICA` e `VAPID_PRIVADA` |
| deploy passa mas nada chega no celular | cron inativo, ou app sem a URL | conferir o trigger e a URL nos Ajustes do app |
| `More than one account available` | conta com várias orgs | definir `CLOUDFLARE_ACCOUNT_ID` |

## O que este deploy não resolve

O Android pode congelar o app mesmo com push funcionando. No Galaxy S10 (One UI),
vale conferir: **Configurações → Apps → PontoImp → Bateria → Irrestrito**.
Isso é no aparelho do usuário; nenhum agente faz por ele.
