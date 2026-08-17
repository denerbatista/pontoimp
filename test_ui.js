// Smoke test da UI v7 (modo monitor + histórico + ampulheta + alarme)
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8765;
const EH_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const isoLocal = (d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
// Data fixa numa quinta às 09:00: sem isto a suíte roda diferente no fim de
// semana (o app mostra tela de folga) e metade das checagens é pulada em silêncio.
const HOJE = new Date(2026, 7, 13, 9, 0, 0);
const diasAtras = (n)=>{ const d=new Date(HOJE); d.setDate(d.getDate()-n); return d; };

// gateway fake em /gw: espelho com hoje (1 batida), ontem completo, anteontem completo, D-3 vazio
function espelhoFake(){
  return { lista: [
    { data: isoLocal(diasAtras(0))+'T12:00:00', batidas:[{valor:'08:00'}] },
    { data: isoLocal(diasAtras(1))+'T12:00:00', batidas:[{valor:'08:02'},{valor:'12:00'},{valor:'13:26'},{valor:'18:00'}], saldo:'00:00' },
    { data: isoLocal(diasAtras(2))+'T12:00:00', batidas:[{valor:'07:45'},{valor:'12:00'},{valor:'13:48'},{valor:'17:45'}] },
    { data: isoLocal(diasAtras(3))+'T12:00:00', batidas:[] },
  ]};
}
let ultimoPonto = null;         // corpo do último POST /me/ponto
let ultimaJustificativa = null; // corpo do último POST /me/inconsistencia
const server = http.createServer((req,res)=>{
  let p = req.url.split('?')[0];
  // ---- gateway com inclusão manual habilitada
  if(p==='/gwman/me/ponto' && req.method==='POST'){
    let b=''; req.on('data',d=>b+=d);
    req.on('end',()=>{ try{ ultimoPonto=JSON.parse(b); }catch(e){ ultimoPonto={naoEhJson:b}; }
      res.setHeader('Content-Type','application/json'); res.end('{"ok":true}'); });
    return;
  }
  if(p.startsWith('/gwman/me/espelho')){ res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ lista:[{ data:isoLocal(diasAtras(0))+'T12:00:00', batidas:[] }],
      justificativas:[{id:1,descricao:'Esquecimento'},{id:2,descricao:'Problema no relógio'}] })); return; }
  if(p==='/gwman/me/inconsistencia' && req.method==='POST'){
    let b=''; req.on('data',d=>b+=d);
    req.on('end',()=>{ try{ ultimaJustificativa=JSON.parse(b); }catch(e){ ultimaJustificativa={naoEhJson:b}; }
      res.setHeader('Content-Type','application/json'); res.end('{"ok":true}'); });
    return;
  }
  // gateway sem a rota dedicada: só a escotilha /me/raw, como está publicado hoje
  if(p==='/gwraw/me/raw'){
    const q=new URL(req.url,'http://x').searchParams.get('endpoint')||'';
    res.setHeader('Content-Type','application/json');
    res.end(/^\/Inconsistencias\//.test(q)
      ? JSON.stringify([{ id:88, data:'2026-08-11T00:00:00', descricao:'Via raw' }]) : '{}');
    return;
  }
  if(p==='/gwraw/me/inconsistencia' && req.method==='POST'){ res.statusCode=404; res.end('{}'); return; }
  if(p==='/gwraw/me/solicitacao' && req.method==='POST'){ res.statusCode=404; res.end('{}'); return; }
  if(p==='/gwraw/me'){ res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({nome:'D',empresa:'I',podeIncluirPontoManual:true})); return; }
  if(p.startsWith('/gwraw/me/espelho')){ res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ lista:[{ data:isoLocal(diasAtras(0))+'T12:00:00', batidas:[] }] })); return; }
  if(p.startsWith('/gwraw/')){ res.statusCode=404; res.end('{}'); return; }
  if(p.startsWith('/gwman/me/inconsistencias')){ res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify([{ id:77, data:'2026-08-10T00:00:00', tipo:'Falta de marcação',
      descricao:'Saída não registrada', status:0, campoInterno:'preservar' }])); return; }
  if(p==='/gwman/me/solicitacao' && req.method==='POST'){
    let b=''; req.on('data',d=>b+=d);
    req.on('end',()=>{ try{ ultimoPonto=JSON.parse(b); }catch(e){ ultimoPonto={naoEhJson:b}; }
      res.setHeader('Content-Type','application/json'); res.end('{"ok":true}'); });
    return;
  }
  if(p==='/gwman/me'){ res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({id:144,nome:'Dener Batista',empresa:'Impacta',podeIncluirPontoManual:true})); return; }
  if(p==='/gw/me'){ res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({nome:'Dener Batista',empresa:'Impacta',podeIncluirPontoManual:false})); return; }
  if(p.startsWith('/gw/me/espelho')){ res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(espelhoFake())); return; }
  // o Secullum devolve "FALTA" no lugar da hora quando não houve registro
  if(p.startsWith('/gwfalta/me/espelho')){ res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ lista:[{ data:isoLocal(diasAtras(0))+'T12:00:00',
      batidas:[{valor:'FALTA'},{valor:'FALTA'},{valor:'FALTA'},{valor:'FALTA'}] }] })); return; }
  if(p.startsWith('/gw/')||p.startsWith('/gwfalta/')||p.startsWith('/gwman/')){ res.statusCode=404; res.end('{}'); return; }
  if(p==='/') p='/index.html';
  const f = path.join(__dirname, p);
  if(fs.existsSync(f)&&fs.statSync(f).isFile()){ res.setHeader('Content-Type',MIME[path.extname(f)]||'application/octet-stream'); res.end(fs.readFileSync(f)); }
  else { res.statusCode=404; res.end('{}'); }
});

