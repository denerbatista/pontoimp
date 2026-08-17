plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "br.com.impactaweb.pontoimp"
    compileSdk = 35

    defaultConfig {
        applicationId = "br.com.impactaweb.pontoimp"
        minSdk = 26          // setAlarmClock + canais de notificação
        targetSdk = 35
        // casa com a tag apk-N da release: é assim que o app sabe se está velho.
        // Fora do CI vira 1, o que só afeta build local.
        versionCode = (System.getenv("RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0." + (System.getenv("RUN_NUMBER") ?: "0")
    }

    // Chave própria e estável. Sem ela, o runner do CI gera um debug.keystore
    // novo a cada build: a assinatura muda, e o Android recusa a atualização
    // por conflito de assinatura — nenhuma atualização instalaria.
    val chave = file("pontoimp.jks")
    val temChave = chave.exists()

    signingConfigs {
        // O AGP desliga a assinatura v1 quando minSdk >= 24. O Android 12 aceita
        // só v2, mas instaladores de fabricante às vezes recusam — religar a v1
        // não custa nada e elimina essa variável na instalação por APK direto.
        getByName("debug") {
            enableV1Signing = true
            enableV2Signing = true
            enableV3Signing = true
        }
        if (temChave) create("estavel") {
            storeFile = chave
            storePassword = System.getenv("KEYSTORE_SENHA") ?: "pontoimp2026"
            keyAlias = System.getenv("KEYSTORE_ALIAS") ?: "pontoimp"
            keyPassword = System.getenv("KEYSTORE_SENHA") ?: "pontoimp2026"
            enableV1Signing = true
            enableV2Signing = true
            enableV3Signing = true
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName(if (temChave) "estavel" else "debug")
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName(if (temChave) "estavel" else "debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { viewBinding = true }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
}
