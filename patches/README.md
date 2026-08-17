# Patches para o gateway do Secullum

O gateway do Secullum não vive neste repositório. Os arquivos aqui são
alterações prontas para aplicar nele.

> Não confundir com a pasta `gateway/` da raiz: aquela é o **serviço de push**,
> outro Worker, que vive aqui mesmo.

## Qual arquivo usar

| arquivo | o que é | quando usar |
|---|---|---|
| `worker-gateway-completo.js` | o Worker **inteiro**, já com as rotas novas | **use este** — é só apagar tudo e colar por cima |
| `worker-gateway-rotas.js` | só o bloco das rotas novas | se preferir encaixar no meio do arquivo existente |
| `gateway-inconsistencias.patch` | projeto Fastify/Node | não publicado — mantido só por referência |
| `test_worker_gateway.mjs` | confere o arquivo completo antes de publicar | `node patches/test_worker_gateway.mjs` |

O código Fastify (`import Fastify`, `app.get(...)`, cofre com JWT) nunca foi ao
ar. O que responde em `pontoimp-gateway.dener70.workers.dev` é um Worker
independente, bem menor, com sessão cifrada em AES-GCM no próprio token.

## Como publicar (pelo painel, dá pra fazer no celular)

1. Abra **dash.cloudflare.com** e entre na conta.
2. Menu lateral → **Workers & Pages**.
3. Na lista, toque em **`pontoimp-gateway`**.
   São dois Workers na conta; o outro é o de push, **não é esse**. Confira que a
   URL mostrada é `pontoimp-gateway.dener70.workers.dev`.
4. Botão **Edit code** (ou **Editar código**), no canto superior direito.
5. Abre um editor com o arquivo do Worker. Toque dentro dele e **selecione tudo**
   (no celular: toque e segure → "Selecionar tudo") e **apague**.
6. Cole o conteúdo de `patches/worker-gateway-completo.js` no lugar.
7. Botão **Deploy** (ou **Salvar e implantar**). Leva uns segundos.

### Conferir se subiu

Abra no navegador:

```
https://pontoimp-gateway.dener70.workers.dev/health
```

Tem que responder `{"ok":true,...}`. Depois é só usar o app: abra um dia no
histórico e mande um ajuste. Se voltar 404, o deploy não pegou; se voltar a
resposta do Secullum, está no ar.

### Se preferir pelo Wrangler

O ideal é editar o **fonte** (`worker.mjs`) e republicar com `wrangler deploy` —
editar pelo painel funciona, mas o próximo `wrangler deploy` sobrescreve. Se
você tiver o fonte em algum lugar, aplique o bloco de `worker-gateway-rotas.js`
nele e publique por lá.

## O que as rotas destravam

| método | rota | repassa para | destrava |
|---|---|---|---|
| POST | `/me/solicitacao` | `/Solicitacoes` | o **ajuste de ponto** — o dia inteiro numa solicitação, que vai pra aprovação do gestor |
| GET | `/me/solicitacoes?inicio=&fim=&status=` | `/Solicitacoes/{ini}/{fim}/{status}/0/0` | ver o que já foi pedido e em que pé está |
| POST | `/me/ponto` | `/IncluirPonto?funcionarioId={id}` | o botão `＋` de incluir batida que faltou |
| GET | `/me/inconsistencias?inicio=&fim=&status=` | `/Inconsistencias/{ini}/{fim}/{status}` | a listagem de pendências |
| POST | `/me/inconsistencia` | `/Inconsistencias` | o envio da **justificativa** |

Duas observações:

- **`/me/inconsistencias`** já funciona hoje sem esta rota, porque o app cai no
  `/me/raw` quando leva 404. A rota dedicada só deixa mais direto.
- **`/me/inconsistencia`** e **`/me/solicitacao`** não têm alternativa: a
  escotilha `/me/raw` é só GET, de propósito. Sem elas, ajustar e justificar
  não funcionam.

### Sobre o corpo do POST de inconsistência

É o objeto que veio do GET, **inteiro**, só com `justificativa` preenchido. É
assim que o app oficial do Secullum faz. Campos que não interpretamos precisam
voltar intactos, então o Worker repassa sem tocar em nada — e o app também não
mexe.
