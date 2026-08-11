package com.braze.demoshell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BundledRuntimeManifestContractTest {
    @Test
    fun `accepts complete v2 manifest with canonical Android source`() {
        assertTrue(BundledRuntimeManifestContract.errors(validFields()).isEmpty())
    }

    @Test
    fun `rejects every missing expected source`() {
        for (platform in listOf("browser", "android", "ios")) {
            val fields = validFields().copy(
                expectedSources = validFields().expectedSources + (platform to ""),
            )
            assertTrue(
                BundledRuntimeManifestContract.errors(fields).contains("expectedSources.$platform is missing"),
            )
        }
    }

    @Test
    fun `rejects noncanonical Android bundled URL`() {
        val errors = BundledRuntimeManifestContract.errors(
            validFields().copy(
                expectedSources = validFields().expectedSources +
                    ("android" to "file:///android_asset/other/index.html"),
            ),
        )
        assertEquals(
            listOf("expectedSources.android must be file:///android_asset/demo/index.html"),
            errors,
        )
    }

    @Test
    fun `rejects malformed identity and version fields together`() {
        val errors = BundledRuntimeManifestContract.errors(
            validFields().copy(
                schemaVersion = 1,
                runtimeHashVersion = 1,
                id = "",
                configHash = "",
                runtimeHash = "",
            ),
        )
        assertTrue(errors.containsAll(listOf(
            "schemaVersion must be 2",
            "runtimeHashVersion must be 2",
            "id is missing",
            "configHash is missing",
            "runtimeHash is missing",
        )))
    }

    private fun validFields() = BundledRuntimeManifestFields(
        schemaVersion = 2,
        runtimeHashVersion = 2,
        id = "demo-pack",
        configHash = "config-hash",
        runtimeHash = "runtime-hash",
        expectedSources = mapOf(
            "browser" to "http://localhost:5173",
            "android" to BundledRuntimeManifestContract.CANONICAL_ANDROID_SOURCE,
            "ios" to "http://localhost:5173",
        ),
    )
}
