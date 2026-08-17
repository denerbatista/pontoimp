package br.com.impactaweb.pontoimp

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Reiniciar o aparelho apaga todos os alarmes do AlarmManager; re-armamos aqui. */
class ReceptorBoot : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> {
                AgendadorAlarmes.rearmarDoDisco(ctx)
                if (ServicoSentinela.ligado(ctx)) ServicoSentinela.ligar(ctx)
            }
        }
    }
}
