package com.braze.demoshell

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID

data class CredentialProfile(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val apiKey: String,
    val endpoint: String,
    val externalId: String,
    val firstName: String = "",
    val lastName: String = "",
    val initials: String = "",
    val homeLocation: String = "",
    val homeAddress: String = "",
    val loyaltyTier: String = "",
    val loyaltyPoints: Int? = null,
    val favoriteCategories: List<String> = emptyList(),
    val webURL: String = "",
) {
    fun toJson(active: Boolean = false): JSONObject {
        val json = JSONObject()
            .put("id", id)
            .put("name", name)
            .put("apiKey", apiKey)
            .put("endpoint", endpoint)
            .put("externalId", externalId)
            .put("firstName", firstName)
            .put("lastName", lastName)
            .put("initials", initials)
            .put("homeLocation", homeLocation)
            .put("homeAddress", homeAddress)
            .put("loyaltyTier", loyaltyTier)
            .put("webURL", webURL)
            .put("active", active)
        loyaltyPoints?.let { json.put("loyaltyPoints", it) }
        json.put("favoriteCategories", JSONArray().apply {
            favoriteCategories.forEach { put(it) }
        })
        return json
    }

    companion object {
        private fun stringList(json: JSONObject, key: String): List<String> {
            val array = json.optJSONArray(key) ?: return emptyList()
            return buildList {
                for (index in 0 until array.length()) {
                    val value = array.optString(index)
                    if (value.isNotBlank()) add(value)
                }
            }
        }

        fun fromJson(json: JSONObject): CredentialProfile =
            CredentialProfile(
                id = json.optString("id").ifBlank { UUID.randomUUID().toString() },
                name = json.optString("name"),
                apiKey = json.optString("apiKey"),
                endpoint = json.optString("endpoint"),
                externalId = json.optString("externalId", CredentialStore.DEFAULT_EXTERNAL_ID),
                firstName = json.optString("firstName"),
                lastName = json.optString("lastName"),
                initials = json.optString("initials"),
                homeLocation = json.optString("homeLocation"),
                homeAddress = json.optString("homeAddress"),
                loyaltyTier = json.optString("loyaltyTier"),
                loyaltyPoints = if (json.has("loyaltyPoints")) json.optInt("loyaltyPoints") else null,
                favoriteCategories = stringList(json, "favoriteCategories"),
                webURL = normalizeWebUrl(json.optString("webURL")),
            )

        private fun normalizeWebUrl(value: String): String =
            value.trim().let { trimmed ->
                when {
                    trimmed.isBlank() -> ""
                    trimmed.startsWith("file:///android_asset/lumo/index.html") -> ""
                    trimmed == CredentialStore.DEFAULT_WEB_URL -> ""
                    isAllowedLocalWebUrl(trimmed) -> trimmed
                    else -> ""
                }
            }

        fun isAllowedLocalWebUrl(value: String): Boolean {
            val trimmed = value.trim()
            if (trimmed == CredentialStore.DEFAULT_WEB_URL) return true
            return Regex("^http://(localhost|127\\.0\\.0\\.1|10\\.0\\.2\\.2)(:\\d+)?(/.*)?$").matches(trimmed)
        }
    }
}

data class GeneratedCredentialSeed(
    val packId: String,
    val packName: String,
    val profileName: String,
    val configHash: String,
    val apiKey: String,
    val endpoint: String,
    val externalId: String,
) {
    val profileId: String
        get() = "generated:${normalizedPackId()}"

    fun profile(): CredentialProfile? {
        val key = apiKey.trim()
        val sdkEndpoint = endpoint.trim()
        if (key.isBlank() || sdkEndpoint.isBlank()) return null
        return CredentialProfile(
            id = profileId,
            name = profileName.trim().ifBlank { packName.trim().ifBlank { "Generated workspace" } },
            apiKey = key,
            endpoint = sdkEndpoint,
            externalId = externalId.trim().ifBlank { CredentialStore.DEFAULT_EXTERNAL_ID },
            webURL = "",
        )
    }

    /** One-way generated-context marker; SharedPreferences never receives another plaintext key copy. */
    fun fingerprint(): String = sha256(
        listOf(
            "android-generated-credential-seed/v1",
            normalizedPackId(),
            configHash.trim(),
            apiKey.trim(),
            endpoint.trim(),
            externalId.trim(),
        ),
    )

    /** Safe runtime proof that the active SDK credentials belong to this generated pack context. */
    fun sdkCredentialContextFingerprint(profile: CredentialProfile?): String {
        if (profile == null || profile.apiKey.isBlank() || profile.endpoint.isBlank()) return ""
        return sha256(
            listOf(
                SDK_CREDENTIAL_CONTEXT_PROTOCOL,
                normalizedPackId(),
                configHash.trim(),
                profile.apiKey.trim(),
                profile.endpoint.trim(),
            ),
        )
    }

    private fun normalizedPackId(): String = packId.trim().ifBlank { "default" }

    companion object {
        const val SDK_CREDENTIAL_CONTEXT_PROTOCOL = "android-sdk-credential-context/v1"

        fun current(): GeneratedCredentialSeed = GeneratedCredentialSeed(
            packId = BuildConfig.DEMO_PACK_ID,
            packName = BuildConfig.DEMO_PACK_NAME,
            profileName = BuildConfig.DEMO_PROFILE_NAME,
            configHash = BuildConfig.DEMO_CONFIG_HASH,
            apiKey = BuildConfig.BRAZE_API_KEY,
            endpoint = BuildConfig.BRAZE_ENDPOINT,
            externalId = BuildConfig.DEMO_EXTERNAL_ID,
        )

        private fun sha256(parts: List<String>): String =
            MessageDigest.getInstance("SHA-256")
                .digest(parts.joinToString("\u0000").toByteArray(Charsets.UTF_8))
                .joinToString("") { byte -> "%02x".format(byte) }
    }
}