(async()=>{
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch();
  let fails = 0;
  const check = (nome,cond)=>{ if(cond){console.log('✓ '+nome);} else {fails++; console.log('✗ '+nome);} };

  // ---- 1) sem sessão: tela de login
  {
    const page = await browser.newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
    await page.clock.setFixedTime(HOJE);
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForTimeout(400);
    check('login visível sem sessão', await page.locator('#login').isVisible());
    check('sem botão de bater ponto', (await page.locator('text=Bater').count())===0);
    check('sem modo demonstração', (await page.locator('text=demonstração').count())===0);
    check('alarme overlay começa escondido', await page.locator('#alarmOverlay').isHidden());
    check('sem erros de JS no login', errs.length===0 || (console.log('   errs:',errs), false));
    await page.close();
  }

  // ---- 2) sessão salva + gateway fake respondendo espelho
  {
    const page = await browser.newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
    await page.addInitScript(({port})=>{
      const d=new Date(); const hoje=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      const st={ gateway:'http://localhost:'+port+'/gw',
        auth:{banco:'1',tipo:'0',usuario:'9',senha:'',token:'fake',lembrar:true},
        func:{nome:'Dener Batista',empresa:'Impacta'},
        cfg:{cargaSegQui:492,cargaSex:432,entradaPadrao:'08:00',saidaAlmocoPadrao:'12:00',almocoMin:108,almocoPiso:60,
             compensarAtrasoNoAlmoco:true,adiantamento:'sair_cedo',metaSegQui:'',metaSex:'',toleranciaMin:5,
             ativo:true,alarmes:true,modoAlarme:true,pollMin:3},
        hoje:{data:hoje,entrada:'08:00',saidaAlmoco:null,voltaAlmoco:null,saida:null,almocoPrevisto:null,snoozeAte:null,perguntaFeita:false,metaHoje:''},
        hist:{ts:0,dias:[]}, notificados:{}, ultimaSyncMs:Date.now() };
      localStorage.setItem('pontoimp.v2',JSON.stringify(st));
    },{port:PORT});
    await page.clock.setFixedTime(HOJE);
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForTimeout(900);
    check('app visível com sessão salva', await page.locator('#app').isVisible());
    const dow=HOJE.getDay(), util=dow>=1&&dow<=5;
    const h=(m)=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
    const carga=dow===5?432:492;
    if(util){
      const body=await page.textContent('body');
      check(`saída exata ${h(480+carga+108)} na tela`, body.includes(h(480+carga+108)));
      // ampulheta: já passou do almoço planejado e a batida não veio
      const passouAlmoco = (HOJE.getHours()*60+HOJE.getMinutes()) >= 720;
      if(passouAlmoco) check('ampulheta de batida pendente', body.includes('esperando o Secullum processar'));

      // navegação: barra inferior, aba ativa e logo voltando pro início
      check('barra de navegação tem as três abas', (await page.locator('#nav button').count())===3);
      check('aba Hoje começa marcada', await page.locator('#nav button[data-v="hoje"]').evaluate(b=>b.classList.contains('on')));
      await page.click('#nav button[data-v="cfg"]');
      await page.waitForTimeout(200);
      check('trocar de aba move a marcação',
        await page.locator('#nav button[data-v="cfg"]').evaluate(b=>b.classList.contains('on'))
        && !(await page.locator('#nav button[data-v="hoje"]').evaluate(b=>b.classList.contains('on'))));
      await page.click('.hd .brand');
      await page.waitForTimeout(200);
      check('clicar na logo volta pro início', await page.evaluate(()=>view==='hoje'));
      check('barra fica fixa e alcançável', await page.locator('#nav').evaluate(n=>
        getComputedStyle(n).position==='fixed' && getComputedStyle(n).bottom==='0px'));
      check('conteúdo não fica escondido atrás da barra', await page.evaluate(()=>{
        const p=getComputedStyle(document.querySelector('#app')).paddingBottom;
        return parseInt(p,10) >= 80;
      }));
      check('toast não tapa as abas', await page.evaluate(()=>{
        toast('mensagem de teste');
        const t=document.querySelector('#toast').getBoundingClientRect();
        const n=document.querySelector('#nav').getBoundingClientRect();
        return t.bottom <= n.top;
      }));

      // histórico
      await page.click('#nav button[data-v="hist"]');
      await page.waitForTimeout(700); // carrega do gateway fake
      const hist=await page.textContent('body');
      check('histórico abre', hist.includes('Histórico'));
      check('hoje fixo no topo (pill)', await page.locator('.diaHoje').count()===1
        && (await page.locator('#histBox .dia').first().textContent()).includes('hoje'));
      check('chips legíveis (entrada/almoço/saída)', hist.includes('entrada')&&hist.includes('almoço')&&hist.includes('saída'));
      check('dia anterior com saldo do Secullum', hist.includes('saldo 00:00'));
      check('dia calculado zerou', hist.includes('zerou'));
      check('tempo trabalhado aparece', hist.includes('trabalhado'));

      // alarme
      await page.evaluate(()=>dispararAlarme('⏰ Teste','corpo do alarme'));
      await page.waitForTimeout(200);
      check('overlay do alarme aparece', await page.locator('#alarmOverlay').isVisible());
      await page.click('text=PARAR ALARME');
      await page.waitForTimeout(200);
      check('PARAR desliga o alarme', await page.locator('#alarmOverlay').isHidden());

      // ajustes com o toggle novo
      await page.click('#nav button[data-v="cfg"]');
      await page.waitForTimeout(200);
      check('toggle "Alarme de verdade" nos ajustes', (await page.textContent('body')).includes('Alarme de verdade'));

      // empresa com inclusão manual desabilitada: o botão não pode existir
      await page.click('#nav button[data-v="hoje"]');
      await page.waitForTimeout(200);
      check('sem permissão, nenhum botão de incluir batida',
        await page.evaluate(()=>S.func.podeManual===false)
        && (await page.locator('.tl .incBtn').count())===0);
      await page.click('#nav button[data-v="cfg"]'); // as checagens seguintes são nos Ajustes
      await page.waitForTimeout(200);
      check('ajustes explicam por que não há botão de ponto manual', await page.evaluate(()=>{
        const t=document.querySelector('#views').textContent;
        return /Inclusão manual/i.test(t) && /desabilitada pela sua empresa/i.test(t);
      }));

      // diagnóstico de notificação/instalação: os botões têm que explicar, nunca ficar mudos
      check('diagnóstico de notificação aparece nos ajustes',
        (await page.locator('#diagNotif').count())===1
        && ((await page.textContent('#diagNotif'))||'').trim().length>10);

      const semPermissao = await page.evaluate(()=>{
        // simula permissão já negada: o botão precisa dizer o motivo, não virar no-op
        Object.defineProperty(Notification,'permission',{value:'denied',configurable:true});
        return porQueSemNotificacao();
      });
      check('permissão negada explica o motivo', !!semPermissao && /bloquead/i.test(semPermissao));

      await page.evaluate(()=>pedirPermissao());
      await page.waitForTimeout(150);
      check('botão de notificação avisa quando está bloqueado',
        (await page.locator('#toast').textContent()||'').length>10);

      const iosSemInstalar = await page.evaluate(()=>{
        Object.defineProperty(Notification,'permission',{value:'default',configurable:true});
        const orig=window.ehIOS; window.ehIOS=()=>true;      // finge iPhone em aba do Safari
        const m=porQueSemNotificacao(); window.ehIOS=orig; return m;
      });
      check('iPhone sem instalar manda instalar antes',
        !!iosSemInstalar && /tela inicial/i.test(iosSemInstalar));

      await page.evaluate(()=>{ window.deferredPrompt=null; instalarApp(); });
      await page.waitForTimeout(150);
      check('botão instalar explica o caminho',
        /instal|tela inicial|menu/i.test(await page.locator('#toast').textContent()||''));

      // agenda mandada ao serviço de push: é ela que faz o aviso chegar com o app fechado.
      // Os eventos reais dependem da hora do dia, então fixamos os horários pra não flutuar.
      const ag = await page.evaluate(()=>{
        const orig=window.eventosDoDia;
        const d=new Date(), agoraMin=d.getHours()*60+d.getMinutes();
        window.eventosDoDia=()=>[
          { chave:'futuro', min:Math.min(agoraMin+30,1439), titulo:'🏁 SAIA AGORA', corpo:'18:00', nivel:'alarme' },
          { chave:'passado', min:Math.max(agoraMin-30,0), titulo:'já era', corpo:'x' },
          { chave:'semhora', min:null, titulo:'sem horário', corpo:'y' },
        ];
        const r=agendaDeHoje();
        window.eventosDoDia=orig;
        const meiaNoite=new Date(); meiaNoite.setHours(0,0,0,0);
        return { r, base:meiaNoite.getTime(), agoraMin };
      });
      check('agenda leva só o evento que ainda vai acontecer',
        ag.r.length===1 && ag.r[0].chave.endsWith('|futuro'));
      check('evento sem horário é descartado', !ag.r.some(e=>e.chave.endsWith('|semhora')));
      check('vai em timestamp absoluto, não em minutos',
        ag.r[0].ts === ag.base + Math.min(ag.agoraMin+30,1439)*60000);
      check('chave é prefixada pela data pra não colidir entre dias',
        /^\d{4}-\d{2}-\d{2}\|futuro$/.test(ag.r[0].chave));
      check('nível alarme sobrevive até o servidor', ag.r[0].nivel==='alarme');

      const semAlarme = await page.evaluate(()=>{
        const antes=S.cfg.alarmes; S.cfg.alarmes=false;
        const a=agendaDeHoje(); S.cfg.alarmes=antes; return a;
      });
      check('alarmes desligados esvaziam a agenda', semAlarme.length===0);

      check('não posta agenda sem estar inscrito', await page.evaluate(async()=>{
        S.pushInscrito=false; return (await enviarAgenda())===false;
      }));

      check('campo da URL de push aparece nos ajustes',
        (await page.locator('#c_push').count())===1);

      // quem entra com sessão salva não passa pelo login, então o app tem que
      // pedir a permissão sozinho ao abrir — era esse o buraco
      check('enterApp prepara os avisos', await page.evaluate(()=>
        /prepararAvisos\(\)/.test(enterApp.toString())));
      check('convite aparece quando falta permissão', await page.evaluate(async()=>{
        Object.defineProperty(Notification,'permission',{value:'default',configurable:true});
        S.pushInscrito=false;
        mostrarConvite();
        const b=document.querySelector('#convite');
        return !b.classList.contains('hidden') && /Permitir/.test(b.textContent);
      }));
      check('convite some com "Agora não"', await page.evaluate(()=>{
        esconderConvite();
        return document.querySelector('#convite').classList.contains('hidden');
      }));
      check('com permissão dada o convite vira convite de push', await page.evaluate(()=>{
        Object.defineProperty(Notification,'permission',{value:'granted',configurable:true});
        S.pushInscrito=false;
        mostrarConvite();
        return /push/i.test(document.querySelector('#convite').textContent);
      }));
      check('com tudo ligado não há convite', await page.evaluate(()=>{
        S.pushInscrito=true;
        mostrarConvite();
        return document.querySelector('#convite').classList.contains('hidden');
      }));
    } else {
      check('tela de folga no fim de semana', (await page.textContent('body')).includes('folga'));
    }
    check('sem erros de JS no app', errs.length===0 || (console.log('   errs:',errs), false));
    await page.close();
  }

  // ---- 3) espelho só com "FALTA": nada foi batido, o dia não pode "fechar"
  {
    const page = await browser.newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
    await page.addInitScript(({port})=>{
      const d=new Date(); const hoje=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      localStorage.setItem('pontoimp.v2',JSON.stringify({ gateway:'http://localhost:'+port+'/gwfalta',
        auth:{banco:'1',tipo:'0',usuario:'9',senha:'',token:'fake',lembrar:true},
        func:{nome:'Dener Batista',empresa:'Impacta'},
        cfg:{cargaSegQui:492,cargaSex:432,entradaPadrao:'08:00',saidaAlmocoPadrao:'12:00',almocoMin:108,almocoPiso:60,
             compensarAtrasoNoAlmoco:true,adiantamento:'sair_cedo',metaSegQui:'',metaSex:'17:00',toleranciaMin:5,
             ativo:true,alarmes:true,modoAlarme:true,pollMin:3},
        hoje:{data:hoje,entrada:null,saidaAlmoco:null,voltaAlmoco:null,saida:null,almocoPrevisto:null,snoozeAte:null,perguntaFeita:false,metaHoje:''},
        hist:{ts:0,dias:[]}, notificados:{}, ultimaSyncMs:Date.now() }));
    },{port:PORT});
    await page.clock.setFixedTime(HOJE);
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForTimeout(1100);
    const txt = await page.textContent('body');

    // só o painel do app: #login fica no DOM escondido e sujaria a busca
    const app = await page.textContent('#app');
    check('FALTA não vira horário na tela', !app.includes('NaN'));
    check('dia não é dado como fechado sem batida', !/fechou certinho/i.test(app));
    check('nenhuma batida marcada como registrada', !/registrado no Secullum/.test(app));
    check('as batidas do dia continuam pendentes', await page.evaluate(()=>
      S.hoje.entrada===null && S.hoje.saidaAlmoco===null && S.hoje.voltaAlmoco===null && S.hoje.saida===null));
    check('saída exata mostra hora válida', await page.evaluate(()=>
      EH_HORA.test(planejarDia(S.hoje,cfgHoje()).alvoSaida||'')));

    // meta pré-preenchida: o campo nunca pode abrir vazio
    const dow=HOJE.getDay();
    if(dow>=1&&dow<=5){
      await page.click('#nav button[data-v="hoje"]');
      await page.waitForTimeout(200);
      const metaVal = await page.locator('#metaHoje').inputValue();
      check('campo "quero sair às" já vem preenchido', EH_HORA.test(metaVal));
      check('vem com a meta padrão do dia quando existe',
        dow===5 ? metaVal==='17:00' : EH_HORA.test(metaVal));

      // cartão da saída: sem informação repetida e sem quebra torta
      check('o selo nunca repete a hora que já está em destaque', await page.evaluate(()=>{
        const bar=document.querySelector('.metaBar');
        const alvo=bar.querySelector('.kpi .v').textContent.trim();
        return !bar.querySelector('.top .pill').textContent.includes(alvo);
      }));
      check('hora e selo dividem a mesma linha', await page.evaluate(()=>{
        const v=document.querySelector('.metaBar .kpi .v').getBoundingClientRect();
        const p=document.querySelector('.metaBar .top .pill').getBoundingClientRect();
        return p.top < v.bottom && p.bottom > v.top; // sobrepostos na vertical = lado a lado
      }));
      check('carga e almoço ficam em linha própria', await page.evaluate(()=>{
        const s=document.querySelector('.metaSub');
        return !!s && /carga/.test(s.textContent) && /almoço/.test(s.textContent);
      }));
    }
    check('sem erros de JS com espelho de FALTA', errs.length===0 || (console.log('   errs:',errs), false));
    await page.close();
  }

  // ---- 4) ponto manual: só aparece se a empresa permitir, e grava a hora certa
  {
    const page = await browser.newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
    await page.addInitScript(({port})=>{
      const d=new Date(); const hoje=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      localStorage.setItem('pontoimp.v2',JSON.stringify({ gateway:'http://localhost:'+port+'/gwman',
        auth:{banco:'1',tipo:'0',usuario:'9',senha:'',token:'fake',lembrar:true},
        func:{nome:'Dener Batista',empresa:'Impacta',podeManual:false},
        cfg:{cargaSegQui:492,cargaSex:432,entradaPadrao:'08:00',saidaAlmocoPadrao:'12:00',almocoMin:108,almocoPiso:60,
             compensarAtrasoNoAlmoco:true,adiantamento:'sair_cedo',metaSegQui:'',metaSex:'',toleranciaMin:5,
             ativo:true,alarmes:true,modoAlarme:true,pollMin:3},
        hoje:{data:hoje,entrada:null,saidaAlmoco:null,voltaAlmoco:null,saida:null,almocoPrevisto:null,snoozeAte:null,perguntaFeita:false,metaHoje:''},
        hist:{ts:0,dias:[]}, justificativas:[], notificados:{}, ultimaSyncMs:Date.now() }));
    },{port:PORT});
    await page.clock.setFixedTime(HOJE);
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForTimeout(1200);

    const dow=HOJE.getDay();
    if(dow>=1&&dow<=5){
      // o relógio está fixo às 09:00 e a entrada era 08:00: 60min de atraso.
      // Antes a tela dizia "esperando o Secullum processar" pra sempre.
      const linha = await page.textContent('#app');
      check('batida atrasada deixa de dizer "esperando"',
        !/esperando o Secullum processar/.test(linha));
      check('diz que a batida não chegou, e há quanto tempo',
        /não chegou do Secullum/.test(linha) && /01:00 atrás/.test(linha));
      check('estado de espera vale só nos primeiros minutos', await page.evaluate(()=>{
        const p=batidaPendente();
        return p && p.sumiu===true && p.atraso===60;
      }));

      // remover a meta: com o campo sempre preenchido, sem isto não há como limpar
      check('remover meta volta pra saída que zera o dia', await page.evaluate(()=>{
        S.hoje.metaHoje='21:23'; save(); render();
        const tinha=document.querySelector('#views').textContent.includes('Remover a meta de hoje');
        removerMetaHoje();
        return tinha && S.hoje.metaHoje==='' &&
          !document.querySelector('#views').textContent.includes('Remover a meta de hoje');
      }));

      check('permissão da empresa é lida do /me', await page.evaluate(()=>S.func.podeManual===true));
      check('botão de incluir aparece nas batidas que faltam',
        (await page.locator('.tl .incBtn').count())>0);

      await page.click('.tl .incBtn');
      await page.waitForTimeout(250);
      check('sheet de inclusão abre', await page.locator('#sheetInc').isVisible());
      check('mostra os cinco pares de entrada e saída',
        (await page.locator('#incPares .parPonto').count())===5);
      await page.click('button:has-text("Preencher o que falta")');
      await page.waitForTimeout(200);
      check('o motor preenche o que falta',
        (await page.locator('#e1').inputValue())==='08:00');
      check('prévia diz o efeito no saldo',
        /zera|extra|desconto|saída/i.test(await page.textContent('#incPrevia')));

      await page.click('#incBtn');
      await page.waitForTimeout(200);
      check('exige observação, que é o que o gestor lê',
        /Escreva uma observação/.test(await page.textContent('#toast')));

      await page.fill('#incObs','Retorno sem registro');
      await page.click('#incBtn');
      await page.waitForTimeout(700);

      const env = ultimoPonto;
      check('enviou a solicitação de ajuste', !!env);
      check('vai como ajuste de ponto (tipo 0)', !!env && env.tipo===0);
      check('manda o dia inteiro em pares entrada/saida', !!env
        && 'entrada1' in env && 'saida5' in env);
      check('data do dia, à meia-noite e sem UTC',
        !!env && /^\d{4}-\d{2}-\d{2}T00:00:00$/.test(env.data));
      check('leva o funcionarioId, que o Secullum exige', !!env && env.funcionarioId===144);
      check('observação vai no corpo', !!env && env.observacoes==='Retorno sem registro');
      check('sheet fecha depois de enviar', await page.locator('#sheetInc').isHidden());

      // corrigir um dia passado: é onde a batida esquecida costuma ser notada
      // view direto, sem go(): go('hist') recarrega do gateway e apaga este fixture
      await page.evaluate(()=>{
        S.hist={ts:Date.now(),dias:[{iso:'2026-08-12',data:'12/08',dia:'Qua',fds:false,saldoStr:'',bat:['08:00','12:00']}]};
        view='hist'; render();
      });
      await page.waitForTimeout(300);
      // as três ações aparecem em todo dia, então miramos na linha do dia 12
      check('todo dia oferece detalhes, justificar e ajustar',
        (await page.locator('.dia:has-text("12/08") .acoesDia .btn').count())===3);

      await page.click('.dia:has-text("12/08") button:has-text("ajustar")');
      await page.waitForTimeout(300);
      check('a sheet abre na data daquele dia, não na de hoje',
        /12\/08\/2026/.test(await page.textContent('#incTitulo')));
      check('as batidas que existem já vêm preenchidas',
        (await page.locator('#e1').inputValue())==='08:00'
        && (await page.locator('#s1').inputValue())==='12:00');
      check('as que faltam começam vazias, sem inventar',
        (await page.locator('#e2').inputValue())==='');

      await page.click('button:has-text("Preencher o que falta")');
      await page.waitForTimeout(200);
      check('o motor preenche só os vazios, sem mexer no que existe',
        (await page.locator('#e1').inputValue())==='08:00'
        && EH_HORA.test(await page.locator('#e2').inputValue()));

      await page.fill('#incObs','Retorno sem registro');
      await page.click('#incBtn');
      await page.waitForTimeout(600);
      check('o POST vai com a data do dia corrigido',
        !!ultimoPonto && /^2026-08-12T00:00:00$/.test(ultimoPonto.data));
      // pendência do Secullum casada com a linha do dia: justificar sem sair do histórico
      await page.evaluate(()=>{
        S.hist={ts:Date.now(),dias:[{iso:'2026-08-10',data:'10/08',dia:'Seg',fds:false,saldoStr:'',bat:['08:00','12:00','13:00','18:00']}]};
        view='hist'; render();
      });
      await page.waitForTimeout(300);
      check('dia com pendência tem o justificar na linha',
        (await page.locator('.dia:has-text("10/08") .jusLinha').count())===1);
      check('detalhes do dia abrem e mostram o cálculo', await page.evaluate(()=>{
        verDetalhes('2026-08-10');
        const b=document.querySelector('#det-2026-08-10');
        return !b.classList.contains('hidden')
          && /carga do dia/.test(b.textContent) && /saldo/.test(b.textContent);
      }));

      await page.click('.dia:has-text("10/08") .jusLinha');
      await page.waitForTimeout(250);
      check('abre a justificativa daquela pendência',
        await page.locator('#sheetJus').isVisible()
        && /10\/08\/2026/.test(await page.textContent('#jusTxt')));
      await page.evaluate(()=>fecharJustificar());

      await page.evaluate(()=>{ fecharIncluir(); go('hoje'); });
      await page.waitForTimeout(200);

      // o toast não pode cair em cima do botão que o usuário vai tocar
      // inconsistências: o contrato é devolver o objeto inteiro, só com a justificativa
      check('pendência do Secullum aparece na tela',
        /Pendências do Secullum/.test(await page.textContent('#app'))
        && (await page.locator('.tl .jusLinha').count())===1);

      await page.click('.tl .jusLinha');
      await page.waitForTimeout(250);
      check('sheet de justificativa abre com a pendência descrita',
        await page.locator('#sheetJus').isVisible()
        && /10\/08\/2026/.test(await page.textContent('#jusTxt')));
      check('lista de justificativas vem do espelho',
        (await page.locator('#jusSel option').count())===2);

      await page.fill('#jusLivre','Esqueci de bater na saída');
      await page.click('#jusBtn');
      await page.waitForTimeout(600);

      const j = ultimaJustificativa;
      check('enviou a justificativa', !!j);
      check('devolve o objeto original sem mexer', !!j
        && j.id===77 && j.status===0 && j.campoInterno==='preservar'
        && j.tipo==='Falta de marcação');
      check('só acrescenta o campo justificativa',
        !!j && j.justificativa==='Esqueci de bater na saída');
      check('texto livre tem prioridade sobre o select',
        !!j && j.justificativa!=='Esquecimento');

      check('toast não cobre o botão da sheet', await page.evaluate(async()=>{
        abrirIncluir('entrada'); toast('mensagem de teste');
        await new Promise(r=>setTimeout(r,120));
        const t=document.querySelector('#toast').getBoundingClientRect();
        const b=document.querySelector('#incBtn').getBoundingClientRect();
        const cobre = t.bottom>b.top && t.top<b.bottom && t.right>b.left && t.left<b.right;
        fecharIncluir();
        return !cobre;
      }));
    }
    check('sem erros de JS no ponto manual', errs.length===0 || (console.log('   errs:',errs), false));
    await page.close();
  }

  // ---- 4b) gateway sem o patch: a listagem ainda funciona pela escotilha /me/raw
  {
    const page = await browser.newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
    await page.addInitScript(({port})=>{
      const d=new Date(); const hoje=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      localStorage.setItem('pontoimp.v2',JSON.stringify({ gateway:'http://localhost:'+port+'/gwraw',
        auth:{banco:'1',tipo:'0',usuario:'9',senha:'',token:'fake',lembrar:true},
        func:{nome:'D',empresa:'I',podeManual:false},
        cfg:{cargaSegQui:492,cargaSex:432,entradaPadrao:'08:00',saidaAlmocoPadrao:'12:00',almocoMin:108,almocoPiso:60,
             compensarAtrasoNoAlmoco:true,adiantamento:'sair_cedo',metaSegQui:'',metaSex:'',toleranciaMin:5,
             ativo:true,alarmes:true,modoAlarme:true,pollMin:3},
        hoje:{data:hoje,entrada:'08:00',saidaAlmoco:null,voltaAlmoco:null,saida:null,almocoPrevisto:null,snoozeAte:null,perguntaFeita:false,metaHoje:''},
        hist:{ts:0,dias:[]}, justificativas:[], notificados:{}, ultimaSyncMs:Date.now() }));
    },{port:PORT});
    await page.clock.setFixedTime(HOJE);
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForTimeout(1100);

    check('lista as pendências mesmo sem o patch, via /me/raw',
      /Via raw/.test(await page.textContent('#app')));

    await page.click('.tl .jusLinha');
    await page.waitForTimeout(200);
    await page.fill('#jusLivre','teste');
    await page.click('#jusBtn');
    await page.waitForTimeout(400);
    check('envio sem o patch culpa o gateway, não o Secullum',
      /gateway ainda não tem a rota/i.test(await page.textContent('#toast')));

    // o gateway em produção também não tem POST /me/ponto: o ＋ precisa dizer isso
    await page.evaluate(()=>fecharJustificar()); // a sheet fica aberta no erro, e é o certo
    await page.click('#nav button[data-v="hoje"]');
    await page.waitForTimeout(200);
    await page.click('.tl .incBtn');
    await page.waitForTimeout(250);
    await page.click('button:has-text("Preencher o que falta")');
    await page.fill('#incObs','teste');
    await page.click('#incBtn');
    await page.waitForTimeout(600);
    check('ajuste sem a rota aponta pro gateway',
      /gateway ainda não tem a rota \/me\/solicitacao/i.test(await page.textContent('#toast')));
    check('sem erros de JS no fallback', errs.length===0 || (console.log('   errs:',errs), false));
    await page.close();
  }

  // ---- 4c) sábado: a tela de folga não pode engolir as pendências de dias passados
  {
    const page = await browser.newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
    await page.addInitScript(({port})=>{
      localStorage.setItem('pontoimp.v2',JSON.stringify({ gateway:'http://localhost:'+port+'/gwraw',
        auth:{banco:'1',tipo:'0',usuario:'9',senha:'',token:'fake',lembrar:true},
        func:{nome:'D',empresa:'I',podeManual:false},
        cfg:{cargaSegQui:492,cargaSex:432,entradaPadrao:'08:00',saidaAlmocoPadrao:'12:00',almocoMin:108,almocoPiso:60,
             compensarAtrasoNoAlmoco:true,adiantamento:'sair_cedo',metaSegQui:'',metaSex:'',toleranciaMin:5,
             ativo:true,alarmes:true,modoAlarme:true,pollMin:3},
        hoje:{data:'2026-08-15',entrada:null,saidaAlmoco:null,voltaAlmoco:null,saida:null,almocoPrevisto:null,snoozeAte:null,perguntaFeita:false,metaHoje:''},
        hist:{ts:0,dias:[]}, justificativas:[], notificados:{}, ultimaSyncMs:Date.now() }));
    },{port:PORT});
    await page.clock.setFixedTime(new Date(2026, 7, 15, 10, 0, 0)); // sábado
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForTimeout(1100);

    const app = await page.textContent('#app');
    check('sábado mostra a tela de folga', /Hoje é folga/.test(app));
    check('mas a pendência continua visível na folga', /Pendências do Secullum/.test(app) && /Via raw/.test(app));
    check('e ainda dá pra justificar dali', (await page.locator('.tl .jusLinha').count())===1);
    check('sem erros de JS no sábado', errs.length===0 || (console.log('   errs:',errs), false));
    await page.close();
  }

  // ---- 5) rodando dentro do APK: a interface tem que parar de falar como site
  {
    const page = await browser.newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
    const agendados=[];
    await page.exposeFunction('registrarAgenda', (j)=>agendados.push(j));
    await page.addInitScript(({port})=>{
      // a ponte que o WebView do app injeta
      window.AndroidAlarme = { agendar:(j)=>window.registrarAgenda(j), disponivel:()=>true,
        podeAlarmeExato:()=>false, podeSobreporTelas:()=>true, podeIgnorarBateria:()=>false, sentinelaLigada:()=>false, alarmesArmados:()=>0,
        pedirAlarmeExato:()=>{}, pedirSobreporTelas:()=>{}, pedirIgnorarBateria:()=>{}, ligarSentinela:(v)=>{window.sentinelaPedida=v;}, testarAlarme:()=>{},
        // o lado nativo responde por callback, como o WebView faz de verdade
        verificarAtualizacao:()=>setTimeout(()=>window.aoVerificarAtualizacao(14,11),30),
        baixarAtualizacao:()=>window.baixouChamado&&window.baixouChamado() };
      const d=new Date(); const hoje=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      localStorage.setItem('pontoimp.v2',JSON.stringify({ gateway:'http://localhost:'+port+'/gw',
        auth:{banco:'1',tipo:'0',usuario:'9',senha:'',token:'fake',lembrar:true},
        func:{nome:'Dener Batista',empresa:'Impacta',podeManual:false},
        cfg:{cargaSegQui:492,cargaSex:432,entradaPadrao:'08:00',saidaAlmocoPadrao:'12:00',almocoMin:108,almocoPiso:60,
             compensarAtrasoNoAlmoco:true,adiantamento:'sair_cedo',metaSegQui:'',metaSex:'',toleranciaMin:5,
             ativo:true,alarmes:true,modoAlarme:true,pollMin:3},
        hoje:{data:hoje,entrada:'08:00',saidaAlmoco:null,voltaAlmoco:null,saida:null,almocoPrevisto:null,snoozeAte:null,perguntaFeita:false,metaHoje:''},
        hist:{ts:0,dias:[]}, justificativas:[], notificados:{}, ultimaSyncMs:Date.now() }));
    },{port:PORT});
    await page.clock.setFixedTime(HOJE);
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForTimeout(1000);

    check('a página reconhece que está dentro do app', await page.evaluate(()=>temPonteNativa()));

    // um dia sem abrir o app deixava aquele dia sem alarme nenhum
    const fut = await page.evaluate(()=>agendaFutura());
    check('marca os próximos dias úteis adiantado', fut.length>0);
    check('nenhum alarme futuro cai em sábado ou domingo',
      fut.every(e=>{ const d=new Date(e.ts).getDay(); return d>=1&&d<=5; }));
    check('todos os futuros estão à frente de agora',
      await page.evaluate(()=>agendaFutura().every(e=>e.ts>Date.now())));
    check('quatro alarmes por dia útil', fut.length%4===0);
    check('chave prefixada pela data de cada dia',
      fut.every(e=>/^\d{4}-\d{2}-\d{2}\|/.test(e.chave)));
    check('avisa que o horário é o padrão, não o real',
      fut.every(e=>/padrão/i.test(e.corpo)));
    check('alarmes desligados não marcam dias futuros', await page.evaluate(()=>{
      const a=S.cfg.alarmes; S.cfg.alarmes=false;
      const v=agendaFutura().length; S.cfg.alarmes=a; return v===0;
    }));
    check('entrega a agenda pro lado nativo', agendados.length>0
      && Array.isArray(JSON.parse(agendados[0])));
    check('não pede permissão de notificação do navegador',
      await page.locator('#convite').isHidden());

    await page.click('#nav button[data-v="cfg"]');
    await page.waitForTimeout(250);
    const cfg = await page.textContent('#views');
    check('some o botão de instalar, que não faz sentido no app', !/Instalar no celular/.test(cfg));
    check('some o push, substituído pelo alarme do sistema', !/Avisar com o app fechado/.test(cfg));
    check('aparece o remarcar alarmes', /Remarcar alarmes/.test(cfg));
    check('explica que o alarme é do sistema', /despertador do sistema/.test(cfg));
    // a falta de permissão de alarme exato derrubava tudo em silêncio
    check('mostra o estado das permissões do alarme',
      /Alarme na hora exata/.test(cfg) && /Abrir sobre outras telas/.test(cfg));
    check('avisa que sem alarme exato nada é marcado',
      /o Android não marca nada/.test(cfg));
    check('mostra quantos alarmes estão marcados', /Alarmes marcados no sistema/.test(cfg));
    check('permissão pendente vira botão, não texto morto',
      (await page.locator('button:has-text("permitir")').count())===2);
    check('pede a isenção de economia de bateria, que a Samsung exige',
      /Ignorar economia de bateria/.test(cfg));
    check('explica que a suspensão da Samsung mata o alarme',
      /suspensão de apps da Samsung/.test(cfg));
    check('oferece a sentinela como garantia', /Sentinela \(vigia sozinho\)/.test(cfg));
    check('deixa claro o custo da sentinela', /aviso fixo na barra/.test(cfg));
    check('o botão da sentinela liga de verdade', await page.evaluate(()=>{
      alternarSentinela(); return window.sentinelaPedida===true;
    }));

    // atualização do APK: o app confere sozinho ao abrir e oferece baixar
    check('detecta versão nova ao abrir', await page.evaluate(()=>versaoNova===14));
    check('oferece baixar a versão nova',
      (await page.locator('button:has-text("Baixar e instalar a versão 14")').count())===1);
    check('checagem automática não fala quando já está atualizado', await page.evaluate(async()=>{
      checagemSilenciosa=true; aoVerificarAtualizacao(0,14);
      document.querySelector('#toast').textContent='';
      aoVerificarAtualizacao(0,14);
      await new Promise(r=>setTimeout(r,60));
      return document.querySelector('#toast').textContent==='';
    }));
    check('no botão, responde mesmo estando atualizado', await page.evaluate(async()=>{
      checagemSilenciosa=false; aoVerificarAtualizacao(0,14);
      await new Promise(r=>setTimeout(r,60));
      return /versão mais nova/.test(document.querySelector('#toast').textContent);
    }));
    check('sem erros de JS dentro do app', errs.length===0 || (console.log('   errs:',errs), false));
    await page.close();
  }

  await browser.close(); server.close();
  console.log(fails? `\n${fails} FALHAS`:'\ntudo certo ✔');
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
