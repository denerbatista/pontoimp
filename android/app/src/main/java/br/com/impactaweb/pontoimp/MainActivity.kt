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
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
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
        b.web.webViewClient = WebViewClient()
        b.web.addJavascriptInterface(Ponte(), "AndroidAlarme")
        if (estado == null) b.web.loadUrl(URL_APP)

        pedirPermissoes()
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
    }

    override fun onBackPressed() {
        if (b.web.canGoBack()) b.web.goBack() else super.onBackPressed()
    }

    companion object {
        const val URL_APP = "https://denerbatista.github.io/pontoimp/"
    }
}
