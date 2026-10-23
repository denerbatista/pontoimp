package br.com.impactaweb.pontoimp

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File
import br.com.impactaweb.pontoimp.databinding.TelaPrincipalBinding

/**
 * A interface é a mesma do site — nada foi reescrito. O que o app acrescenta é a
 * ponte: a página entrega a agenda do dia e o lado nativo transforma em alarme
 * de verdade, que é o que o navegador nunca vai conseguir fazer.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var b: TelaPrincipalBinding

    private val pedirNotificacao = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* negar não quebra o app: o alarme ainda toca, só não notifica */ }

    /* Bater o ponto pede GPS e, em algumas empresas, foto. A WebView não pergunta
       nada sozinha: sem isto o navegador interno nega em silêncio e a página
       recebe "permissão negada" sem o usuário ter visto pergunta nenhuma. */
    private var aoResponderPermissao: ((Boolean) -> Unit)? = null
    private val pedirPermissoesPagina = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { r -> aoResponderPermissao?.invoke(r.values.all { it }); aoResponderPermissao = null }

    private fun garantir(perms: Array<String>, depois: (Boolean) -> Unit) {
        if (perms.all { ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED })
            return depois(true)
        aoResponderPermissao = depois
        pedirPermissoesPagina.launch(perms)
    }

    // anexo de atestado e foto pelo seletor de arquivos (<input type=file>)
    private var aoEscolherArquivo: ValueCallback<Array<Uri>>? = null
    private val escolherArquivo = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { r ->
        aoEscolherArquivo?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data))
        aoEscolherArquivo = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(estado: Bundle?) {
        super.onCreate(estado)
        b = TelaPrincipalBinding.inflate(layoutInflater)
        setContentView(b.root)

        b.web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true          // o app guarda tudo em localStorage
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
        }
        b.web.settings.setGeolocationEnabled(true)
        b.web.webViewClient = object : WebViewClient() {
            /* Sem rede, a WebView mostrava a página de erro do Chrome ("não é
               possível acessar este site"). Só a falha da página principal conta:
               um ícone ou chamada ao gateway que falhe não deve trocar a tela. */
            override fun onReceivedError(v: WebView, req: WebResourceRequest, erro: WebResourceError) {
                if (!req.isForMainFrame) return
                mostrarSemSinal()
            }
        }
        b.web.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origem: String, cb: GeolocationPermissions.Callback
            ) = garantir(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION)) { ok -> cb.invoke(origem, ok, false) }

            // a foto do ponto é tirada na própria página, com getUserMedia
            override fun onPermissionRequest(pedido: PermissionRequest) {
                if (PermissionRequest.RESOURCE_VIDEO_CAPTURE !in pedido.resources) return pedido.deny()
                runOnUiThread {
                    garantir(arrayOf(Manifest.permission.CAMERA)) { ok ->
                        if (ok) pedido.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else pedido.deny()
                    }
                }
            }

            override fun onShowFileChooser(
                w: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams
            ): Boolean {
                aoEscolherArquivo?.onReceiveValue(null)
                aoEscolherArquivo = cb
                return runCatching { escolherArquivo.launch(params.createIntent()); true }
                    .getOrElse { aoEscolherArquivo = null; false }
            }
        }
        b.web.addJavascriptInterface(Ponte(), "AndroidAlarme")
        if (estado == null) b.web.loadUrl(URL_APP)

        pedirPermissoes()
    }

    private fun mostrarSemSinal() {
        val html = runCatching { assets.open("sem-sinal.html").bufferedReader().readText() }
            .getOrDefault("<h1>Sem conexão</h1>")
            .replace("__URL_APP__", URL_APP)
        // base no próprio site, pra o "tentar de novo" voltar à origem certa
        b.web.loadDataWithBaseURL(URL_APP, html, "text/html", "utf-8", URL_APP)
    }

    private fun pedirPermissoes() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) pedirNotificacao.launch(Manifest.permission.POST_NOTIFICATIONS)

        // no Android 12 o alarme exato depende de uma tela de sistema; sem ela,
        // agendar falha em silêncio — então mandamos o usuário direto pra lá
        val am = getSystemService(AlarmManager::class.java)
        if (!AgendadorAlarmes.podeExatos(am)) {
            runCatching {
                startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                    Uri.parse("package:$packageName")))
            }
        }
    }

    /** Chamada pela página. Ver `agendaDeHoje()` no index.html. */
    inner class Ponte {
        @JavascriptInterface
        fun agendar(json: String) {
            val eventos = Agenda.deTexto(json)
            runOnUiThread { AgendadorAlarmes.armar(applicationContext, eventos) }
        }

        /** A página usa isto pra saber que está rodando dentro do app. */
        @JavascriptInterface
        fun disponivel(): Boolean = true

        /* Sem estes, a falta de permissão de alarme exato derrubava tudo em
           silêncio: nada era agendado e a tela não tinha como contar. */
        @JavascriptInterface
        fun podeAlarmeExato(): Boolean =
            AgendadorAlarmes.podeExatos(getSystemService(AlarmManager::class.java))

        @JavascriptInterface
        fun alarmesArmados(): Int = AgendadorAlarmes.armadosAgora(applicationContext)

        @JavascriptInterface
        fun podeSobreporTelas(): Boolean =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this@MainActivity)

        @JavascriptInterface
        fun pedirAlarmeExato() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
            runOnUiThread {
                runCatching {
                    startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:$packageName")))
                }
            }
        }

        /* Sem a isenção de bateria a Samsung suspende o app e o alarme não
           dispara, mesmo marcado com setAlarmClock. */
        @JavascriptInterface
        fun podeIgnorarBateria(): Boolean =
            getSystemService(android.os.PowerManager::class.java)
                ?.isIgnoringBatteryOptimizations(packageName) ?: true

        @JavascriptInterface
        @android.annotation.SuppressLint("BatteryLife")
        fun pedirIgnorarBateria() {
            runOnUiThread {
                runCatching {
                    startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:$packageName")))
                }.onFailure {
                    // alguns aparelhos escondem a tela direta; caímos na lista geral
                    runCatching { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
                }
            }
        }

        @JavascriptInterface
        fun pedirSobreporTelas() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
            runOnUiThread {
                runCatching {
                    startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:$packageName")))
                }
            }
        }

        /* ---- atualização ---- */

        /** Devolve a versão nova, ou "" se já está atualizado. Faz rede: assíncrono. */
        @JavascriptInterface
        fun verificarAtualizacao() {
            Thread {
                val r = Atualizador.consultar()
                val atual = Atualizador.versaoInstalada(applicationContext)
                val nova = if (r != null && r.versao > atual) r.versao else 0
                runOnUiThread {
                    b.web.evaluateJavascript("window.aoVerificarAtualizacao&&aoVerificarAtualizacao($nova,$atual)", null)
                }
            }.start()
        }

        /** Baixa e, ao terminar, abre a tela de instalação do Android. */
        @JavascriptInterface
        fun baixarAtualizacao() {
            Thread {
                val r = Atualizador.consultar()
                if (r == null) { avisar("Não consegui consultar a atualização."); return@Thread }
                val id = Atualizador.baixar(applicationContext, r)
                avisar("Baixando o APK ${r.versao}…")
                // espera o download; o DownloadManager não avisa direto a Activity
                repeat(180) {
                    Thread.sleep(1000)
                    if (Atualizador.instalar(applicationContext, id)) return@Thread
                }
                avisar("O download demorou demais. Tente pela release no GitHub.")
            }.start()
        }

        private fun avisar(txt: String) = runOnUiThread {
            b.web.evaluateJavascript("window.toast&&toast(${org.json.JSONObject.quote(txt)})", null)
        }

        /* ---- documentos: cartão ponto em PDF, comprovante, arquivos do RH ----
           Blob e download não funcionam dentro da WebView. A página entrega os
           bytes em base64 e o Android abre no leitor que o usuário tiver. */
        @JavascriptInterface
        fun abrirArquivo(nome: String, base64: String, mime: String) {
            runCatching {
                val pasta = File(cacheDir, "documentos").apply { mkdirs() }
                // o nome vem da página: só o que é seguro em nome de arquivo
                val seguro = nome.replace(Regex("[^A-Za-z0-9._-]"), "_").take(80).ifEmpty { "arquivo" }
                val arq = File(pasta, seguro)
                arq.writeBytes(android.util.Base64.decode(base64, android.util.Base64.DEFAULT))
                val uri = FileProvider.getUriForFile(applicationContext, "$packageName.arquivos", arq)
                runOnUiThread {
                    startActivity(Intent.createChooser(Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(uri, mime.ifEmpty { "application/octet-stream" })
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }, "Abrir com"))
                }
            }.onFailure { avisar("Não consegui abrir o arquivo: ${it.message}") }
        }

        /* ---- sentinela: rede de segurança contra o app ser suspenso ---- */
        @JavascriptInterface
        fun sentinelaLigada(): Boolean = ServicoSentinela.ligado(applicationContext)

        @JavascriptInterface
        fun ligarSentinela(ligar: Boolean) {
            runOnUiThread {
                if (ligar) ServicoSentinela.ligar(applicationContext)
                else ServicoSentinela.desligar(applicationContext)
            }
        }

        /** Dispara a tela de alarme agora, pra você conferir sem esperar o horário. */
        @JavascriptInterface
        fun testarAlarme() {
            runOnUiThread {
                sendBroadcast(Intent(applicationContext, ReceptorAlarme::class.java).apply {
                    putExtra("chave", "teste")
                    putExtra("titulo", "⏰ Teste de alarme")
                    putExtra("corpo", "Se você está vendo isto, o alarme funciona.")
                    putExtra("alarme", true)
                })
            }
        }
    }

    override fun onBackPressed() {
        if (b.web.canGoBack()) b.web.goBack() else super.onBackPressed()
    }

    companion object {
        const val URL_APP = "https://denerbatista.github.io/pontoimp/"
    }
}
