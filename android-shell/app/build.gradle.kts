import java.util.Properties
import org.gradle.api.tasks.PathSensitivity
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) {
        file.inputStream().use(::load)
    }
}

fun localValue(name: String): String = localProperties.getProperty(name).orEmpty()

fun buildConfigString(value: String): String =
    "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

val defaultDemoWebDist = rootProject.layout.projectDirectory.dir("../web-template/dist").asFile
val demoWebDist = file(localValue("demo.webDist").ifBlank { defaultDemoWebDist.absolutePath })
val generatedDemoAssets = layout.buildDirectory.dir("generated/assets/demoWeb")

android {
    namespace = "com.braze.demoshell"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "com.braze.demoshell"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        val brazeApiKey = localValue("braze.apiKey")
        val brazeEndpoint = localValue("braze.endpoint")
        val brazeSessionTimeoutSeconds = localValue("braze.sessionTimeoutSeconds")
            .toIntOrNull()
            ?.takeIf { it >= 1 }
            ?: 60
        val firebaseSenderId = localValue("firebase.senderId")
        val demoExternalId = localValue("demo.externalId").ifBlank { "lumo-demo-user" }
        val demoProfileName = localValue("demo.profileName").ifBlank { "Seed (local.properties)" }
        val demoPackId = localValue("demo.packId").ifBlank { "lumo-default" }
        val demoPackName = localValue("demo.packName").ifBlank { "Lumo" }
        val demoConfigHash = localValue("demo.configHash")
        val demoGeneratedAt = localValue("demo.generatedAt")
        val demoSourceMode = localValue("demo.sourceMode").ifBlank { "bundled-asset" }
        val demoBrowserUrl = localValue("demo.browserUrl").ifBlank { "http://localhost:5173" }
        val demoAndroidUrl = localValue("demo.androidUrl").ifBlank { "file:///android_asset/demo/index.html" }
        val demoIosUrl = localValue("demo.iosUrl").ifBlank { "http://localhost:5173" }
        val launcherCallbackUrl = localValue("launcher.callbackUrl")

        buildConfigField("String", "BRAZE_API_KEY", buildConfigString(brazeApiKey))
        buildConfigField("String", "BRAZE_ENDPOINT", buildConfigString(brazeEndpoint))
        buildConfigField("int", "BRAZE_SESSION_TIMEOUT_SECONDS", brazeSessionTimeoutSeconds.toString())
        buildConfigField("String", "FIREBASE_SENDER_ID", buildConfigString(firebaseSenderId))
        buildConfigField("String", "DEMO_EXTERNAL_ID", buildConfigString(demoExternalId))
        buildConfigField("String", "DEMO_PROFILE_NAME", buildConfigString(demoProfileName))
        buildConfigField("String", "DEMO_PACK_ID", buildConfigString(demoPackId))
        buildConfigField("String", "DEMO_PACK_NAME", buildConfigString(demoPackName))
        buildConfigField("String", "DEMO_CONFIG_HASH", buildConfigString(demoConfigHash))
        buildConfigField("String", "DEMO_GENERATED_AT", buildConfigString(demoGeneratedAt))
        buildConfigField("String", "DEMO_SOURCE_MODE", buildConfigString(demoSourceMode))
        buildConfigField("String", "DEMO_BROWSER_URL", buildConfigString(demoBrowserUrl))
        buildConfigField("String", "DEMO_ANDROID_URL", buildConfigString(demoAndroidUrl))
        buildConfigField("String", "DEMO_IOS_URL", buildConfigString(demoIosUrl))
        buildConfigField("String", "LAUNCHER_CALLBACK_URL", buildConfigString(launcherCallbackUrl))

        resValue("string", "com_braze_api_key", brazeApiKey)
        resValue("string", "com_braze_custom_endpoint", brazeEndpoint)
        resValue("bool", "com_braze_firebase_cloud_messaging_registration_enabled", "true")
        resValue("string", "com_braze_firebase_cloud_messaging_sender_id", firebaseSenderId)
        resValue("bool", "com_braze_firebase_messaging_service_on_new_token_registration_enabled", "true")
        resValue("bool", "com_braze_handle_push_deep_links_automatically", "true")
        resValue("integer", "com_braze_trigger_action_minimum_time_interval_seconds", "1")
    }

    buildFeatures {
        buildConfig = true
    }

    sourceSets {
        getByName("main") {
            assets.srcDir(generatedDemoAssets.get().asFile)
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
    }
}

