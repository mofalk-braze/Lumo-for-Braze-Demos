package com.braze.demoshell

import android.app.Application
import android.util.Log
import com.braze.Braze
import com.braze.BrazeActivityLifecycleCallbackListener
import com.braze.configuration.BrazeConfig

class DemoApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        val store = CredentialStore.get(this)
        store.seedIfEmpty()
        configureBraze(store.activeProfile)
        registerActivityLifecycleCallbacks(BrazeActivityLifecycleCallbackListener())
    }

    private fun configureBraze(profile: CredentialProfile?) {
        val apiKey = profile?.apiKey?.trim().orEmpty()
        val endpoint = profile?.endpoint?.trim().orEmpty()
        val senderId = BuildConfig.FIREBASE_SENDER_ID.trim()

        if (apiKey.isNotEmpty() && endpoint.isNotEmpty()) {
            val builder = BrazeConfig.Builder()
                .setApiKey(apiKey)
                .setCustomEndpoint(endpoint)
                .setSessionTimeout(BuildConfig.BRAZE_SESSION_TIMEOUT_SECONDS)
                .setGreatNetworkDataFlushInterval(10)
                .setIsFirebaseMessagingServiceOnNewTokenRegistrationEnabled(true)
                .setIsFirebaseCloudMessagingRegistrationEnabled(senderId.isNotEmpty())

            if (senderId.isNotEmpty()) {
                builder.setFirebaseCloudMessagingSenderIdKey(senderId)
            }

            val configured = Braze.configure(this, builder.build())
            Log.i(
                TAG,
                "Braze runtime configuration applied: $configured " +
                    "(sessionTimeout=${BuildConfig.BRAZE_SESSION_TIMEOUT_SECONDS}s)",
            )
        } else {
            Log.w(TAG, "Braze API key/endpoint missing. Add a workspace in the demo setup screen.")
        }
    }

    private companion object {
        private const val TAG = "BrazeDemoApplication"
    }
}
