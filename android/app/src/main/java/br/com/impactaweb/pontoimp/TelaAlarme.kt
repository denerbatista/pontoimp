package br.com.impactaweb.pontoimp

import android.app.KeyguardManager
import android.app.NotificationManager
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import br.com.impactaweb.pontoimp.databinding.TelaAlarmeBinding

/** A tela que aparece por cima de tudo, tocando, até você desligar. */
class TelaAlarme : AppCompatActivity() {
    private lateinit var b: TelaAlarmeBinding
    private var player: MediaPlayer? = null
    private var vibrador: Vibrator? = null

    override fun onCreate(estado: Bundle?) {
        super.onCreate(estado)
        mostrarSobreBloqueio()

        b = TelaAlarmeBinding.inflate(layoutInflater)
        setContentView(b.root)

        b.titulo.text = intent.getStringExtra("titulo") ?: "PontoImp"
        b.corpo.text = intent.getStringExtra("corpo") ?: ""
        b.parar.setOnClickListener { desligar() }

        tocar()
        vibrar()
        // rede de segurança: ninguém quer o alarme tocando sozinho por horas
        b.root.postDelayed({ desligar() }, 2 * 60 * 1000)
    }

    private fun mostrarSobreBloqueio() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            getSystemService(KeyguardManager::class.java)?.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    /* USAGE_ALARM é o que faz tocar mesmo com o celular no silencioso —
       é o mesmo canal de áudio que o despertador do sistema usa. */
    private fun tocar() {
        val som = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            ?: return
        runCatching {
            player = MediaPlayer().apply {
                setDataSource(this@TelaAlarme, som)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                isLooping = true
                prepare()
                start()
            }
        }
    }

    private fun vibrar() {
        vibrador = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            getSystemService(VibratorManager::class.java)?.defaultVibrator
        else @Suppress("DEPRECATION") getSystemService(Vibrator::class.java)
        val padrao = longArrayOf(0, 420, 140, 420, 140, 420, 900)
        runCatching {
            vibrador?.vibrate(VibrationEffect.createWaveform(padrao, 0))
        }
    }

    private fun desligar() {
        runCatching { player?.stop(); player?.release() }
        player = null
        runCatching { vibrador?.cancel() }
        getSystemService(NotificationManager::class.java)?.cancelAll()
        finish()
    }

    override fun onDestroy() { desligar(); super.onDestroy() }

    /** Voltar não pode dispensar um alarme que está tocando. */
    override fun onBackPressed() { /* ignorado de propósito: use PARAR */ }
}
