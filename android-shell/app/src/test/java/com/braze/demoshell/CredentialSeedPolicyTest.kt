package com.braze.demoshell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CredentialSeedPolicyTest {
    private val saved = CredentialProfile(
        id = "saved-workspace",
        name = "Saved workspace",
        apiKey = "saved-key",
        endpoint = "sdk.saved.invalid",
        externalId = "saved-user",
    )

    @Test
    fun `changed incomplete generated context clears active selection but preserves profiles`() {
        val seed = generatedSeed(packId = "new-pack", configHash = "new-config", apiKey = "", endpoint = "")
        val outcome = CredentialSeedPolicy.reconcile(
            profiles = listOf(saved),
            activeProfileId = saved.id,
            previousFingerprint = "old-fingerprint",
            seed = seed,
        )

        assertTrue(outcome.contextChanged)
        assertNull(outcome.activeProfileId)
        assertEquals(listOf(saved), outcome.profiles)
        assertFalse(outcome.fingerprint.contains(saved.apiKey))
    }

    @Test
    fun `changed complete generated context reconciles and selects deterministic profile`() {
        val seed = generatedSeed(packId = "new-pack", configHash = "new-config")
        val outcome = CredentialSeedPolicy.reconcile(
            profiles = listOf(saved),
            activeProfileId = saved.id,
            previousFingerprint = "old-fingerprint",
            seed = seed,
        )

        assertTrue(outcome.contextChanged)
        assertEquals("generated:new-pack", outcome.activeProfileId)
        assertEquals(2, outcome.profiles.size)
        assertEquals("selected-key", outcome.profiles.last().apiKey)
    }

    @Test
    fun `unchanged context preserves an explicit saved profile`() {
        val seed = generatedSeed()
        val outcome = CredentialSeedPolicy.reconcile(
            profiles = listOf(saved),
            activeProfileId = saved.id,
            previousFingerprint = seed.fingerprint(),
            seed = seed,
        )

        assertFalse(outcome.contextChanged)
        assertEquals(saved.id, outcome.activeProfileId)
    }

    @Test
    fun `SDK credential context proof is stable safe and changes with workspace`() {
        val seed = generatedSeed()
        val profile = requireNotNull(seed.profile())
        val fingerprint = seed.sdkCredentialContextFingerprint(profile)

        assertEquals(fingerprint, seed.sdkCredentialContextFingerprint(profile.copy(name = "Renamed")))
        assertNotEquals(fingerprint, seed.sdkCredentialContextFingerprint(profile.copy(endpoint = "sdk.other.invalid")))
        assertFalse(fingerprint.contains(profile.apiKey))
        assertEquals(64, fingerprint.length)
        assertEquals("f10a7c3c79e2d2cd305a22fcc1afaae47be96e11ef7eb24ef9fc37484dbf8850", fingerprint)
        assertEquals("", seed.sdkCredentialContextFingerprint(null))
    }

    private fun generatedSeed(
        packId: String = "selected-pack",
        configHash: String = "selected-config",
        apiKey: String = "selected-key",
        endpoint: String = "sdk.selected.invalid",
    ) = GeneratedCredentialSeed(
        packId = packId,
        packName = "Selected Pack",
        profileName = "Selected Profile",
        configHash = configHash,
        apiKey = apiKey,
        endpoint = endpoint,
        externalId = "selected-user",
    )
}
