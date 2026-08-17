# PontoImp — app Android

O que este app acrescenta ao site é uma coisa só: **alarme de verdade**.

## Por que existe

A versão web não consegue tocar. Um service worker só tem permissão de mostrar
notificação — não pode tocar áudio, não pode abrir tela, e o som fica a cargo do
canal de notificação do navegador, que obedece ao silencioso. Não é limitação da
implementação, é teto da plataforma web.

E um APK que apenas embrulhasse o site (TWA/Bubblewrap) teria exatamente o mesmo
problema, porque continua sendo um WebView.

## Como funciona

A interface **é a mesma página** (`https://denerbatista.github.io/pontoimp/`),
carregada num WebView. Nada foi reescrito, e o motor de cálculo segue com uma
fonte de verdade só — os 35 testes do motor continuam valendo para os dois.

O que é nativo é só o que precisa ser:

| Peça | Papel |
|---|---|
| `AgendadorAlarmes` | `setAlarmClock()` — hora exata, atravessa Doze e economia de bateria |
| `ReceptorAlarme` | recebe o disparo e publica a notificação com `fullScreenIntent` |
| `TelaAlarme` | abre sobre o bloqueio, toca em `USAGE_ALARM` e vibra até você parar |
| `ReceptorBoot` | re-arma os alarmes depois de reiniciar o aparelho |

A ponte entre os dois lados é a `agendaDeHoje()` que já existia para o push: a
página entrega `[{ts, titulo, corpo, nivel}]` e o lado nativo transforma em
alarme. Dentro do APK a página detecta a ponte (`window.AndroidAlarme`) e para de
pedir permissão de notificação do navegador, porque quem acorda o aparelho passa
a ser o AlarmManager.

Três detalhes que fazem a diferença entre tocar e não tocar:

- **`setAlarmClock`** é a única modalidade que o Android trata como despertador.
  Alarme comum é adiado pelo Doze; este não é.
- **Iniciar Activity em segundo plano é bloqueado desde o Android 10.** O caminho
  legítimo é notificação com `fullScreenIntent` — o sistema é que abre a tela.
- **`USAGE_ALARM`** é o canal de áudio do despertador, e é o que toca com o
  celular no silencioso.

## Instalar

O APK sai do GitHub Actions, no workflow **APK Android**. Baixe o artefato
`pontoimp-apk` do run mais recente, transfira para o celular e instale
(vai pedir para permitir "instalar apps desconhecidos" — é normal para APK fora
da Play Store).

Para gerar sob demanda: aba Actions → APK Android → *Run workflow*.

Na primeira abertura ele pede permissão de notificação e, no Android 12, manda
você para a tela de alarmes exatos do sistema. Sem essa segunda, o agendamento
falha em silêncio — por isso o app leva você direto para lá.

### Se a instalação falhar

O sintoma é a instalação demorar e terminar em "app não instalado", sem
explicação. Na prática o culpado foi o **Play Protect**, que escaneia APK de
fora da loja e barra sem dizer o motivo.

Play Store → foto do perfil → Play Protect → engrenagem → desligar
"Verificar apps". Instale e religue depois.

Se ainda assim recusar, aí vale conferir o resto: espaço em disco, e
Configurações → Apps → ⋮ → Acesso especial → Instalar apps desconhecidos,
liberando para o app de onde você abre o arquivo.

## Limitação conhecida da v1

**Os alarmes são armados quando o app sincroniza**, ou seja, quando você o abre.
Como o app é aberto todo dia para acompanhar o ponto, na prática funciona — mas
se você passar um dia inteiro sem abrir, os alarmes daquele dia não terão sido
marcados.

O caminho para resolver é um `WorkManager` diário que recalcula de madrugada,
ainda não implementado.

## Compilar

Não dá para compilar no ambiente onde este projeto foi escrito: o SDK do Android
vem do `dl.google.com`, bloqueado lá. Por isso não há `gradle-wrapper` no
repositório e o workflow fixa a versão do Gradle.

Com o SDK disponível:

```bash
cd android
gradle assembleDebug
# app/build/outputs/apk/debug/app-debug.apk
```

## Assinatura

O APK é assinado com uma **chave própria e fixa**, e isso não é detalhe: sem
ela, o runner do CI gera um `debug.keystore` novo a cada build, a assinatura
muda, e o Android recusa a atualização por conflito. Nenhuma atualização
instalaria por cima — foi exatamente o que aconteceu entre os APKs 14 e 16.

A chave vai cifrada no repositório (`app/pontoimp.jks.enc`, AES-256 com PBKDF2)
e o workflow a decifra com o secret `ANDROID_KEYSTORE_SENHA`. O blob cifrado ser
público não é problema: sem a senha ele não abre, e a senha nunca entra aqui.

Sem o secret configurado o build continua passando, mas emite um aviso: o APK
sai com assinatura instável e não atualiza por cima do anterior.

Para conferir se dois APKs atualizam um sobre o outro:

```bash
unzip -p app.apk META-INF/CERT.RSA | sha256sum
```

Os dois têm que dar o mesmo hash.
