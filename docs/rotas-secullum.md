# Rotas da API do Secullum

Extraídas do app oficial decompilado, procurando os pares `{'endpoint', 'method'}`
com que ele monta cada requisição. São as rotas **declaradas estaticamente** — 38
pares. As construídas por concatenação estão na seção seguinte.

Base: `{SECULLUM_URL}{bancoId}{endpoint}`, com `Authorization: Basic
base64(numero:senha:tipoAutenticacao)` em toda chamada. Não há token de sessão.

## Declaradas estaticamente

| método | rota |
|---|---|
| POST | `/Login` |
| POST | `/Logout` |
| GET | `/Login/VerificarBancoValido/` |
| POST | `/RecuperacaoSenha/ObterEmailOcultoFuncionario` |
| POST | `/RecuperacaoSenha/ConfirmarEmail` |
| POST | `/RecuperacaoSenha/ConfirmarCodigo` |
| POST | `/RecuperacaoSenha/TrocarSenha` |
| POST | `/Funcionarios` |
| POST | `/Funcionarios/DeletarConta` |
| POST | `/Funcionarios/SalvarAceiteTermosLgpd` |
| GET | `/Funcionarios/ListarFuncionariosGerente` |
| GET | `/IncluirPonto` |
| POST | `/Inconsistencias` |
| GET | `/Justificativas` |
| GET | `/ControleFerias/Saldo` |
| GET | `/Escolaridade` |
| GET | `/Filtro/ListarFiltro1` · `/Filtro/ListarFiltro2` |
| GET | `/Indicadores/v2/ResumoDiario` |
| GET | `/Indicadores/TotalSolicitacoesPendentes` |
| GET | `/Indicadores/IndicadoresGerente/` |
| POST | `/Indicadores/SalvarIndicador` |
| POST | `/Solicitacoes/DadosCadastrais` |
| POST | `/Solicitacoes/VendaFerias` |
| POST | `/Solicitacoes/MarcarVisto` · `/Solicitacoes/DesmarcarVisto` |
| POST | `/AssinaturaDigitalCartaoPonto/Aprovar` · `/Descartar` |
| POST | `/AssinaturaDigitalCartaoPonto/AprovarGerente` · `/DescartarGerente` |
| POST | `/RepositorioArquivoAssinatura/Aprovar` · `/Rejeitar` |
| POST | `/RelatorioCartaoPonto` |
| POST | `/Configuracoes` |
| POST | `/Configuracoes/ReceberComprovante` · `/NaoReceberComprovante` |
| POST | `/QualidadeVidaTrabalho` |
| POST | `/ServicoOnline/GravarPedidoAjuda` |

## Montadas por concatenação

Não aparecem como literal porque o app monta a URL em tempo de execução:

| método | rota | observação |
|---|---|---|
| GET | `/Batidas/{data}` · `/Batidas/{ini}/{fim}` | espelho de ponto |
| POST | `/IncluirPonto?funcionarioId={id}` | inclui batida (`DadosIncluirPonto`) |
| GET | `/IncluirPonto/ListarUltimasPendenciasFuncionario/{tipo}` | 0=ponto, 1=atividade |
| GET | `/Inconsistencias/{ini}/{fim}/{status}` | lista |
| GET | `/Solicitacoes/{ini}/{fim}/{status}/{perfil}/{id}` | lista |
| POST | `/Solicitacoes/{Aceitar\|Descartar}{TipoSolicitacao}` | `retornarEndpointResponderSolicitacao(tipo, acao)` |
| GET | `/Indicadores/ListaHoras/{ini}/{fim}` | banco de horas |

## Solicitações: o caminho que o app oficial usa para corrigir

As telas **Ajustar Ponto** e **Justificar Ausência** do app oficial não usam
`IncluirPonto`. Elas criam **solicitações**, que vão para aprovação do gestor:

```js
// postSolicitacaoAsync(solicitacao)
const corpo = Object.assign({}, solicitacao, {
  dataInicioAfastamento: formatIsoDate(s.dataInicioAfastamento),
  dataFimAfastamento:    formatIsoDate(s.dataFimAfastamento),
});
let endpoint = '/Solicitacoes';
if (s.tipo === TipoSolicitacao.SolicitacaoFerias)  endpoint = '/Solicitacoes/Ferias';
else if (ehSolicitacaoAfastamento(s.tipo))         endpoint = '/Solicitacoes/Afastamento';
request({ endpoint, method: 'POST', jsonBody: corpo });
```