data class CredentialSeedReconciliation(
    val profiles: List<CredentialProfile>,
    val activeProfileId: String?,
    val fingerprint: String,
    val contextChanged: Boolean,
)

object CredentialSeedPolicy {
    fun reconcile(
        profiles: List<CredentialProfile>,
        activeProfileId: String?,
        previousFingerprint: String?,
        seed: GeneratedCredentialSeed,
    ): CredentialSeedReconciliation {
        val fingerprint = seed.fingerprint()
        val generatedProfile = seed.profile()
        val list = profiles.toMutableList()
        if (generatedProfile != null) {
            val existingIndex = list.indexOfFirst { it.id == generatedProfile.id }.takeIf { it >= 0 }
                ?: list.indexOfFirst {
                    it.name == CredentialStore.LEGACY_SEED_NAME &&
                        it.apiKey == generatedProfile.apiKey &&
                        it.endpoint == generatedProfile.endpoint
                }.takeIf { it >= 0 }
            if (existingIndex != null) list[existingIndex] = generatedProfile else list.add(generatedProfile)
        }

        val contextChanged = previousFingerprint != fingerprint
        val activeStillExists = activeProfileId != null && list.any { it.id == activeProfileId }
        val nextActiveId = when {
            contextChanged -> generatedProfile?.id
            !activeStillExists -> generatedProfile?.id
            else -> activeProfileId
        }
        return CredentialSeedReconciliation(list, nextActiveId, fingerprint, contextChanged)
    }
}

class CredentialStore private constructor(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    var activeProfileId: String?
        get() = prefs.getString(ACTIVE_KEY, null)
        private set(value) {
            prefs.edit().putString(ACTIVE_KEY, value).apply()
        }

    val profiles: List<CredentialProfile>
        get() {
            val raw = prefs.getString(PROFILES_KEY, "[]") ?: "[]"
            val array = runCatching { JSONArray(raw) }.getOrDefault(JSONArray())
            return buildList {
                for (index in 0 until array.length()) {
                    val item = array.optJSONObject(index) ?: continue
                    runCatching { add(CredentialProfile.fromJson(item)) }
                }
            }
        }

    val activeProfile: CredentialProfile?
        get() {
            val list = profiles
            val id = activeProfileId ?: return null
            return list.firstOrNull { it.id == id }
        }

    /**
     * Returns true when the generated seed took over the active profile, i.e. the demo pack,
     * config hash, or seed identity changed. Callers use this to drop any remembered runtime
     * identity so a new pack always starts on its own seed user.
     */
    fun seedIfEmpty(): Boolean {
        val outcome = CredentialSeedPolicy.reconcile(
            profiles = profiles,
            activeProfileId = activeProfileId,
            previousFingerprint = prefs.getString(SEED_MARKER_KEY, null),
            seed = GeneratedCredentialSeed.current(),
        )
        persist(outcome.profiles)
        activeProfileId = outcome.activeProfileId
        val markerEditor = prefs.edit().putString(SEED_MARKER_KEY, outcome.fingerprint)
        if (outcome.contextChanged) markerEditor.putBoolean(SEED_CONTEXT_CHANGE_PENDING_KEY, true)
        markerEditor.apply()
        return outcome.contextChanged
    }

    fun consumeGeneratedSeedContextChange(): Boolean {
        val pending = prefs.getBoolean(SEED_CONTEXT_CHANGE_PENDING_KEY, false)
        if (pending) prefs.edit().remove(SEED_CONTEXT_CHANGE_PENDING_KEY).apply()
        return pending
    }

    fun activeSdkCredentialContextFingerprint(): String =
        GeneratedCredentialSeed.current().sdkCredentialContextFingerprint(activeProfile)

    fun save(profile: CredentialProfile): CredentialProfile {
        val list = profiles.toMutableList()
        val index = list.indexOfFirst { it.id == profile.id }
        if (index >= 0) {
            list[index] = profile
        } else {
            list.add(profile)
        }
        persist(list)
        activeProfileId = profile.id
        return profile
    }

    fun select(id: String): Boolean {
        if (profiles.none { it.id == id }) return false
        activeProfileId = id
        return true
    }

    fun profilesPayload(): JSONArray {
        val activeId = activeProfileId
        return JSONArray().apply {
            profiles.forEach { profile ->
                put(profile.toJson(active = profile.id == activeId))
            }
        }
    }

    private fun persist(list: List<CredentialProfile>) {
        val array = JSONArray()
        list.forEach { array.put(it.toJson()) }
        prefs.edit().putString(PROFILES_KEY, array.toString()).apply()
    }

    companion object {
        const val DEFAULT_EXTERNAL_ID = "lumo-demo-user"
        const val DEFAULT_WEB_URL = "file:///android_asset/demo/index.html"

        private const val PREFS = "braze.demo.credentials"
        private const val PROFILES_KEY = "braze.demo.profiles"
        private const val ACTIVE_KEY = "braze.demo.activeProfileId"
        private const val SEED_MARKER_KEY = "braze.demo.seedMarker"
        private const val SEED_CONTEXT_CHANGE_PENDING_KEY = "braze.demo.seedContextChangePending"
        internal const val LEGACY_SEED_NAME = "Seed (local.properties)"

        @Volatile
        private var instance: CredentialStore? = null

        fun get(context: Context): CredentialStore =
            instance ?: synchronized(this) {
                instance ?: CredentialStore(context).also { instance = it }
            }
    }
}
