// Testes do MOTOR v6 — extrai o bloco do motor de index.html e roda cenários
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const ini = html.indexOf('const hm =');
const fim = html.indexOf('/* =====================================================================\n   ESTADO');
if (ini < 0 || fim < 0) { console.error('não achei o bloco do motor'); process.exit(1); }
const {hm, toMin, planejarDia, situacaoAgora} =
  new Function(html.slice(ini, fim) + '\nreturn {hm, toMin, planejarDia, situacaoAgora};')();

const BASE = { cargaMin:492, entradaPadrao:'08:00', saidaAlmocoPadrao:'12:00',
  almocoMin:108, almocoPiso:60, compensarAtrasoNoAlmoco:true, adiantamento:'sair_cedo',
  metaSaida:null, toleranciaMin:0, ativo:true };

let ok=0, fail=0;
function t(nome, batidas, cfg, esperado){
  const p = planejarDia(batidas, {...BASE, ...cfg});
  const erros=[];
  for(const [k,v] of Object.entries(esperado)){
    const got = k==='saida' ? p.plano.saida
      : k==='volta' ? p.plano.voltaAlmoco
      : k==='almoco' ? p.almocoPlanejado
      : k==='custoTipo' ? p.custoNaMeta.tipo
      : k==='custoMin' ? p.custoNaMeta.min
      : p[k];
    if(got!==v) erros.push(`${k}: esperado ${JSON.stringify(v)}, veio ${JSON.stringify(got)}`);
  }
  // invariantes
  if(p.almocoPlanejado < (cfg.almocoPiso??BASE.almocoPiso)) erros.push(`almoço ${p.almocoPlanejado} abaixo do piso!`);
  if(erros.length){ fail++; console.log(`✗ ${nome}\n    ${erros.join('\n    ')}\n    avisos: ${JSON.stringify(p.avisos)}`); }
  else { ok++; console.log(`✓ ${nome}  [saída ${p.plano.saida} · almoço ${hm(p.almocoPlanejado)} · custo ${p.custoNaMeta.tipo}:${p.custoNaMeta.min}]`); }
}

console.log('— sem meta (comportamento v5 preservado) —');
t('pontual sem meta fecha 18:00', {entrada:'08:00'}, {}, {saida:'18:00', almoco:108, custoTipo:'zero'});
t('adiantado 30 sai 17:30 (sair_cedo)', {entrada:'07:30'}, {}, {saida:'17:30', almoco:108});
t('atraso 20 recupera no almoço', {entrada:'08:20'}, {}, {saida:'18:00', almoco:88, recuperado:20});
t('atraso 60: piso + saída empurrada', {entrada:'09:00'}, {}, {saida:'18:12', almoco:60, restanteAtraso:12});
t('almoco_maior: adiantado 30 estica almoço', {entrada:'07:30'}, {adiantamento:'almoco_maior'}, {saida:'18:00', almoco:138});

console.log('— regra nova: meta de saída —');
t('R2: pontual + meta 17:30 → desconta 30 do almoço', {entrada:'08:00'}, {metaSaida:'17:30'},
  {saida:'17:30', almoco:78, cortadoMeta:30, faltaMeta:0, custoTipo:'zero'});
t('R1: adiantado 30 + meta 17:30 → só adiantamento, almoço intacto', {entrada:'07:30'}, {metaSaida:'17:30'},
  {saida:'17:30', almoco:108, cortadoMeta:0, faltaMeta:0, custoTipo:'zero'});
t('R3: adiantado 20 + meta 17:00 → 20 adiantados + 40 do almoço', {entrada:'07:40'}, {metaSaida:'17:00'},
  {saida:'17:00', almoco:68, cortadoMeta:40, faltaMeta:0, custoTipo:'zero'});
