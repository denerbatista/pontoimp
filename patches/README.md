# Patches para o gateway do Secullum

O gateway do Secullum não vive neste repositório. Os arquivos aqui são
alterações prontas para aplicar nele.

> Não confundir com a pasta `gateway/` da raiz: aquela é o **serviço de push**,
> outro Worker, que vive aqui mesmo.

## Qual usar

Existem **duas implementações diferentes** do gateway, e só uma está no ar:

| arquivo | alvo | situação |
|---|---|---|
| `worker-gateway-rotas.js` | Worker Cloudflare `pontoimp-gateway` | **é o que está em produção** |
| `gateway-inconsistencias.patch` | projeto Fastify/Node | não publicado — mantido só por referência |

O código Fastify (`import Fastify`, `app.get(...)`, cofre com JWT) nunca foi ao
ar. O que responde em `pontoimp-gateway.dener70.workers.dev` é um Worker
independente, bem menor, com sessão cifrada em AES-GCM no próprio token.

## worker-gateway-rotas.js

Adiciona as três rotas que o app precisa e o Worker não tem:

| método | rota | repassa para |
|---|---|---|
| POST | `/me/ponto` | `/IncluirPonto?funcionarioId={id}` |
| GET | `/me/inconsistencias?inicio=&fim=&status=` | `/Inconsistencias/{ini}/{fim}/{status}` |
| POST | `/me/inconsistencia` | `/Inconsistencias` |

**Como aplicar:** Cloudflare → Workers & Pages → `pontoimp-gateway` → Edit code.
Cole o bloco dentro do `try` do `fetch()`, logo antes de
`return json(404, { erro: "rota não encontrada" });`. Salve e publique.

O ideal é editar o **fonte** (`worker.mjs`) e republicar pelo Wrangler — editar o
bundle pelo painel funciona, mas o próximo `wrangler deploy` sobrescreve.

### O que cada uma destrava

- **`/me/ponto`** — o botão `＋` de incluir batida que faltou. Sem esta rota ele
  recebe 404 e não registra nada.
- **`/me/inconsistencias`** — a listagem de pendências. Já funciona hoje sem esta
  rota, porque o app cai no `/me/raw` quando leva 404; a rota dedicada só deixa
  mais direto.
- **`/me/inconsistencia`** — o envio da justificativa. Não há alternativa: a
  escotilha `/me/raw` é só GET, de propósito.

### Sobre o corpo do POST de inconsistência

É o objeto que veio do GET, **inteiro**, só com `justificativa` preenchido. É
assim que o app oficial do Secullum faz. Campos que não interpretamos precisam
voltar intactos, então o Worker repassa sem tocar em nada — e o app também não
mexe.
