package br.com.impactaweb.pontoimp

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.os.Build

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        criarCanais()
    }

    /* Dois canais separados de propósito: o de alarme tem importância máxima e é o
       único que pode abrir a tela cheia. O de aviso é o toque discreto de sempre. */
    private fun criarCanais() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java)

        val alarme = NotificationChannel(CANAL_ALARME, "Alarmes do ponto", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Toca na hora de entrar, almoçar, voltar e sair"
            setBypassDnd(true)
            enableVibration(true)
            // sem som no canal: quem toca é a TelaAlarme, que consulta o modo do
            // aparelho antes. Se o canal também tocasse, o silencioso seria
            // ignorado — o canal de alarme atravessa o modo vibrar.
            setSound(null, null)
        }
        val aviso = NotificationChannel(CANAL_AVISO, "Avisos", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Lembretes que não precisam acordar você"
        }
        // canal do serviço em importância mínima: a notificação permanente é
        // exigência do Android, não algo que deva chamar atenção
        val servico = NotificationChannel(CANAL_SERVICO, "Sentinela", NotificationManager.IMPORTANCE_MIN).apply {
            description = "Aviso permanente de que o PontoImp está vigiando os horários"
            setShowBadge(false)
        }
        nm.createNotificationChannel(alarme)
        nm.createNotificationChannel(aviso)
        nm.createNotificationChannel(servico)
    }

    companion object {
        const val CANAL_ALARME = "pontoimp.alarme"
        const val CANAL_AVISO = "pontoimp.aviso"
        const val CANAL_SERVICO = "pontoimp.servico"
    }
}
