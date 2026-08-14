package br.com.impactaweb.pontoimp

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Um evento do dia, como o motor da interface já entrega. */
data class Evento(
    val ts: Long,          // epoch ms — hora absoluta, sem conversão de fuso
    val chave: String,
    val titulo: String,
    val corpo: String,
    val alarme: Boolean,   // true = toca e abre a tela; false = só notifica
) {
    /** id estável para o PendingIntent: a mesma chave sempre substitui o alarme antigo */
    val id: Int get() = chave.hashCode()

    fun paraJson(): JSONObject = JSONObject().apply {
        put("ts", ts); put("chave", chave); put("titulo", titulo)
        put("corpo", corpo); put("alarme", alarme)
    }

    companion object {
        fun deJson(o: JSONObject) = Evento(
            ts = o.optLong("ts"),
            chave = o.optString("chave", o.optLong("ts").toString()),
            titulo = o.optString("titulo", "PontoImp"),
            corpo = o.optString("corpo", ""),
            // a interface manda nivel:"alarme"|"aviso"; aceitamos os dois formatos
            alarme = o.optBoolean("alarme", o.optString("nivel") == "alarme"),
        )
    }
}

/** Guarda a última agenda recebida, para re-armar depois de um boot. */
object Agenda {
    private const val PREFS = "pontoimp.agenda"
    private const val CHAVE = "eventos"

    fun salvar(ctx: Context, eventos: List<Evento>) {
        val arr = JSONArray()
        eventos.forEach { arr.put(it.paraJson()) }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(CHAVE, arr.toString()).apply()
    }

    fun ler(ctx: Context): List<Evento> {
        val txt = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(CHAVE, null)
            ?: return emptyList()
        return runCatching {
            val arr = JSONArray(txt)
            (0 until arr.length()).map { Evento.deJson(arr.getJSONObject(it)) }
        }.getOrDefault(emptyList())
    }

    /** Interpreta o JSON que a interface manda pela ponte. */
    fun deTexto(json: String): List<Evento> = runCatching {
        val arr = JSONArray(json)
        (0 until arr.length()).map { Evento.deJson(arr.getJSONObject(it)) }
    }.getOrDefault(emptyList())
}
