package com.braze.demoshell

import android.util.Log
import android.webkit.JavascriptInterface
import com.braze.Braze
import com.braze.models.outgoing.BrazeProperties
import org.json.JSONArray
import org.json.JSONObject

class BrazeDemoBridge(
    private val activity: MainActivity,
) {
    @JavascriptInterface
    fun postMessage(message: String) {
        activity.runOnUiThread {
            runCatching {
                val envelope = JSONObject(message)
                val action = envelope.optString("action")
                val payload = envelope.optJSONObject("payload") ?: JSONObject()
                handle(action, payload)
            }.onFailure {
                Log.w(TAG, "Invalid bridge message: $message", it)
                activity.appendLog("Bridge parse failed: ${it.message}")
            }
        }
    }

    private fun handle(action: String, payload: JSONObject) {
        activity.appendLog("web -> native: $action")
        activity.recordBridgeAction(action, payload)
        when (action) {
            "webReady" -> {
                activity.handleWebReady(payload.optJSONObject("sync"))
            }

            "saveCredentialProfile" -> {
                activity.saveCredentialProfile(payload)
            }

            "selectCredentialProfile" -> {
                val id = payload.optString("id")
                if (id.isNotBlank()) {
                    activity.selectCredentialProfile(id)
                }
            }

            "listProfiles" -> {
                activity.sendToWeb("profiles", CredentialStore.get(activity).profilesPayload())
            }

            "changeUser" -> {
                val id = payload.optString("externalId", DEFAULT_USER)
                activity.changeUser(id, payload.optJSONObject("sync"))
            }

            "setCustomAttribute" -> {
                val key = payload.optString("key")
                if (key.isNotBlank()) {
                    activity.setCustomAttribute(key, payload.opt("value"))
                }
            }

            "logCustomEvent" -> {
                val name = payload.optString("name")
                if (name.isNotBlank()) {
                    val properties = payload.optJSONObject("properties")
                    activity.logCustomEvent(name, properties)
                }
            }

            "logPurchase" -> activity.logPurchase(payload)
            "requestContentCardsRefresh" -> activity.refreshContentCards()
            "showContentCards" -> activity.refreshContentCards()
            "logContentCardImpression" -> activity.logContentCardImpression(payload.optString("cardId"))
            "logContentCardClick" -> activity.logContentCardClick(payload.optString("cardId"))
            "dismissContentCard" -> activity.dismissContentCard(payload.optString("cardId"))
            "mountBanner" -> activity.mountBanner(payload.optString("placementId"), payload.optJSONObject("rect") ?: JSONObject())
            "unmountBanner" -> activity.unmountBanner(payload.optString("placementId"))
            "requestBannersRefresh" -> {
                val ids = payload.optJSONArray("placementIds") ?: JSONArray()
                activity.requestBannersRefresh(List(ids.length()) { index -> ids.optString(index) }.filter(String::isNotBlank))
            }
            "requestPushPermission" -> activity.requestNotificationPermission()
            else -> activity.appendLog("Unknown bridge action: $action")
        }
    }

    companion object {
        const val DEFAULT_USER = CredentialStore.DEFAULT_EXTERNAL_ID
        private const val TAG = "BrazeDemoBridge"

        fun propertiesFromJson(json: JSONObject?): BrazeProperties? {
            if (json == null) return null
            return BrazeProperties(json)
        }

        fun setUserAttribute(activity: MainActivity, key: String, value: Any?) {
            val user = Braze.getInstance(activity.applicationContext).currentUser
            if (user == null) {
                activity.appendLog("Skipped attribute $key: Braze current user is not ready.")
                return
            }
            when (value) {
                is Boolean -> user.setCustomUserAttribute(key, value)
                is Int -> user.setCustomUserAttribute(key, value)
                is Long -> user.setCustomUserAttribute(key, value)
                is Float -> user.setCustomUserAttribute(key, value)
                is Double -> user.setCustomUserAttribute(key, value)
                is Number -> user.setCustomUserAttribute(key, value.toDouble())
                is JSONArray -> {
                    if (value.length() > 0 && value.opt(0) is JSONObject) {
                        // Array of objects -> Braze nested custom attribute array, not a plain string array.
                        user.setCustomUserAttribute(key, value)
                    } else {
                        val values = Array(value.length()) { index -> value.optString(index) }
                        user.setCustomAttributeArray(key, values)
                    }
                }
                is JSONObject -> user.setCustomUserAttribute(key, value)
                JSONObject.NULL, null -> user.unsetCustomUserAttribute(key)
                else -> user.setCustomUserAttribute(key, value.toString())
            }
        }
    }
}