val copyDemoWebAssets by tasks.registering(Copy::class) {
    inputs.property("demoWebDistPath", demoWebDist.absolutePath)
    inputs.property("demoPackId", localValue("demo.packId"))
    inputs.property("demoConfigHash", localValue("demo.configHash"))
    inputs.property("assetRewriteVersion", "2")
    inputs.dir(demoWebDist).withPathSensitivity(PathSensitivity.RELATIVE)
    outputs.dir(generatedDemoAssets)
    from(demoWebDist)
    into(generatedDemoAssets.map { it.dir("demo") })
    doFirst {
        delete(generatedDemoAssets.get().asFile)
        if (!demoWebDist.resolve("index.html").exists()) {
            throw GradleException(
                "Missing ${demoWebDist.resolve("index.html")}. Apply a demo pack or build the configured web app before building Android.",
            )
        }
    }
    doLast {
        val demoDir = generatedDemoAssets.get().asFile.resolve("demo")
        demoDir.walkTopDown()
            .filter { it.isFile && it.extension in setOf("html", "js", "css") }
            .forEach { file ->
                val original = file.readText()
                val rewritten = original
                    .replace("href=\"/assets/", "href=\"assets/")
                    .replace("src=\"/assets/", "src=\"assets/")
                    .replace("url(/assets/", "url(assets/")
                    .replace("\"/assets/", "\"assets/")
                    .replace("'/assets/", "'assets/")
                    .replace("`/assets/", "`assets/")
                    .replace("href=\"/demo-assets/", "href=\"demo-assets/")
                    .replace("src=\"/demo-assets/", "src=\"demo-assets/")
                    .replace("url(/demo-assets/", "url(demo-assets/")
                    .replace("\"/demo-assets/", "\"demo-assets/")
                    .replace("'/demo-assets/", "'demo-assets/")
                    .replace("`/demo-assets/", "`demo-assets/")
                if (rewritten != original) file.writeText(rewritten)
            }

        val runtimeManifest = """
            {
              "schemaVersion": 1,
              "id": "${localValue("demo.packId")}",
              "name": "${localValue("demo.packName")}",
              "configHash": "${localValue("demo.configHash")}",
              "generatedAt": "${localValue("demo.generatedAt")}",
              "sourceMode": "${localValue("demo.sourceMode")}",
              "expectedSources": {
                "android": "${localValue("demo.androidUrl")}",
                "browser": "${localValue("demo.browserUrl")}",
                "ios": "${localValue("demo.iosUrl")}"
              }
            }
        """.trimIndent()
        demoDir.resolve("demo-runtime.json").writeText("$runtimeManifest\n")
    }
}

val validateDemoWebAssets by tasks.registering {
    dependsOn(copyDemoWebAssets)
    inputs.property("demoPackId", localValue("demo.packId"))
    inputs.property("demoConfigHash", localValue("demo.configHash"))
    inputs.file(generatedDemoAssets.map { it.dir("demo").file("demo-runtime.json") })
    doLast {
        val runtimeFile = generatedDemoAssets.get().asFile.resolve("demo/demo-runtime.json")
        if (!runtimeFile.exists()) {
            throw GradleException("Missing generated demo runtime: ${runtimeFile.absolutePath}")
        }
        val text = runtimeFile.readText()
        val expectedPack = localValue("demo.packId")
        val expectedHash = localValue("demo.configHash")
        if (expectedPack.isNotBlank() && !text.contains("\"id\": \"$expectedPack\"")) {
            throw GradleException("Generated demo runtime does not match selected pack $expectedPack.")
        }
        if (expectedHash.isNotBlank() && !text.contains("\"configHash\": \"$expectedHash\"")) {
            throw GradleException("Generated demo runtime does not match selected hash $expectedHash.")
        }
    }
}

tasks.named("preBuild") {
    dependsOn(validateDemoWebAssets)
}

tasks.matching { it.name.matches(Regex("merge.*Assets")) }.configureEach {
    dependsOn(validateDemoWebAssets)
    inputs.property("demoPackId", localValue("demo.packId"))
    inputs.property("demoConfigHash", localValue("demo.configHash"))
    inputs.dir(generatedDemoAssets).withPathSensitivity(PathSensitivity.RELATIVE)
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("com.braze:android-sdk-ui:42.3.1")
    // The Pixel_10_Pro Android 37 Play Store image currently ships GMSCore 26.11.x.
    // firebase-messaging 25.1.0 requires a newer Play Services floor, so keep this
    // pinned until the emulator image catches up.
    implementation("com.google.firebase:firebase-messaging:25.0.1")
}

if (file("google-services.json").exists()) {
    pluginManager.apply("com.google.gms.google-services")
} else {
    logger.warn(
        "android-shell/app/google-services.json is missing. The app can compile, but FCM token generation " +
            "requires adding your Firebase config file before running a real push test."
    )
}