Ou seja: **um POST só, com o campo `tipo` decidindo tudo.** Férias e afastamento
têm rota própria; o resto cai em `/Solicitacoes`.

Valores de `TipoSolicitacao` recuperados do enum:

| valor | nome |
|---|---|
| 15 | `Afastamento` |
| 16 | `ExclusaoAfastamento` |
| 19 | `JustificarInconsistenciaExtras` |
| 20 | `JustificarInconsistenciaFaltas` |
| 21 | `SolicitacaoFerias` |
| 22 | `VendaFerias` |

**O que falta:** o `tipo` do Ajuste de Ponto e o formato exato do corpo. Pelas
telas, o Ajustar Ponto manda o dia inteiro de uma vez — `Entrada 1..5` e
`Saída 1..5`, mais uma observação — e não uma batida por vez. E o Justificar
Ausência manda data, período (dia inteiro/parcial), motivo e observação;
os motivos vêm de `/Justificativas`.

Isso não sai por leitura estática com confiança: o corpo é montado espalhado
pelo componente. O jeito certo de fechar é capturar um HAR fazendo a operação
pela Central do Funcionário.

## IncluirPonto é outra coisa

`POST /IncluirPonto` registra uma marcação — é o "bater o ponto" do app, não o
"corrigir o dia". Serve para bater agora, e pode servir para incluir uma batida
esquecida, mas não é o fluxo de ajuste com aprovação que as telas oficiais usam.

## Duas conclusões que importam

**1. Justificar inconsistência é um round-trip.** O app pega o objeto do
`GET /Inconsistencias/...`, preenche só o campo `justificativa` e devolve o
objeto inteiro no `POST /Inconsistencias`:

```js
r3 = a0;                                    // a inconsistência, como veio
r3['justificativa'] = state.justificativa;
postJustificarInconsistenciaAsync(r3);      // devolve tudo
```

Por isso não é preciso conhecer o schema — e não se deve mexer nele, porque
campos não interpretados precisam voltar intactos.

**2. Não existe cancelar solicitação pelo funcionário.** Não há nenhum `DELETE`
em toda a API, nem rota de cancelamento. O `Descartar` pertence ao fluxo de
*responder* a uma solicitação (`retornarEndpointResponderSolicitacao`), ou seja,
é o gestor reprovando. O app oficial também não tem string de interface para
cancelar. Depois de enviada, a justificativa só sai pelas mãos do gestor.

## Versão 1.45.0: corpos, enums e regras de tela

Tudo daqui pra baixo saiu do **Secullum RH 1.45.0** (APKPure, `versionCode 100`),
lido no assembly Hermes. O número entre `#` é o id da função no bytecode,
pra quem quiser conferir. **[I]** marca inferência; o resto é literal.

### Cliente HTTP

