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
        versionCode = 1
        versionName = "1.0"
    }

    signingConfigs {
        // O AGP desliga a assinatura v1 quando minSdk >= 24. O Android 12 aceita
        // só v2, mas instaladores de fabricante às vezes recusam — religar a v1
        // não custa nada e elimina essa variável na instalação por APK direto.
        getByName("debug") {
            enableV1Signing = true
            enableV2Signing = true
            enableV3Signing = true
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("debug")
        }
        release {
            isMinifyEnabled = false
            // assinatura de debug de propósito: a distribuição é por APK direto,
            // fora da Play Store. Trocar quando/se for publicar.
            signingConfig = signingConfigs.getByName("debug")
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
