import groovy.json.JsonSlurper
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
val activeDemoPackId = localValue("demo.packId").ifBlank { "lumo-default" }
val activeDemoAssetSource = demoWebDist.resolve("demo-assets").resolve(activeDemoPackId)
val portableJunkPatterns = listOf(
    ".DS_Store",
    "**/.DS_Store",
    "Thumbs.db",
    "**/Thumbs.db",
    "__MACOSX/**",
    "**/__MACOSX/**",
)

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
        val demoRuntimeHash = localValue("demo.runtimeHash").ifBlank { demoConfigHash }
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
        buildConfigField("String", "DEMO_RUNTIME_HASH", buildConfigString(demoRuntimeHash))
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

val copyDemoWebAssets by tasks.registering(Sync::class) {
    inputs.property("demoWebDistPath", demoWebDist.absolutePath)
    inputs.property("demoPackId", activeDemoPackId)
    inputs.property("demoConfigHash", localValue("demo.configHash"))
    inputs.property("demoRuntimeHash", localValue("demo.runtimeHash"))
    inputs.property("assetRewriteVersion", "4")
    outputs.dir(generatedDemoAssets)
    from(demoWebDist) {
        into("demo")
        exclude("demo-assets/**")
        exclude(portableJunkPatterns)
    }
    from(activeDemoAssetSource) {
        into("demo/demo-assets/$activeDemoPackId")
        exclude(portableJunkPatterns)
    }
    into(generatedDemoAssets)
    doFirst {
        if (!demoWebDist.resolve("index.html").exists()) {
            throw GradleException(
                "Missing ${demoWebDist.resolve("index.html")}. Apply a demo pack or build the configured web app before building Android.",
            )
        }
        if (!demoWebDist.resolve("demo-runtime.json").exists()) {
            throw GradleException(
                "Missing ${demoWebDist.resolve("demo-runtime.json")}. Apply the active pack and rebuild its web assets before building Android.",
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

        // The public web runtime manifest is the canonical packaged metadata.
        // Do not synthesize a second copy from BuildConfig/local.properties:
        // the Android runtime reads this exact bundled asset at startup.
        val runtimeManifest = demoDir.resolve("demo-runtime.json")
        if (!runtimeManifest.exists()) {
            throw GradleException(
                "Missing ${demoWebDist.resolve("demo-runtime.json")}. Apply the active pack and rebuild its web assets before building Android.",
            )
        }

    }
}

val validateDemoWebAssets by tasks.registering {
    dependsOn(copyDemoWebAssets)
    inputs.property("demoPackId", localValue("demo.packId"))
    inputs.property("demoConfigHash", localValue("demo.configHash"))
    inputs.property("demoRuntimeHash", localValue("demo.runtimeHash"))
    inputs.file(generatedDemoAssets.map { it.dir("demo").file("demo-runtime.json") })
    doLast {
        val runtimeFile = generatedDemoAssets.get().asFile.resolve("demo/demo-runtime.json")
        if (!runtimeFile.exists()) {
            throw GradleException("Missing generated demo runtime: ${runtimeFile.absolutePath}")
        }
        val runtime = runCatching { JsonSlurper().parse(runtimeFile) as? Map<*, *> }
            .getOrElse { error -> throw GradleException("Generated demo runtime is not valid JSON: ${error.message}", error) }
            ?: throw GradleException("Generated demo runtime must be a JSON object: ${runtimeFile.absolutePath}")
        fun runtimeString(key: String): String = runtime[key]?.toString().orEmpty()
        fun runtimeInt(key: String): Int = (runtime[key] as? Number)?.toInt() ?: -1
        val expectedSources = runtime["expectedSources"] as? Map<*, *>
        fun expectedSource(platform: String): String = expectedSources?.get(platform)?.toString().orEmpty()
        val contractErrors = buildList {
            if (runtimeInt("schemaVersion") != 2) add("schemaVersion must be 2")
            if (runtimeInt("runtimeHashVersion") != 2) add("runtimeHashVersion must be 2")
            for (key in listOf("id", "configHash", "runtimeHash")) {
                if (runtimeString(key).isBlank()) add("$key is missing")
            }
            for (platform in listOf("browser", "android", "ios")) {
                if (expectedSource(platform).isBlank()) add("expectedSources.$platform is missing")
            }
            if (
                expectedSource("android").isNotBlank() &&
                expectedSource("android") != "file:///android_asset/demo/index.html"
            ) {
                add("expectedSources.android must be file:///android_asset/demo/index.html")
            }
        }
        if (contractErrors.isNotEmpty()) {
            throw GradleException("Generated demo runtime is invalid: ${contractErrors.joinToString("; ")}.")
        }
        val expectedPack = localValue("demo.packId")
        val expectedHash = localValue("demo.configHash")
        val expectedRuntimeHash = localValue("demo.runtimeHash")
        if (expectedPack.isNotBlank() && runtimeString("id") != expectedPack) {
            throw GradleException("Generated demo runtime does not match selected pack $expectedPack.")
        }
        if (expectedHash.isNotBlank() && runtimeString("configHash") != expectedHash) {
            throw GradleException("Generated demo runtime does not match selected hash $expectedHash.")
        }
        if (expectedRuntimeHash.isNotBlank() && runtimeString("runtimeHash") != expectedRuntimeHash) {
            throw GradleException("Generated demo runtime does not match selected runtime hash $expectedRuntimeHash.")
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
    inputs.property("demoRuntimeHash", localValue("demo.runtimeHash"))
    inputs.dir(generatedDemoAssets).withPathSensitivity(PathSensitivity.RELATIVE)
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("com.braze:android-sdk-ui:42.3.1")
    // The Pixel_10_Pro Android 37 Play Store image currently ships GMSCore 26.11.x.
    // firebase-messaging 25.1.0 requires a newer Play Services floor, so keep this
    // pinned until the emulator image catches up.
    implementation("com.google.firebase:firebase-messaging:25.0.1")
    testImplementation("junit:junit:4.13.2")
}

if (file("google-services.json").exists()) {
    pluginManager.apply("com.google.gms.google-services")
} else {
    logger.warn(
        "android-shell/app/google-services.json is missing. The app can compile, but FCM token generation " +
            "requires adding your Firebase config file before running a real push test."
    )
}
