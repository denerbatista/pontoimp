# PontoImp — serviço de push

Worker que entrega os avisos do ponto **com o app fechado**. É um serviço
separado do gateway do Secullum de propósito: aqui não passa token nem senha,
só a agenda de horários do dia.

## Por que existe

Os alarmes do app nascem de um `setInterval` na página. Se o Android congela a
aba — e o One UI da Samsung congela — o aviso das 18:00 não sai. Com push, quem
acorda o aparelho é o serviço de push do próprio navegador, e a notificação
chega mesmo com o app fechado.

## Como funciona

1. O app calcula os eventos do dia (entrada, almoço, volta, saída, hora extra) e
   manda para `/push/agenda` **em timestamp absoluto**. O Worker não sabe nada de
   fuso horário nem das regras de ponto — só entrega na hora marcada.
2. Um cron de 1 em 1 minuto varre o KV e dispara o que venceu no último minuto.
3. Cada aviso é entregue uma única vez (`enviados` guarda a chave por 24h).

Um evento que venceu há mais de 5 minutos é descartado em vez de entregue
atrasado — avisar "saia agora" 20 minutos depois da hora só atrapalha.

## Deploy

```bash
cd gateway
npm install -g wrangler          # se ainda não tiver

# 1. namespace do KV — cole o id devolvido no wrangler.toml
npx wrangler kv namespace create PUSH

# 2. par de chaves VAPID
node gerar-chaves.mjs
npx wrangler secret put VAPID_PUBLICA
npx wrangler secret put VAPID_PRIVADA

# 3. sobe
npx wrangler deploy
```

Depois, nos **Ajustes → Conexão** do app, preencha "URL do serviço de push" com
a URL do Worker e toque em **📡 Avisar com o app fechado**.

`VAPID_PRIVADA` nunca entra no repositório — ela vive só como secret do Worker.
A pública pode circular à vontade: o app busca ela em `/push/chave`, então
trocar o par não exige mexer no HTML.

## Rotas

| Rota | Método | O que faz |
|---|---|---|
| `/health` | GET | confere se está no ar |
| `/push/chave` | GET | devolve a chave VAPID pública |
| `/push/agenda` | POST | grava inscrição + agenda do dia |
| `/push/teste` | POST | dispara uma notificação na hora |
| `/push/cancelar` | POST | apaga a inscrição |

## Segurança

O Worker faz `fetch` no endpoint que recebe, então ele **só aceita endpoints dos
serviços de push conhecidos** (FCM, Mozilla, Apple, WNS). Sem essa checagem
qualquer um poderia postar uma URL arbitrária e usar o Worker como proxy aberto.
Os testes cobrem esse caminho.

Inscrições que respondem 404/410 são apagadas, e as que ficam 3 dias sem
atualizar a agenda também.

## Testes

```bash
npm run test:push     # cifra RFC 8291 (ida e volta) + assinatura VAPID
npm run test:worker   # rotas, cron e a guarda de endpoint, com KV falso
```

A entrega de verdade contra o FCM não é exercitada pelos testes — isso exige uma
inscrição real de navegador. Use `/push/teste` depois do deploy para confirmar
ponta a ponta.
