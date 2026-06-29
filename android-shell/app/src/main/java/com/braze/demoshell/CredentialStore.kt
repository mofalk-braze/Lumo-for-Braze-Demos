package com.braze.demoshell

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
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
            val id = activeProfileId
            return list.firstOrNull { it.id == id } ?: list.firstOrNull()
        }

    fun seedIfEmpty() {
        val seed = generatedSeedProfile() ?: return
        val marker = generatedSeedMarker(seed)
        val previousMarker = prefs.getString(SEED_MARKER_KEY, null)
        val list = profiles.toMutableList()
        val existingIndex = list.indexOfFirst { it.id == seed.id }.takeIf { it >= 0 }
            ?: list.indexOfFirst {
                it.name == LEGACY_SEED_NAME &&
                    it.apiKey == seed.apiKey &&
                    it.endpoint == seed.endpoint
            }.takeIf { it >= 0 }

        if (existingIndex != null) {
            list[existingIndex] = seed
        } else {
            list.add(seed)
        }

        val activeId = activeProfileId
        val activeStillExists = activeId != null && list.any { it.id == activeId }
        val demoChanged = previousMarker != marker
        persist(list)

        if (demoChanged || !activeStillExists) {
            activeProfileId = seed.id
        }
        prefs.edit().putString(SEED_MARKER_KEY, marker).apply()
    }

    private fun generatedSeedProfile(): CredentialProfile? {
        val apiKey = BuildConfig.BRAZE_API_KEY.trim()
        val endpoint = BuildConfig.BRAZE_ENDPOINT.trim()
        if (apiKey.isBlank() || endpoint.isBlank()) return null
        return CredentialProfile(
            id = "${GENERATED_SEED_PREFIX}${BuildConfig.DEMO_PACK_ID.ifBlank { "default" }}",
            name = BuildConfig.DEMO_PROFILE_NAME.ifBlank { LEGACY_SEED_NAME },
            apiKey = apiKey,
            endpoint = endpoint,
            externalId = BuildConfig.DEMO_EXTERNAL_ID.ifBlank { DEFAULT_EXTERNAL_ID },
            webURL = "",
        )
    }

    private fun generatedSeedMarker(seed: CredentialProfile): String =
        listOf(
            BuildConfig.DEMO_PACK_ID,
            BuildConfig.DEMO_CONFIG_HASH,
            seed.apiKey,
            seed.endpoint,
            seed.externalId,
        ).joinToString("|")

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
        private const val GENERATED_SEED_PREFIX = "generated:"
        private const val LEGACY_SEED_NAME = "Seed (local.properties)"

        @Volatile
        private var instance: CredentialStore? = null

        fun get(context: Context): CredentialStore =
            instance ?: synchronized(this) {
                instance ?: CredentialStore(context).also { instance = it }
            }
    }
}
