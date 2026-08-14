package br.com.impactaweb.pontoimp

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Chega aqui na hora marcada, mesmo com o app fechado.
 *
 * Não abrimos a Activity direto: desde o Android 10 iniciar atividade em segundo
 * plano é bloqueado. O caminho legítimo é uma notificação com fullScreenIntent —
 * o sistema abre a tela sozinho quando o aparelho está bloqueado, e mostra um
 * aviso alto quando está em uso.
 */
class ReceptorAlarme : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val titulo = intent.getStringExtra("titulo") ?: "PontoImp"
        val corpo = intent.getStringExtra("corpo") ?: ""
        val chave = intent.getStringExtra("chave") ?: titulo
        val ehAlarme = intent.getBooleanExtra("alarme", false)

        val nm = ctx.getSystemService(NotificationManager::class.java)

        if (!ehAlarme) {
            nm.notify(chave.hashCode(), Notification.Builder(ctx, App.CANAL_AVISO)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(titulo)
                .setContentText(corpo)
                .setAutoCancel(true)
                .setContentIntent(abrirApp(ctx, chave.hashCode()))
                .build())
            return
        }

        val telaCheia = PendingIntent.getActivity(
            ctx, chave.hashCode(),
            Intent(ctx, TelaAlarme::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra("titulo", titulo)
                putExtra("corpo", corpo)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        nm.notify(chave.hashCode(), Notification.Builder(ctx, App.CANAL_ALARME)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(titulo)
            .setContentText(corpo)
            .setCategory(Notification.CATEGORY_ALARM)
            .setPriority(Notification.PRIORITY_MAX)
            .setOngoing(true)
            .setFullScreenIntent(telaCheia, true)
            .build())
    }

    private fun abrirApp(ctx: Context, id: Int) = PendingIntent.getActivity(
        ctx, id, Intent(ctx, MainActivity::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
}
