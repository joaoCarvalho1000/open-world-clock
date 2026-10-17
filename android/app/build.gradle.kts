import java.security.KeyFactory
import java.security.spec.X509EncodedKeySpec
import java.util.Base64

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Public Play licensing key only. Never put service-account or signing secrets in the APK.
val playBillingPublicKey = providers.gradleProperty("WORLD_CLOCK_PLAY_PUBLIC_KEY")
    .orElse(providers.environmentVariable("WORLD_CLOCK_PLAY_PUBLIC_KEY"))
    .orElse("")
    .map { it.filterNot(Char::isWhitespace) }

fun releaseSetting(name: String) = providers.gradleProperty(name)
    .orElse(providers.environmentVariable(name)).orElse("")

val uploadKeystore = releaseSetting("WORLD_CLOCK_UPLOAD_KEYSTORE")
val uploadAlias = releaseSetting("WORLD_CLOCK_UPLOAD_KEY_ALIAS")
val uploadStorePassword = releaseSetting("WORLD_CLOCK_UPLOAD_STORE_PASSWORD")
val uploadKeyPassword = releaseSetting("WORLD_CLOCK_UPLOAD_KEY_PASSWORD")
val uploadSigningConfigured = listOf(uploadKeystore, uploadAlias, uploadStorePassword)
    .all { it.get().isNotBlank() }

tasks.register("verifyInternalTestingConfiguration") {
    group = "verification"
    description = "Checks public billing configuration and local upload signing before a Play test build."
    dependsOn("verifyPlayBillingConfiguration")
    doLast {
        check(uploadSigningConfigured && file(uploadKeystore.get()).isFile) {
            "Upload signing is not configured. Set WORLD_CLOCK_UPLOAD_KEYSTORE, WORLD_CLOCK_UPLOAD_KEY_ALIAS and WORLD_CLOCK_UPLOAD_STORE_PASSWORD outside the repository."
        }
        logger.lifecycle("Internal-test build inputs are present. Verify the signed bundle and Console release before rollout.")
    }
}

tasks.register("verifyPlayBillingConfiguration") {
    group = "verification"
    description = "Checks the public Play billing key before preparing an internal-track build."
    doLast {
        val encoded = playBillingPublicKey.get()
        check(encoded.isNotEmpty()) {
            "Google Play is not configured. Set WORLD_CLOCK_PLAY_PUBLIC_KEY to the app's public licensing key from Play Console. See BILLING.md."
        }
        val key = runCatching {
            KeyFactory.getInstance("RSA").generatePublic(
                X509EncodedKeySpec(Base64.getDecoder().decode(encoded))
            )
        }.getOrNull()
        check(key != null) { "WORLD_CLOCK_PLAY_PUBLIC_KEY must contain a Base64 RSA public licensing key, not a private key or JSON credential." }
        logger.lifecycle("Play public key is valid. Product availability, signing and purchases still require Play Console/internal-track validation.")
    }
}

android {
    namespace = "io.joao.worldclock"
    compileSdk = 36
    defaultConfig {
        applicationId = "io.joao.worldclock"
        minSdk = 26
        targetSdk = 36
        versionCode = providers.gradleProperty("WORLD_CLOCK_VERSION_CODE").orElse("1").get().toInt()
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // Public verification key from Play Console. Empty builds cannot start a purchase.
        val billingKey = playBillingPublicKey.get()
            .replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "").replace("\r", "")
        buildConfigField("String", "PLAY_BILLING_PUBLIC_KEY", "\"$billingKey\"")
    }
    signingConfigs {
        if (uploadSigningConfigured) create("playUpload") {
            storeFile = file(uploadKeystore.get())
            storePassword = uploadStorePassword.get()
            keyAlias = uploadAlias.get()
            keyPassword = uploadKeyPassword.get().ifBlank { uploadStorePassword.get() }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (uploadSigningConfigured) signingConfig = signingConfigs.getByName("playUpload")
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true; buildConfig = true }
    // The language picker must work offline, including languages other than the device default.
    bundle { language { enableSplit = false } }
    sourceSets["main"].assets.srcDir("../../shared")
    sourceSets["test"].resources.srcDir("../../shared")
    testOptions { unitTests.isIncludeAndroidResources = true }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}
dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.08.01"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("com.google.android.play:review:2.0.2")
    implementation("com.android.billingclient:billing:9.1.0")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250517")
    androidTestImplementation(platform("androidx.compose:compose-bom:2025.08.01"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}
