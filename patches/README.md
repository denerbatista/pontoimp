# Patches para o gateway do Secullum

O gateway do Secullum é um projeto separado (não vive neste repositório). Os
patches aqui são alterações prontas para aplicar nele.

> Não confundir com a pasta `gateway/` da raiz: aquela é o **serviço de push**,
> que é outro Worker e vive aqui mesmo.

## gateway-inconsistencias.patch

Abre o fluxo de **justificar inconsistência** — a marcação que faltou ou saiu
errada. O funcionário justifica, o gestor aprova
(`/Solicitacoes/AceitarJustificarInconsistencia`).

Adiciona duas rotas:

| método | rota | repassa para |
|---|---|---|
| GET | `/me/inconsistencias?inicio=&fim=&status=` | `/Inconsistencias/{inicio}/{fim}/{status}` |
| POST | `/me/inconsistencia` | `/Inconsistencias` |

Aplicar a partir da raiz do gateway:

```bash
git apply /caminho/para/gateway-inconsistencias.patch
npm run typecheck
```

### O corpo do POST ainda não está mapeado

A primeira análise mapeou a rota, mas não os campos que `POST /Inconsistencias`
espera. Por isso o corpo passa **cru** (`Record<string, unknown>`), sem validação.

Para descobrir o formato: justifique uma inconsistência pela Central do
Funcionário com o DevTools aberto, salve o HAR e extraia a requisição — o
`har-mine.mjs` da análise já faz isso. Com os campos em mãos, dá para trocar o
`Record<string, unknown>` por um schema zod em `secullum/schemas.ts`, no mesmo
padrão dos outros.

Enquanto o formato não é conhecido, a rota funciona como passagem: o app monta o
corpo e o gateway repassa. Serve para descobrir por tentativa, mas **não valide
nada no cliente** achando que o gateway confere — ele não confere.

### Verificação feita

`tsc --noEmit` passa limpo com o patch aplicado, contra as dependências reais do
projeto. A checagem foi confirmada introduzindo um erro de propósito no código
novo (o compilador acusou) e removendo em seguida — ou seja, o typecheck cobre
mesmo estas linhas, não as ignora.

O que **não** foi verificado: nenhuma chamada real ao Secullum. As rotas nunca
foram exercitadas contra o servidor de verdade.
