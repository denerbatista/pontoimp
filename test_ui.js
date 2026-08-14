// Smoke test da UI v7 (modo monitor + histórico + ampulheta + alarme)
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8765;
const EH_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const isoLocal = (d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const diasAtras = (n)=>{ const d=new Date(); d.setDate(d.getDate()-n); return d; };

// gateway fake em /gw: espelho com hoje (1 batida), ontem completo, anteontem completo, D-3 vazio
function espelhoFake(){
  return { lista: [
    { data: isoLocal(diasAtras(0))+'T12:00:00', batidas:[{valor:'08:00'}] },
    { data: isoLocal(diasAtras(1))+'T12:00:00', batidas:[{valor:'08:02'},{valor:'12:00'},{valor:'13:26'},{valor:'18:00'}], saldo:'00:00' },
    { data: isoLocal(diasAtras(2))+'T12:00:00', batidas:[{valor:'07:45'},{valor:'12:00'},{valor:'13:48'},{valor:'17:45'}] },
    { data: isoLocal(diasAtras(3))+'T12:00:00', batidas:[] },
  ]};
}
const server = http.createServer((req,res)=>{
  let p = req.url.split('?')[0];
  if(p.startsWith('/gw/me/espelho')){ res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(espelhoFake())); return; }
  // o Secullum devolve "FALTA" no lugar da hora quando não houve registro
  if(p.startsWith('/gwfalta/me/espelho')){ res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ lista:[{ data:isoLocal(diasAtras(0))+'T12:00:00',
      batidas:[{valor:'FALTA'},{valor:'FALTA'},{valor:'FALTA'},{valor:'FALTA'}] }] })); return; }
  if(p.startsWith('/gw/')||p.startsWith('/gwfalta/')){ res.statusCode=404; res.end('{}'); return; }
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
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForTimeout(900);
    check('app visível com sessão salva', await page.locator('#app').isVisible());
    const dow=new Date().getDay(), util=dow>=1&&dow<=5;
    const h=(m)=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
    const carga=dow===5?432:492;
    if(util){
      const body=await page.textContent('body');
      check(`saída exata ${h(480+carga+108)} na tela`, body.includes(h(480+carga+108)));
      // ampulheta: já passou do almoço planejado e a batida não veio
      const passouAlmoco = (new Date().getHours()*60+new Date().getMinutes()) >= 720;
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
    const dow=new Date().getDay();
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

  await browser.close(); server.close();
  console.log(fails? `\n${fails} FALHAS`:'\ntudo certo ✔');
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