t('R2: atraso 20 + meta 17:30 → almoço no piso, faltam 2', {entrada:'08:20'}, {metaSaida:'17:30'},
  {saida:'17:32', almoco:60, cortadoMeta:28, faltaMeta:2, custoTipo:'desconto', custoMin:2});
t('adiantado 60 + meta 17:30 → sai 17:00, ficar até a meta é extra', {entrada:'07:00'}, {metaSaida:'17:30'},
  {saida:'17:00', almoco:108, cortadoMeta:0, custoTipo:'extra', custoMin:30});
t('meta 16:00 impossível → piso e desconto 72', {entrada:'08:00'}, {metaSaida:'16:00'},
  {saida:'17:12', almoco:60, cortadoMeta:48, faltaMeta:72, custoTipo:'desconto', custoMin:72});
t('meta 17:12 = flex exato (almoço no piso, zera)', {entrada:'08:00'}, {metaSaida:'17:12'},
  {saida:'17:12', almoco:60, cortadoMeta:48, faltaMeta:0, custoTipo:'zero'});
t('atraso 60 + meta 17:30 → sem flex, desconto 42', {entrada:'09:00'}, {metaSaida:'17:30'},
  {saida:'18:12', almoco:60, cortadoMeta:0, faltaMeta:42, custoTipo:'desconto', custoMin:42});
t('almoco_maior + adiantado 30 + meta 17:30 → corta o almoço esticado', {entrada:'07:30'}, {adiantamento:'almoco_maior', metaSaida:'17:30'},
  {saida:'17:30', almoco:108, cortadoMeta:30, faltaMeta:0, custoTipo:'zero'});
t('sexta (carga 432) + meta 16:30', {entrada:'08:00'}, {cargaMin:432, metaSaida:'16:30'},
  {saida:'16:30', almoco:78, cortadoMeta:30, custoTipo:'zero'});
t('estágio 2 (saiu p/ almoço 12:10) + adiantado 20 + meta 17:00', {entrada:'07:40', saidaAlmoco:'12:10'}, {metaSaida:'17:00'},
  {saida:'17:00', volta:'13:18', almoco:68, cortadoMeta:40, custoTipo:'zero'});
t('estágio 3 (voltou do almoço) — almoço já foi, meta vira desconto', {entrada:'08:00', saidaAlmoco:'12:00', voltaAlmoco:'13:48'}, {metaSaida:'17:30'},
  {saida:'18:00', cortadoMeta:0, custoTipo:'desconto', custoMin:30});
t('motor desligado ignora meta', {entrada:'08:00'}, {metaSaida:'17:30', ativo:false},
  {saida:'18:00', almoco:108, cortadoMeta:0, custoTipo:'zero'});
t('estágio 0 planeja o corte (preview)', {}, {metaSaida:'17:30'},
  {saida:'17:30', almoco:78, cortadoMeta:30, custoTipo:'zero'});
t('meta depois do fechamento natural não mexe em nada', {entrada:'08:00'}, {metaSaida:'18:30'},
  {saida:'18:00', almoco:108, cortadoMeta:0, custoTipo:'extra', custoMin:30});

// fechamento de fato zera? simula dia completo saindo no alvo do plano R3
{
  const plan = planejarDia({entrada:'07:40'}, {...BASE, metaSaida:'17:00'});
  const p2 = planejarDia({entrada:'07:40', saidaAlmoco:plan.plano.saidaAlmoco,
    voltaAlmoco:plan.plano.voltaAlmoco, saida:plan.plano.saida}, {...BASE, metaSaida:'17:00'});
  if(p2.saldoRealizadoMin===0){ ok++; console.log('✓ dia completo seguindo o plano R3 fecha com saldo 0'); }
  else { fail++; console.log(`✗ dia completo R3: saldo ${p2.saldoRealizadoMin} (esperado 0)`); }
}

console.log(`\n${ok}/${ok+fail} testes passaram${fail?' — '+fail+' FALHARAM':''}`);
process.exit(fail?1:0);