- URL: `https://pontowebapp.secullum.com.br/{bancoId}{rota}` (`getUrlApi`, #10988).
- Headers: `Authorization: Basic base64(numero:senha:tipo)`, `Accept-Language`,
  `pragma`/`cache-control: no-cache` e `Content-Type: application/json` só com corpo
  (#30892). Não há header de versão nem de plataforma.
- **`axpw`** é a mesma credencial base64 do Basic, posta na URL. É usado nos links que
  o app abre fora do `fetch`: comprovante, PDF do cartão, arquivo, foto (#28715, #31115).
- Erro de validação chega como `[{message}]`; 401 derruba a sessão (#31944).
- O servidor devolve a hora em `X-Sec-DataHoraServidorUtc`.

### Registrar ponto — `POST /IncluirPonto?funcionarioId={id}` (#30841, #31181)

```json
{ "justificativa": null, "latitude": -23.5, "longitude": -46.6, "precisao": 12,
  "endereco": "…", "foto": "<jpeg base64 sem prefixo>|null", "marcacaoOffline": false,
  "viaCentralWeb": false, "identificacaoDispositivo": "…", "foraDoPerimetro": false,
  "utilizaLocalizacaoFicticia": false, "horaFoiModificada": false,
  "fusoFoiModificado": false, "atividadeId": null }
```

- Sem `dataHora`: a hora é do servidor. Só a inclusão offline manda `dataHora`
  (#31209), e o PontoImp não usa esse caminho.
- `GET /IncluirPonto` traz as exigências: `exigirCapturaFotoPonto`,
  `tipoCameraCapturaFotoPonto`, `permiteInclusaoPontoSemLocalizacao`, e os
  `perimetrosAutorizados` com `somentePerimetrosAutorizados`.
- **Perímetro** (`validarBatidaDentroPerimetro`): cada perímetro é um círculo
  (`circulo`, `radius` em metros, centro em `coordenadas[0]`) ou um polígono
  (`coordenadas[{lat,lng}]`, ponto-no-polígono por paridade). Fora dele, o app manda
  `foraDoPerimetro: true`; com `somentePerimetrosAutorizados`, nem registra.
- Endereço: `https://geolocalizacao.secullum.com.br/Reverse?latitude=&longitude=` →
  `{endereco}` (#28616).
- Comprovante: `GET /Batidas/Comprovante?axpw=…&batidaId={dia.id}&nome={batida.nome}`,
  só pra batida com `ehRepP` (#28713).

### TipoSolicitacao (enum completo)

| valor | nome | valor | nome |
|---|---|---|---|
| 0 | AlteracaoDePonto | 12 | Periodo4 |
| 1 | AjusteParcial | 13 | Periodo5 |
| 2 | JustificativaDiaInteiro | 14 | HoraFoiModificada |
| 3 | Periodo1 | 15 | Afastamento |
| 4 | Periodo2 | 16 | ExclusaoAfastamento |
| 5 | Periodo3 | 17 | FusoFoiModificado |
| 6 | AtualizacaoDadosCadastrais | 18 | DataHoraDefinidasManualmente |
| 7 | ForaDoPerimetro | 19 | JustificarInconsistenciaExtras |
| 8 | ExclusaoDeConta | 20 | JustificarInconsistenciaFaltas |
| 9 | AntesAdmissao | 21 | SolicitacaoFerias |
| 10 | ForaCentroCustos | 22 | VendaFerias |
| 11 | UtilizaLocalizacaoFicticia | | |

Status da solicitação: Pendente=0, Aceita=1, Descartada=2, Visto=3. Filtro da lista:
Todos=0, Processados=1, Pendentes=2. Perfil: Funcionario=0, Gerente=1, FuncionarioRestrito=2.

### Justificar ausência (#26558–#26575)

O app busca o molde do dia (`GET /Solicitacoes/{data}/{funcionarioId}?origemRequisicao=0`),
troca os campos da tela e devolve o objeto inteiro em `POST /Solicitacoes`:

- dia inteiro `tipo:2`, períodos `3/4/5` (e `12/13` com 10 batidas), horário específico
  `tipo:1` com `entrada1`/`saida1`;
- afastamento `tipo:15`, `tipoAusencia:1`, `dataInicioAfastamento`/`dataFimAfastamento`
  em `yyyy-MM-ddT00:00:00.000Z` (hora local com `Z` literal) e rota
  `POST /Solicitacoes/Afastamento`;
- `justificativaId` de `GET /Justificativas`; foto do atestado (JPEG base64) só quando a
  justificativa tem `exigirFotoAtestado`.

### Férias

- `GET /ControleFerias/Saldo` → `{saldo, movimentacoes[{data, dataFim, descricaoMovimentacao, dias}]}`.
- `POST /Solicitacoes/Ferias` com o corpo do ajuste mais `tipo:21`,
  `dataInicioAfastamento`, `dataFimAfastamento` (#23980).
- `POST /Solicitacoes/VendaFerias` com `{funcionarioId, feriasVendaDias, observacoes}` (#23991).

### Gestor

`retornarEndpointResponderSolicitacao(tipo, Aceitar|Descartar)` (#22312):
venda de férias (22) → `/Solicitacoes/{acao}VendaFerias`; afastamento ou férias
(15, 16, 21) → `/{acao}Afastamento`; inconsistência (19, 20) →
`/{acao}JustificarInconsistencia`; o resto → `/Solicitacoes/{acao}`. O corpo é a
solicitação inteira, com `motivoRejeicao` no descarte. Marcar visto:
`/Solicitacoes/MarcarVisto` e `/DesmarcarVisto`.

### Assinatura do cartão e arquivos

- Lista: `GET /AssinaturaDigitalCartaoPonto/{ini}/{fim}/{status}/{perfil}[/{funcionarioId}]`.
  Status: NaoRespondido=0, Aprovado=1, Rejeitado=2, AguardandoAprovacaoGerentes=3.
- PDF: `GET /AssinaturaDigitalCartaoPonto/{id}[/{funcionarioId}]?axpw=…`.
- Aprovar/Descartar (e `…Gerente`): o item inteiro mais `senha` (aprovar) ou
  `motivo`/`motivoGerente`, e `{latitude, longitude, precisao, endereco}` (#31104).
- Arquivos: `GET /RepositorioArquivo/{funcionarioId}[/{ini}/{fim}]`; `GetType/{id}` dá o
  mime e `GetFile/{id}` dá os bytes. Assinar: `POST /RepositorioArquivoAssinatura/Aprovar`
  `{repositorioArquivoId, senha, endereco, latitude, longitude, precisao, repositorioArquivosIds}`;
  recusar: `/Rejeitar` `{repositorioArquivoId, motivo, repositorioArquivosIds}`.

### Cartão ponto, indicadores e impressão

- `GET /Batidas/{ini}/{fim}` → `{lista, justificativas, totais, opcoesCartaoPonto}`. Cada dia
  tem `id, data, feriado, situacao (0 completo, 1 incompleto, 2 com faltas), saldo,
  registroPendente, existePeriodoEncerrado, batidas[{nome, valor, valorOriginal, ehRepP,
  geolocalizacao}], valores[{nome, valor}]`.
- `GET /Indicadores/ListaHoras/{ini}/{fim}` → `{saldo, extras, faltas, personalizados}`,
  cada um `{dia, semana, mes: {valores:[{x, y}]}}` com `y` em horas decimais.
- PDF: `POST /RelatorioCartaoPonto` grava as opções (colunas) e depois
  `GET /RelatorioCartaoPonto?axpw=…&dataInicio=&dataFim=&funcionarioId=` devolve o
  relatório (#31126, #31127).
- `/Indicadores/v2/ResumoDiario` é do **gestor**, não do funcionário.

### Quais telas aparecem (`retornarTelas`)

Some a tela listada em `dadosPerfilFuncionario.telasOcultar`. Além disso:

| tela | condição |
|---|---|
| IncluirPonto | `podeIncluirPontoManual` |
| Arquivos | `funcionalidades` inclui 0 |
| Férias | `funcionalidades` inclui 1 |
| Assinatura do cartão | `assinaturaDigitalCartaoPontoHabilitada` |
| Dados gerenciais | `tipoPerfil === 1` |

### Conta

- Alterar senha: `POST /Funcionarios` `{senhaAtual, novaSenha, confirmarSenha}`.
- Excluir conta: `POST /Funcionarios/DeletarConta` com a senha como **string JSON pura**.
- LGPD: `GET /TermoLgpd` (texto) e `POST /Funcionarios/SalvarAceiteTermosLgpd` sem corpo.
- Recuperar senha (sem login): `ObterEmailOcultoFuncionario {usuario, UsuarioAutenticacao}`
  → `ConfirmarEmail {bancoId, usuario, tipoUsuarioAutenticacao, email}` →
  `ConfirmarCodigo {…, codigo}` → `TrocarSenha {…, codigo, novaSenha, confirmarSenha}`.
- Notificações: `GET /Notificacoes/{ini}/{fim}`; marcar com
  `POST /Notificacoes/MarcarNotificacaoVisualizada/{id}/{true|false}`.

### O que ficou de fora

- **Registrar atividade** (`IncluirAtividade`): mesma rota do ponto com `atividadeId`, mas
  a origem da lista de atividades não ficou clara no bytecode **[I: Filtro1/Filtro2]**.
- **Modo offline** do app oficial: grava a batida com `dataHora` do aparelho e sincroniza
  depois. Ficou de fora de propósito: no PontoImp, a hora é sempre a do servidor.
- **Popup da central** (`/popup-config?plataforma=app`): é aviso de marketing da Secullum.

## Como esta lista foi feita

> **1.45.0:** o `hermes-dec` atual descompila o bundle (Hermes v98), mas **pula as
> funções async**, que são justamente as da API. A fonte boa passou a ser o
> assembly (`hbc-disassembler`), buscando `NewObjectWithBuffer` com `'endpoint'`.
> O lado Java foi conferido com o [rea](https://github.com/morluto/rea)
> (`inspect-android-package`, `search-android-classes`, `inspect-android-method`, via
> JADX): `RequisicaoModule` é só um GET com timeout de 10 s, e a sincronização
> offline repassa para uma tarefa JS. Não há regra de negócio no Java.

O pacote de análise traz o app decompilado em pseudo-JS. Os pares foram extraídos
com uma busca pelos literais de requisição:

```bash
grep -oE "\{'endpoint':\s*'[^']+',\s*'method':\s*'[^']+'\}" decompilado-pseudojs.js
```

Extrair as strings direto do `index.android.bundle` do APK **não** funciona bem:
é bytecode Hermes e as strings saem fragmentadas (`/Solicitacoes/Des`,
`/Solicitac`). O decompilado é a fonte boa.
