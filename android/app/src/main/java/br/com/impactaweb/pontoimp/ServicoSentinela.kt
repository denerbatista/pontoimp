package br.com.impactaweb.pontoimp

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Vigia o relógio por conta própria, em primeiro plano.
 *
 * O AlarmManager já deveria bastar, mas a suspensão de apps de alguns
 * fabricantes derruba alarme mesmo agendado. Este serviço é a rede de
 * segurança: enquanto estiver ligado, o processo fica vivo e confere a agenda
 * a cada meio minuto, disparando o que venceu.
 *
 * Os dois caminhos passam pelo mesmo receptor, e a chave já disparada é
 * marcada — então redundância aqui não vira alarme repetido.
 */
class ServicoSentinela : Service() {

    private val laco = Handler(Looper.getMainLooper())
    private lateinit var tique: Runnable
    private var ultimaAtualizacao = 0L

    override fun onCreate() {
        super.onCreate()
        tique = object : Runnable {
            override fun run() {
                conferir()
                // de tempos em tempos busca do Secullum e recalcula, senão os
                // horários ficariam congelados no último dia em que o app abriu
                if (System.currentTimeMillis() - ultimaAtualizacao >= INTERVALO_SYNC) recalcular()
                laco.postDelayed(this, INTERVALO)
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == PARAR) { desligar(this); stopSelf(); return START_NOT_STICKY }
        startForeground(NOTIF_ID, aviso())
        laco.removeCallbacks(tique)
        laco.post(tique)
        return START_STICKY   // se o sistema matar, volta
    }

    /**
     * Sincroniza com o Secullum e recalcula, sem o app aberto.
     *
     * O motor vive na página, não aqui — reescrevê-lo em Kotlin seria duas
     * fontes de verdade pro mesmo cálculo. Em vez disso carregamos a própria
     * página numa WebView invisível: ela sincroniza, recalcula com as batidas
     * reais e chama a ponte, que remarca os alarmes. Mesmo caminho de quando
     * você abre o app.
     */
    private fun recalcular() {
        runCatching {
            val web = WebView(this)
            web.settings.javaScriptEnabled = true
            web.settings.domStorageEnabled = true   // mesma sessão da tela principal
            web.settings.databaseEnabled = true
            web.addJavascriptInterface(PonteServico(applicationContext), "AndroidAlarme")
            web.webViewClient = object : WebViewClient() {
                override fun onPageFinished(v: WebView?, url: String?) {
                    // dá tempo do espelho chegar antes de descartar a WebView
                    laco.postDelayed({ runCatching { v?.destroy() } }, 25_000)
                }
            }
            web.loadUrl(MainActivity.URL_APP)
            ultimaAtualizacao = System.currentTimeMillis()
            Log.i("PontoImp", "sentinela: recalculando em segundo plano")
        }.onFailure { Log.w("PontoImp", "sentinela: falhou ao recalcular", it) }
    }

    /** Ponte mínima: no segundo plano só interessa remarcar os alarmes. */
    private class PonteServico(private val ctx: Context) {
        @JavascriptInterface fun disponivel(): Boolean = true
        @JavascriptInterface fun agendar(json: String) {
            AgendadorAlarmes.armar(ctx, Agenda.deTexto(json))
        }
    }

    /** Dispara o que já venceu e ainda não saiu, dentro de uma janela curta. */
    private fun conferir() {
        val agora = System.currentTimeMillis()
        Agenda.ler(this)
            .filter { it.ts <= agora && agora - it.ts <= JANELA && !Agenda.jaDisparou(this, it.chave) }
            .forEach { ev ->
                Log.i("PontoImp", "sentinela disparando ${ev.chave}")
                sendBroadcast(Intent(this, ReceptorAlarme::class.java).apply {
                    putExtra("chave", ev.chave)
                    putExtra("titulo", ev.titulo)
                    putExtra("corpo", ev.corpo)
                    putExtra("alarme", ev.alarme)
                })
            }
    }

    private fun aviso(): Notification {
        val abrir = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val parar = PendingIntent.getService(this, 1,
            Intent(this, ServicoSentinela::class.java).setAction(PARAR),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, App.CANAL_SERVICO)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("PontoImp vigiando seu ponto")
            .setContentText("Os alarmes tocam mesmo com o app fechado.")
            .setContentIntent(abrir)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null, "Parar", parar).build())
            .build()
    }

    override fun onDestroy() { laco.removeCallbacks(tique); super.onDestroy() }
    override fun onBind(i: Intent?): IBinder? = null

    companion object {
        private const val NOTIF_ID = 4242
        private const val INTERVALO = 30_000L
        private const val JANELA = 5 * 60_000L      // não dispara aviso de horas atrás
        private const val INTERVALO_SYNC = 20 * 60_000L
        const val PARAR = "br.com.impactaweb.pontoimp.PARAR_SENTINELA"
        private const val PREFS = "pontoimp.sentinela"
        private const val LIGADO = "ligado"

        fun ligado(ctx: Context) =
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(LIGADO, false)

        fun ligar(ctx: Context) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(LIGADO, true).apply()
            val i = Intent(ctx, ServicoSentinela::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i)
            else ctx.startService(i)
        }

        fun desligar(ctx: Context) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(LIGADO, false).apply()
            ctx.stopService(Intent(ctx, ServicoSentinela::class.java))
        }
    }
}
