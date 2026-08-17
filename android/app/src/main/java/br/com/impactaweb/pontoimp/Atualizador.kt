package br.com.impactaweb.pontoimp

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Environment
import android.util.Log
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Atualização por fora da Play Store: consulta a última release do GitHub,
 * compara com o versionCode instalado e baixa o APK quando há versão nova.
 *
 * A instalação em si é sempre do usuário — o Android não deixa (e nem deveria
 * deixar) um app se substituir sozinho sem confirmação.
 */
object Atualizador {
    private const val TAG = "PontoImp"
    private const val API = "https://api.github.com/repos/denerbatista/pontoimp/releases/latest"

    data class Release(val versao: Int, val nome: String, val url: String)

    /** Faz rede: chame fora da thread principal. */
    fun consultar(): Release? = runCatching {
        val con = (URL(API).openConnection() as HttpURLConnection).apply {
            connectTimeout = 12000; readTimeout = 12000
            setRequestProperty("Accept", "application/vnd.github+json")
        }
        if (con.responseCode != 200) { Log.w(TAG, "release: HTTP ${con.responseCode}"); return null }
        val j = JSONObject(con.inputStream.bufferedReader().use { it.readText() })

        // a tag é apk-N, e N é o run_number do build, que cresce sempre
        val versao = Regex("""apk-(\d+)""").find(j.optString("tag_name"))
            ?.groupValues?.get(1)?.toIntOrNull() ?: return null

        val assets = j.optJSONArray("assets") ?: return null
        for (i in 0 until assets.length()) {
            val a = assets.getJSONObject(i)
            if (a.optString("name").endsWith(".apk"))
                return Release(versao, a.optString("name"), a.optString("browser_download_url"))
        }
        null
    }.getOrNull()

    fun versaoInstalada(ctx: Context): Int = runCatching {
        ctx.packageManager.getPackageInfo(ctx.packageName, 0).let {
            @Suppress("DEPRECATION") it.versionCode
        }
    }.getOrDefault(0)

    /** Baixa pro diretório privado do app e devolve o id do download. */
    fun baixar(ctx: Context, r: Release): Long {
        val destino = File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), r.nome)
        if (destino.exists()) destino.delete()
        val req = DownloadManager.Request(Uri.parse(r.url))
            .setTitle("PontoImp " + r.versao)
            .setDescription("Baixando a atualização")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationUri(Uri.fromFile(destino))
        return ctx.getSystemService(DownloadManager::class.java).enqueue(req)
    }

    /** Abre a tela de instalação do Android com o APK baixado. */
    fun instalar(ctx: Context, id: Long): Boolean {
        val dm = ctx.getSystemService(DownloadManager::class.java)
        val c: Cursor = dm.query(DownloadManager.Query().setFilterById(id)) ?: return false
        c.use {
            if (!it.moveToFirst()) return false
            val status = it.getInt(it.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
            if (status != DownloadManager.STATUS_SUCCESSFUL) return false
            val local = it.getString(it.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI)) ?: return false
            val arquivo = File(Uri.parse(local).path ?: return false)
            // content:// via FileProvider — file:// é recusado desde o Android 7
            val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.arquivos", arquivo)
            ctx.startActivity(Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            })
            return true
        }
    }
}
