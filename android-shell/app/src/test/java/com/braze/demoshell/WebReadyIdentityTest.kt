package com.braze.demoshell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WebReadyIdentityTest {
    @Test
    fun `matching deployment identity is accepted`() {
        assertNull(webReadyIdentityRejection(EXPECTED, EXPECTED))
    }

    @Test
    fun `missing sync identity is rejected`() {
        assertTrue(webReadyIdentityRejection(null, EXPECTED).orEmpty().contains("missing"))
    }

    @Test
    fun `every deployment identity field is required and exact`() {
        val variants = listOf(
            EXPECTED.copy(protocol = ""),
            EXPECTED.copy(runtimeId = ""),
            EXPECTED.copy(configHash = ""),
            EXPECTED.copy(runtimeHash = ""),
            EXPECTED.copy(protocol = "braze-demo-sync/v0"),
            EXPECTED.copy(runtimeId = "other-pack"),
            EXPECTED.copy(configHash = "other-config"),
            EXPECTED.copy(runtimeHash = "other-runtime"),
        )

        variants.forEach { reported ->
            val error = webReadyIdentityRejection(reported, EXPECTED)
            assertTrue("Expected rejection for $reported", !error.isNullOrBlank())
        }
    }

    @Test
    fun `missing native identity fails closed`() {
        val error = webReadyIdentityRejection(EXPECTED, EXPECTED.copy(runtimeHash = ""))
        assertEquals("Native runtime identity is unavailable: runtimeHash.", error)
    }

    private companion object {
        val EXPECTED = WebReadyIdentity(
            protocol = "braze-demo-sync/v1",
            runtimeId = "lumo-default",
            configHash = "config-hash",
            runtimeHash = "runtime-hash",
        )
    }
}
