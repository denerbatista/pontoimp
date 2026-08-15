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

## Como esta lista foi feita

O pacote de análise traz o app decompilado em pseudo-JS. Os pares foram extraídos
com uma busca pelos literais de requisição:

```bash
grep -oE "\{'endpoint':\s*'[^']+',\s*'method':\s*'[^']+'\}" decompilado-pseudojs.js
```

Extrair as strings direto do `index.android.bundle` do APK **não** funciona bem:
é bytecode Hermes e as strings saem fragmentadas (`/Solicitacoes/Des`,
`/Solicitac`). O decompilado é a fonte boa.
