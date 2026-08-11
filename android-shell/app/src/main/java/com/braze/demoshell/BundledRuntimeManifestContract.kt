package com.braze.demoshell

data class BundledRuntimeManifestFields(
    val schemaVersion: Int,
    val runtimeHashVersion: Int,
    val id: String,
    val configHash: String,
    val runtimeHash: String,
    val expectedSources: Map<String, String>,
)

object BundledRuntimeManifestContract {
    const val CANONICAL_ANDROID_SOURCE = "file:///android_asset/demo/index.html"

    fun errors(fields: BundledRuntimeManifestFields): List<String> = buildList {
        if (fields.schemaVersion != 2) add("schemaVersion must be 2")
        if (fields.runtimeHashVersion != 2) add("runtimeHashVersion must be 2")
        if (fields.id.isBlank()) add("id is missing")
        if (fields.configHash.isBlank()) add("configHash is missing")
        if (fields.runtimeHash.isBlank()) add("runtimeHash is missing")
        for (platform in listOf("browser", "android", "ios")) {
            if (fields.expectedSources[platform].isNullOrBlank()) add("expectedSources.$platform is missing")
        }
        val androidSource = fields.expectedSources["android"].orEmpty()
        if (androidSource.isNotBlank() && androidSource != CANONICAL_ANDROID_SOURCE) {
            add("expectedSources.android must be $CANONICAL_ANDROID_SOURCE")
        }
    }
}
