package br.com.impactaweb.pontoimp

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Marca os alarmes no AlarmManager.
 *
 * setAlarmClock é o ponto central: é a única modalidade que o Android trata como
 * despertador de verdade — dispara na hora exata, atravessa o Doze e a economia
 * agressiva da Samsung, e mostra o ícone de alarme na barra de status.
 */
object AgendadorAlarmes {
    private const val TAG = "PontoImp"

    fun armar(ctx: Context, eventos: List<Evento>) {
        val am = ctx.getSystemService(AlarmManager::class.java)
        cancelarTodos(ctx, Agenda.ler(ctx))

        val agora = System.currentTimeMillis()
        val futuros = eventos.filter { it.ts > agora }
        Agenda.salvar(ctx, futuros)

        if (!podeExatos(am)) {
            // sem a permissão, um alarme inexato chegaria atrasado e sem avisar
            Log.w(TAG, "sem permissão de alarme exato — nada foi agendado")
            return
        }

        futuros.forEach { ev ->
            val disparo = PendingIntent.getBroadcast(
                ctx, ev.id,
                Intent(ctx, ReceptorAlarme::class.java).apply {
                    putExtra("chave", ev.chave)
                    putExtra("titulo", ev.titulo)
                    putExtra("corpo", ev.corpo)
                    putExtra("alarme", ev.alarme)
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            // showIntent: o que abre quando o usuário toca no ícone de alarme do sistema
            val mostrar = PendingIntent.getActivity(
                ctx, ev.id, Intent(ctx, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            runCatching {
                am.setAlarmClock(AlarmManager.AlarmClockInfo(ev.ts, mostrar), disparo)
            }.onFailure { Log.e(TAG, "falhou ao agendar ${ev.chave}", it) }
        }
        Log.i(TAG, "armados ${futuros.size} alarmes")
    }

    fun rearmarDoDisco(ctx: Context) = armar(ctx, Agenda.ler(ctx))

    private fun cancelarTodos(ctx: Context, antigos: List<Evento>) {
        val am = ctx.getSystemService(AlarmManager::class.java)
        antigos.forEach { ev ->
            PendingIntent.getBroadcast(
                ctx, ev.id, Intent(ctx, ReceptorAlarme::class.java),
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
            )?.let { am.cancel(it); it.cancel() }
        }
    }

    fun podeExatos(am: AlarmManager): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
}
