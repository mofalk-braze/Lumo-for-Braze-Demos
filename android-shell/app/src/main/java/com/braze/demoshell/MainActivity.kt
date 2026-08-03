package com.braze.demoshell

import android.Manifest
import android.app.ActivityManager
import android.app.Dialog
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.Window
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import com.braze.Braze
import com.braze.IBrazeDeeplinkHandler
import com.braze.enums.BrazePushEventType
import com.braze.enums.Channel
import com.braze.enums.inappmessage.ClickAction
import com.braze.events.BrazePushEvent
import com.braze.events.ContentCardsUpdatedEvent
import com.braze.models.cards.CaptionedImageCard
import com.braze.models.cards.Card
import com.braze.models.cards.ShortNewsCard
import com.braze.models.cards.TextAnnouncementCard
import com.braze.models.inappmessage.IInAppMessage
import com.braze.models.inappmessage.MessageButton
import com.braze.models.outgoing.BrazeProperties
import com.braze.models.push.BrazeNotificationPayload
import com.braze.ui.BrazeDeeplinkHandler
import com.braze.push.BrazeNotificationUtils
import com.braze.ui.actions.UriAction
import com.braze.ui.inappmessage.BrazeInAppMessageManager
import com.braze.ui.inappmessage.listeners.IHtmlInAppMessageActionListener
import com.braze.ui.inappmessage.listeners.DefaultInAppMessageManagerListener
import com.braze.ui.banners.BannerView
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

class MainActivity : android.app.Activity() {
    private lateinit var webView: WebView
    private lateinit var bridge: BrazeDemoBridge
    private lateinit var store: CredentialStore
    private lateinit var rootLayout: FrameLayout
    private val bannerViews = mutableMapOf<String, BannerView>()

    private val cardsById = mutableMapOf<String, Card>()
    private val debugLog = ArrayDeque<String>()
    private var debugLogView: TextView? = null
    private var currentFcmToken: String? = null
    private var fcmTokenRequestInFlight: Boolean = false
    private var lastContentCardCount: Int = 0
    private var lastDeliveredContentCardsPayload: String? = null
    private var currentSdkExternalId: String = CredentialStore.DEFAULT_EXTERNAL_ID
    private var currentDisplayName: String = ""
    private val syncSessionId: String = UUID.randomUUID().toString()
    private var lastIdentitySyncSignature: String = ""
    private var hasAppliedSdkIdentity: Boolean = false
    private var lastTrustDiagnostics: JSONObject? = null
    private var isActivityForeground: Boolean = false
    private var webBridgeReady: Boolean = false
    private var pendingNavigationRoute: String? = null
    private var pendingNavigationSource: String = "pending"
    private var lastPushDiagnostics: JSONObject? = null
    private var lastPushForegroundRequestAt: Long = 0L
    private val pushRetryHandler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = CredentialStore.get(this)
        store.seedIfEmpty()
        currentSdkExternalId = activeExternalId()
        currentDisplayName = getSharedPreferences("braze_demo_runtime", MODE_PRIVATE)
            .getString("active_display_name", "")
            .orEmpty()
        bridge = BrazeDemoBridge(this)

        configureSystemBars()

        createNotificationChannel()
        val root = buildLayout()
        setContentView(root)
        ViewCompat.requestApplyInsets(root)
        configureDeepLinkRouting()
        configureInAppMessageNavigation()
        configureWebView()
        subscribeToBrazeUpdates()
        refreshPushReadiness("launch")
        maybeRequestNotificationsOnLaunch()
        handleDemoCommandIntent(intent)
        if (!handleInternalDeepLinkIntent(intent)) {
            handleNotificationIntent(intent)
        }
    }

    override fun onResume() {
        super.onResume()
        isActivityForeground = true
        runCatching {
            BrazeInAppMessageManager.getInstance().registerInAppMessageManager(this)
            appendLog("IAM manager registered.")
            refreshPushReadiness("resume")
        }.onFailure {
            appendLog("IAM manager registration failed: ${it.message}")
            postLauncherTelemetry(
                type = "iam_manager",
                label = "Android IAM manager registration failed",
                status = "error",
                result = JSONObject().put("error", it.message ?: "unknown"),
            )
        }
    }

    override fun onPause() {
        isActivityForeground = false
        runCatching {
            BrazeInAppMessageManager.getInstance().unregisterInAppMessageManager(this)
        }.onFailure {
            appendLog("IAM manager unregister failed: ${it.message}")
        }
        super.onPause()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDemoCommandIntent(intent)
        if (!handleInternalDeepLinkIntent(intent)) {
            handleNotificationIntent(intent)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST) {
            val granted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
            appendLog("Notification permission: ${if (granted) "granted" else "denied"}")
            sendToWeb("pushPermission", if (granted) "granted" else "denied")
            postLauncherTelemetry(
                type = "push_permission",
                label = "Notification permission ${if (granted) "granted" else "denied"}",
                status = if (granted) "success" else "info",
                payload = pushDiagnosticsPayload().put("permission", if (granted) "granted" else "denied"),
            )
            refreshDebugDrawer()
        }
    }

    fun handleWebReady(sync: JSONObject? = null) {
        webBridgeReady = true
        sendToWeb("ready", JSONObject())
        sendConnectionToWeb()
        sendToWeb("profiles", store.profilesPayload())
        sendToWeb("pushPermission", pushPermissionState())
        sendCachedContentCards()
        flushPendingNavigation()
        refreshPushReadiness("web_ready")
        postLauncherTelemetry(
            type = "runtime_ready",
            label = "Android runtime ready",
            status = "success",
            payload = JSONObject()
                .put("sourceUrl", activeWebUrl())
                .put("runtime", runtimePayload())
                .put("diagnostics", deviceDiagnosticsPayload())
                .put("sync", sync ?: syncEnvelope(authority = "native", reason = "default")),
            result = runtimePayload(),
        )
    }

    fun saveCredentialProfile(payload: JSONObject) {
        val previous = store.activeProfile
        val profile = CredentialProfile.fromJson(payload)
        val saved = store.save(profile)
        appendLog("Saved workspace profile: ${saved.name}")
        sendToWeb("profiles", store.profilesPayload())
        sendConnectionToWeb()
        restartForProfileChange(previous, saved)
    }

    fun selectCredentialProfile(id: String) {
        val previous = store.activeProfile
        if (!store.select(id)) {
            appendLog("Profile not found: $id")
            return
        }
        val selected = store.activeProfile ?: return
        appendLog("Selected workspace profile: ${selected.name}")
        sendToWeb("profiles", store.profilesPayload())
        sendConnectionToWeb()
        restartForProfileChange(previous, selected)
    }

    fun changeUser(
        externalId: String = activeExternalId(),
        sync: JSONObject? = null,
        displayName: String? = null,
        authority: String = "native",
        reason: String = "manual",
    ) {
        val id = externalId.trim()
        if (id.isBlank()) return appendLog("changeUser skipped: empty external ID.")
        if (displayName != null) {
            currentDisplayName = displayName.trim()
            getSharedPreferences("braze_demo_runtime", MODE_PRIVATE)
                .edit()
                .putString("active_display_name", currentDisplayName)
                .apply()
        }
        val syncPayload = sync ?: syncEnvelope(authority = authority, reason = reason)
        val identitySignature = syncSignature(id, syncPayload)
        if (hasAppliedSdkIdentity && identitySignature == lastIdentitySyncSignature) {
            appendLog("changeUser deduped($id)")
            sendConnectionToWeb(sync = syncPayload)
            return
        }

        val braze = brazeOrNull() ?: return appendLog("changeUser skipped: Braze is not configured.")
        if (currentSdkExternalId != id) {
            cardsById.clear()
            lastContentCardCount = 0
            sendToWeb("contentCards", JSONArray())
        }
        braze.changeUser(id)
        currentSdkExternalId = id
        lastIdentitySyncSignature = identitySignature
        hasAppliedSdkIdentity = true
        braze.requestImmediateDataFlush()
        appendLog("changeUser($id)")
        postLauncherTelemetry(
            type = "change_user",
            label = "Changed SDK user",
            status = "success",
            externalId = id,
            payload = JSONObject()
                .put("externalId", id)
                .put("displayName", currentDisplayName)
                .put("sync", syncPayload),
        )
        refreshPushReadiness("change_user")
        sendConnectionToWeb(sync = syncPayload)
    }

    fun setCustomAttribute(key: String, value: Any?) {
        BrazeDemoBridge.setUserAttribute(this, key, value)
        brazeOrNull()?.requestImmediateDataFlush()
        appendLog("Set attribute: $key=$value")
        postLauncherTelemetry(
            type = "sdk_attribute",
            label = "Set SDK attribute",
            status = "success",
            payload = JSONObject().put("key", key).put("value", value),
        )
    }

    fun logCustomEvent(name: String, properties: JSONObject? = null) {
        val braze = brazeOrNull() ?: return appendLog("Event skipped: Braze is not configured.")
        val brazeProperties = propertiesFromJson(properties)
        if (brazeProperties == null) {
            braze.logCustomEvent(name)
        } else {
            braze.logCustomEvent(name, brazeProperties)
        }
        braze.requestImmediateDataFlush()
        appendLog("Logged event: $name")
        postLauncherTelemetry(
            type = "sdk_event",
            label = "Logged SDK event",
            status = "success",
            payload = JSONObject().put("name", name).put("properties", properties ?: JSONObject()),
        )
    }

    fun logPurchase(payload: JSONObject) {
        val braze = brazeOrNull() ?: return appendLog("Purchase skipped: Braze is not configured.")
        val productId = payload.optString("productId")
        if (productId.isBlank()) return appendLog("Purchase skipped: missing productId.")
        val price = BigDecimal.valueOf(payload.optDouble("price", 0.0))
        val currency = payload.optString("currency", "USD")
        val quantity = payload.optInt("quantity", 1)
        val properties = propertiesFromJson(payload.optJSONObject("properties"))
        if (properties == null) {
            braze.logPurchase(productId, currency, price, quantity)
        } else {
            braze.logPurchase(productId, currency, price, quantity, properties)
        }
        braze.requestImmediateDataFlush()
        appendLog("Logged purchase: $productId $price $currency x$quantity")
        postLauncherTelemetry(
            type = "sdk_purchase",
            label = "Logged SDK purchase",
            status = "success",
            payload = payload,
        )
    }

    fun refreshContentCards() {
        val braze = brazeOrNull() ?: return appendLog("Content Cards skipped: Braze is not configured.")
        braze.requestContentCardsRefresh()
        braze.requestImmediateDataFlush()
        sendCachedContentCards()
        appendLog("Requested Content Cards refresh.")
        postLauncherTelemetry(
            type = "content_cards_refresh",
            label = "Requested Content Cards refresh",
            status = "success",
        )
    }

    fun logContentCardImpression(cardId: String) {
        val logged = cardsById[cardId]?.logImpression() == true
        appendLog("Content Card impression $cardId: $logged")
        postLauncherTelemetry(
            type = "content_card_impression",
            label = "Content Card impression",
            status = if (logged) "success" else "info",
            payload = JSONObject().put("cardId", cardId).put("logged", logged),
        )
    }

    fun logContentCardClick(cardId: String) {
        val logged = cardsById[cardId]?.logClick() == true
        appendLog("Content Card click $cardId: $logged")
        postLauncherTelemetry(
            type = "content_card_click",
            label = "Content Card click",
            status = if (logged) "success" else "info",
            payload = JSONObject().put("cardId", cardId).put("logged", logged),
        )
    }

    fun dismissContentCard(cardId: String) {
        val card = cardsById[cardId]
        val dismissed = card != null
        if (card != null) {
            card.isDismissed = true
            handleContentCards(cardsById.values.toList())
        }
        appendLog("Content Card dismiss $cardId: $dismissed")
        postLauncherTelemetry(
            type = "content_card_dismissed",
            label = "Content Card dismissed",
            status = if (dismissed) "success" else "info",
            payload = JSONObject().put("cardId", cardId).put("dismissed", dismissed),
        )
    }

    fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            appendLog("Notification runtime permission not required before Android 13.")
            sendToWeb("pushPermission", "granted")
            postLauncherTelemetry(
                type = "push_permission",
                label = "Notification permission already granted",
                status = "success",
            )
            return
        }

        val permission = Manifest.permission.POST_NOTIFICATIONS
        if (ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED) {
            appendLog("Notification permission already granted.")
            sendToWeb("pushPermission", "granted")
            postLauncherTelemetry(
                type = "push_permission",
                label = "Notification permission already granted",
                status = "success",
            )
            return
        }

        ActivityCompat.requestPermissions(this, arrayOf(permission), NOTIFICATION_PERMISSION_REQUEST)
    }

    fun sendToWeb(action: String, payload: JSONObject) {
        sendToWebRaw(action, payload.toString())
    }

    fun sendToWeb(action: String, payload: JSONArray) {
        sendToWebRaw(action, payload.toString())
    }

    fun sendToWeb(action: String, payload: String) {
        sendToWebRaw(action, JSONObject.quote(payload))
    }

    fun sendConnectionToWeb(loadError: String? = null, sync: JSONObject? = null) {
        val profile = store.activeProfile
        val connected = profile?.apiKey?.isNotBlank() == true && profile.endpoint.isNotBlank()
        val externalId = currentSdkExternalId.ifBlank { profile?.externalId ?: CredentialStore.DEFAULT_EXTERNAL_ID }
        val payload = JSONObject()
            .put("connected", connected)
            .put("label", if (connected) "${profile?.name} · ${profile?.endpoint}" else "No workspace - open Setup")
            .put("externalId", externalId)
            .put("displayName", currentDisplayName)
            .put("sync", sync ?: syncEnvelope(authority = "native", reason = "default"))
            .put("setupNeeded", !connected)
            .put("runtime", runtimePayload())
            .put("sourceUrl", activeWebUrl())
            .put("sourceOverride", isWebSourceOverrideActive())
        if (!loadError.isNullOrBlank()) payload.put("loadError", loadError)
        sendToWeb("connection", payload)
    }

    fun appendLog(message: String) {
        val next = "${timeFormat.format(Date())}  $message"
        Log.i(TAG, message)
        debugLog.addFirst(next)
        while (debugLog.size > 40) debugLog.removeLast()
        refreshDebugDrawer()
    }

    fun recordBridgeAction(action: String, payload: JSONObject) {
        postLauncherTelemetry(
            type = "bridge_action",
            label = "web -> native: $action",
            status = "info",
            payload = JSONObject()
                .put("action", action)
                .put("payload", payload)
                .put("sync", payload.optJSONObject("sync") ?: syncEnvelope(authority = "web", reason = "manual")),
        )
    }

    private fun buildLayout(): View {
        webView = WebView(this)
        webView.setBackgroundColor(Color.WHITE)
        webView.setOnLongClickListener {
            showDebugDrawer()
            true
        }
        return FrameLayout(this).apply {
            rootLayout = this
            setBackgroundColor(Color.WHITE)
            ViewCompat.setOnApplyWindowInsetsListener(this) { view, insets ->
                val safeTopInsets = insets.getInsets(
                    WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.displayCutout(),
                )
                view.updatePadding(top = safeTopInsets.top)
                insets
            }
            addView(
                webView,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                ),
            )
        }
    }

    private fun configureSystemBars() {
        window.statusBarColor = Color.WHITE
        window.navigationBarColor = Color.WHITE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.navigationBarDividerColor = BRAND_NEUTRAL_LINE
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
        }

        WindowCompat.setDecorFitsSystemWindows(window, true)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }
    }

    private fun configureWebView() {
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = true
        webView.settings.allowContentAccess = true
        webView.settings.allowFileAccessFromFileURLs = true
        webView.settings.allowUniversalAccessFromFileURLs = true
        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                appendLog("Loaded demo WebView: ${url ?: "unknown"}")
                sendConnectionToWeb()
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request?.isForMainFrame != true) return
                appendLog("WebView load failed: ${error?.description ?: "unknown error"}")
                sendConnectionToWeb(loadError = error?.description?.toString())
            }
        }
        webView.addJavascriptInterface(bridge, "brazeBridge")
        webBridgeReady = false
        lastDeliveredContentCardsPayload = null
        webView.loadUrl(activeWebUrl())
    }

    private fun subscribeToBrazeUpdates() {
        val braze = brazeOrNull() ?: return
        braze.subscribeToContentCardsUpdates { event: ContentCardsUpdatedEvent ->
            runOnUiThread { handleContentCards(event.allCards) }
        }
        braze.subscribeToPushNotificationEvents { event: BrazePushEvent ->
            runOnUiThread { handlePushEvent(event) }
        }
        braze.subscribeToBannersUpdates { event ->
            runOnUiThread {
                postLauncherTelemetry(
                    type = "banners_updated",
                    label = "Android Banners updated",
                    status = "success",
                    payload = JSONObject().put("placements", JSONArray(event.banners.map { it.placementId })),
                )
            }
        }
        changeUser(activeExternalId())
    }

    fun mountBanner(placementId: String, rect: JSONObject) {
        if (placementId.isBlank()) return
        val viewportWidth = rect.optDouble("viewportWidth", 0.0)
        val scale = if (viewportWidth > 0.0) webView.width.toDouble() / viewportWidth else resources.displayMetrics.density.toDouble()
        val bannerView = bannerViews.getOrPut(placementId) {
            BannerView(this, placementId).also { view ->
                rootLayout.addView(view)
                postLauncherTelemetry(type = "banner_mounted", label = "Mounted Android Banner placement", status = "success", payload = JSONObject().put("placementId", placementId))
            }
        }
        bannerView.layoutParams = FrameLayout.LayoutParams(
            (rect.optDouble("width") * scale).toInt().coerceAtLeast(1),
            (rect.optDouble("height") * scale).toInt().coerceAtLeast(1),
        )
        bannerView.x = (rect.optDouble("x") * scale).toFloat()
        bannerView.y = (rect.optDouble("y") * scale).toFloat()
        bannerView.visibility = View.VISIBLE
    }

    fun unmountBanner(placementId: String) {
        bannerViews.remove(placementId)?.let(rootLayout::removeView)
    }

    fun requestBannersRefresh(placementIds: List<String>) {
        if (placementIds.isEmpty()) return
        brazeOrNull()?.requestBannersRefresh(placementIds)
        postLauncherTelemetry(type = "banners_refresh", label = "Requested Android Banners refresh", status = "info", payload = JSONObject().put("placements", JSONArray(placementIds)))
    }

    private fun handleContentCards(cards: List<Card>) {
        cardsById.clear()
        val payload = JSONArray()
        cards.filter { !it.isControl && !it.isRemoved && !it.isDismissed }.forEach { card ->
            cardsById[card.id] = card
            payload.put(normalizeCard(card))
        }
        lastContentCardCount = payload.length()
        if (!webBridgeReady) return
        val signature = payload.toString()
        if (signature == lastDeliveredContentCardsPayload) return
        lastDeliveredContentCardsPayload = signature
        sendToWeb("contentCards", payload)
        appendLog("Content Cards updated: ${payload.length()}")
        postLauncherTelemetry(
            type = "content_cards",
            label = "Content Cards updated",
            status = "success",
            payload = JSONObject()
                .put("count", payload.length())
                .put("diagnostics", deviceDiagnosticsPayload()),
            result = payload,
        )
    }

    private fun normalizeCard(card: Card): JSONObject {
        val extras = JSONObject()
        card.extras.forEach { (key, value) -> extras.put(key, value) }
        val placement = card.extras["placement"] ?: "inbox"

        return JSONObject()
            .put("id", card.id)
            .put("title", cardTitle(card))
            .put("description", cardDescription(card))
            .put("imageUrl", cardImageUrl(card))
            .put("url", card.url)
            .put("extras", extras)
            .put("placement", placement)
    }

    private fun cardTitle(card: Card): String =
        when (card) {
            is CaptionedImageCard -> card.title ?: ""
            is ShortNewsCard -> card.title ?: ""
            is TextAnnouncementCard -> card.title ?: ""
            else -> card.extras["title"] ?: ""
        }

    private fun cardDescription(card: Card): String =
        when (card) {
            is CaptionedImageCard -> card.description ?: ""
            is ShortNewsCard -> card.description ?: ""
            is TextAnnouncementCard -> card.description ?: ""
            else -> card.extras["description"] ?: ""
        }

    private fun cardImageUrl(card: Card): String =
        when (card) {
            is CaptionedImageCard -> card.imageUrl ?: ""
            is ShortNewsCard -> card.imageUrl ?: ""
            else -> card.extras["imageUrl"] ?: ""
        }

    private fun handlePushEvent(event: BrazePushEvent) {
        val payload = event.notificationPayload
        when (event.eventType) {
            BrazePushEventType.NOTIFICATION_RECEIVED -> {
                val pushDiagnostics = pushEventDiagnostics(payload)
                lastPushDiagnostics = pushDiagnostics
                if (isActivityForeground) {
                    showForegroundNativeNotification(payload)
                } else {
                    appendLog("Background push received; Android notification UI owns display.")
                    postLauncherTelemetry(
                        type = "push_received",
                        label = "Background push received",
                        status = "success",
                        payload = pushDiagnostics
                            .put("displayMode", "native_background_sdk")
                            .put("diagnostics", deviceDiagnosticsPayload(includeLastPush = false)),
                    )
                }
            }
            BrazePushEventType.NOTIFICATION_OPENED -> {
                val pushDiagnostics = pushEventDiagnostics(payload).put("displayMode", "native_opened")
                lastPushDiagnostics = pushDiagnostics
                bringAppTaskToForeground("push_opened")
                postLauncherTelemetry(
                    type = "push_opened",
                    label = "Native push opened",
                    status = "success",
                    payload = pushDiagnostics,
                )
            }
            BrazePushEventType.NOTIFICATION_DELETED -> {
                val pushDiagnostics = pushEventDiagnostics(payload).put("displayMode", "native_deleted")
                lastPushDiagnostics = pushDiagnostics
                appendLog("Push notification deleted.")
                postLauncherTelemetry(
                    type = "push_deleted",
                    label = "Native push dismissed",
                    status = "info",
                    payload = pushDiagnostics,
                )
            }
        }
    }

    private fun showForegroundNativeNotification(payload: BrazeNotificationPayload) {
        val channelId = foregroundNotificationChannelId()
        if (!canPostNotifications()) {
            val diagnostics = pushEventDiagnostics(payload)
                .put("displayMode", "native_foreground_local")
                .put("displayAttempted", false)
                .put("displayBlockedReason", "notification_permission_or_app_notifications_disabled")
                .put("displayChannelId", channelId)
            lastPushDiagnostics = diagnostics
            appendLog("Foreground push received, but native notification display is blocked.")
            postLauncherTelemetry(
                type = "push_received",
                label = "Foreground push display blocked",
                status = "error",
                payload = diagnostics.put("diagnostics", deviceDiagnosticsPayload(includeLastPush = false)),
            )
            return
        }
        // Use Braze's factory so the foreground notification keeps the same
        // click/open analytics, action buttons, and routing contract as a
        // background SDK notification. Only the display channel is overridden.
        val requestedChannelId = payload.notificationChannelId
        val notification = try {
            payload.notificationChannelId = channelId
            BrazeNotificationUtils.activeNotificationFactory.createNotification(payload)
        } finally {
            payload.notificationChannelId = requestedChannelId
        }
        if (notification == null) {
            val diagnostics = pushEventDiagnostics(payload)
                .put("displayMode", "native_foreground_local")
                .put("displayAttempted", false)
                .put("displayBlockedReason", "braze_notification_factory_returned_null")
                .put("displayChannelId", channelId)
            lastPushDiagnostics = diagnostics
            appendLog("Foreground push received, but Braze could not create a native notification.")
            postLauncherTelemetry(
                type = "push_received",
                label = "Foreground push display failed",
                status = "error",
                payload = diagnostics.put("diagnostics", deviceDiagnosticsPayload(includeLastPush = false)),
            )
            return
        }

        val notificationId = payload.customNotificationId
            ?: (payload.pushUniqueId ?: "${payload.titleText}|${payload.contentText}").hashCode()
        NotificationManagerCompat.from(this).notify(FOREGROUND_NOTIFICATION_TAG, notificationId, notification)
        val diagnostics = pushEventDiagnostics(payload)
            .put("displayMode", "native_foreground_local")
            .put("displayAttempted", true)
            .put("displayChannelId", channelId)
            .put("notificationId", notificationId)
        lastPushDiagnostics = diagnostics
        appendLog("Displayed foreground push as native notification on $channelId.")
        postLauncherTelemetry(
            type = "push_received",
            label = "Foreground push displayed natively",
            status = "success",
            payload = diagnostics.put("diagnostics", deviceDiagnosticsPayload(includeLastPush = false)),
        )
    }

    private fun sendNavigation(uri: String, source: String = "native") {
        forwardInternalRoute(uri, source)
    }

    private fun forwardInternalRoute(
        uri: String,
        source: String = "native",
        closeInAppMessage: Boolean = false,
    ): Boolean {
        val route = internalRouteFromUri(uri) ?: return false
        if (closeInAppMessage) {
            BrazeInAppMessageManager.getInstance().hideCurrentlyDisplayingInAppMessage(false)
        }
        if (!::webView.isInitialized || !webBridgeReady) {
            pendingNavigationRoute = route
            pendingNavigationSource = source
            return true
        }
        sendToWeb("navigate", route)
        appendLog("Forwarded navigation: $route")
        postLauncherTelemetry(
            type = "bridge_action",
            label = "Forwarded internal navigation",
            status = "success",
            payload = JSONObject()
                .put("route", route)
                .put("uri", uri)
                .put("source", source),
        )
        return true
    }

    private fun flushPendingNavigation() {
        val route = pendingNavigationRoute ?: return
        val source = pendingNavigationSource
        pendingNavigationRoute = null
        pendingNavigationSource = "pending"
        sendNavigation(route, source)
    }

    /**
     * Braze processes notification clicks in a short-lived transparent activity. On Android 16,
     * that activity can receive the user click while still being prevented from reusing an
     * existing background task. Moving our own app task forward here keeps both "Open app" and
     * deep-link pushes on the existing MainActivity without clearing SDK or WebView state.
     */
    private fun bringAppTaskToForeground(source: String): Boolean {
        if (isActivityForeground) return true
        val now = SystemClock.elapsedRealtime()
        if (now - lastPushForegroundRequestAt < PUSH_FOREGROUND_DEDUPE_MS) return true
        lastPushForegroundRequestAt = now

        val appTask = getSystemService(ActivityManager::class.java)
            .appTasks
            .firstOrNull { it.taskInfo.taskId == taskId }
        if (appTask == null) {
            appendLog("Could not find the current app task for push open: $source")
            return false
        }
        return runCatching {
            appTask.moveToFront()
            appendLog("Brought app task to foreground: $source")
            true
        }.getOrElse {
            appendLog("Could not foreground app task for push open: ${it.message}")
            false
        }
    }

    private fun handleNotificationIntent(intent: Intent?) {
        if (intent == null) return
        if (intent.action != ACTION_NOTIFICATION_OPENED && !intent.hasExtra(EXTRA_NOTIFICATION_URI)) return
        val uri = intent.getStringExtra(EXTRA_NOTIFICATION_URI)
            ?: intent.dataString
            ?: return
        postLauncherTelemetry(
            type = "push_preview_opened",
            label = "Diagnostics push preview opened",
            status = "info",
            payload = JSONObject()
                .put("deeplink", uri)
                .put("displayMode", "native_diagnostics_preview_opened")
                .put("lastPush", lastPushDiagnostics ?: JSONObject.NULL),
        )
        sendNavigation(uri, "foreground_push_opened")
    }

    private fun handleInternalDeepLinkIntent(intent: Intent?): Boolean {
        if (intent == null || intent.action != Intent.ACTION_VIEW) return false
        val uri = intent.dataString ?: return false
        return forwardInternalRoute(uri, "android_intent")
    }

    private fun showDiagnosticPushPreview(title: String, body: String, uri: String? = null) {
        if (!canPostNotifications()) {
            appendLog("Diagnostics push preview blocked: notifications are disabled.")
            postLauncherTelemetry(
                type = "push_preview",
                label = "Diagnostics push preview blocked",
                status = "error",
                payload = JSONObject()
                    .put("reason", "notification_permission_or_app_notifications_disabled")
                    .put("diagnostics", deviceDiagnosticsPayload()),
            )
            return
        }
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            action = ACTION_NOTIFICATION_OPENED
            uri?.let {
                data = Uri.parse(it)
                putExtra(EXTRA_NOTIFICATION_URI, it)
            }
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            "$title|$body|$uri".hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val channelId = getString(R.string.high_visibility_notification_channel_id)
        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_stat_braze_demo)
            .setColor(ContextCompat.getColor(this, R.color.braze_orange))
            .setContentTitle(title.ifBlank { BuildConfig.DEMO_PACK_NAME })
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .build()
        NotificationManagerCompat.from(this).notify(FOREGROUND_NOTIFICATION_TAG, "diagnostic|$title|$body".hashCode(), notification)
        appendLog("Displayed diagnostics-only native push preview.")
        postLauncherTelemetry(
            type = "push_preview",
            label = "Diagnostics push preview displayed",
            status = "info",
            payload = JSONObject()
                .put("title", title)
                .put("body", body)
                .put("deeplink", uri ?: JSONObject.NULL)
                .put("displayMode", "native_diagnostics_preview")
                .put("displayChannelId", channelId)
                .put("diagnostics", deviceDiagnosticsPayload()),
        )
    }

    private fun canPostNotifications(): Boolean =
        pushPermissionState() == "granted" && NotificationManagerCompat.from(this).areNotificationsEnabled()

    private fun internalRouteFromUri(uri: String): String? {
        val trimmed = uri.trim()
        if (trimmed.isBlank() || trimmed.any { it.code < 0x20 }) return null
        val route = when {
            trimmed.startsWith("/") -> trimmed
            trimmed.startsWith("#/") -> trimmed.removePrefix("#")
            else -> {
                val parsed = runCatching { Uri.parse(trimmed) }.getOrNull() ?: return null
                if (!parsed.scheme.equals(APP_DEEP_LINK_SCHEME, ignoreCase = true)) return null
                if (!parsed.host.equals(APP_ROUTE_HOST, ignoreCase = true)) return null
                val path = parsed.path?.takeIf { it.isNotBlank() } ?: "/"
                val query = parsed.encodedQuery?.let { "?$it" }.orEmpty()
                "$path$query"
            }
        }
        return route.takeIf { isSafeInternalRoute(it) }
    }

    private fun isSafeInternalRoute(route: String): Boolean {
        if (!route.startsWith("/") || route.startsWith("//")) return false
        if (route.length > MAX_INTERNAL_ROUTE_LENGTH) return false
        if (route.any { it.code < 0x20 }) return false
        val decodedPath = Uri.decode(route.substringBefore("?").substringBefore("#"))
        if (decodedPath.contains('\\')) return false
        return decodedPath.split('/').none { it == ".." }
    }

    private fun configureDeepLinkRouting() {
        val defaultHandler = BrazeDeeplinkHandler()
        BrazeDeeplinkHandler.setBrazeDeeplinkHandler(
            object : IBrazeDeeplinkHandler {
                override fun gotoUri(context: Context, uriAction: UriAction) {
                    val uri = uriAction.uri.toString()
                    if (internalRouteFromUri(uri) != null) {
                        bringAppTaskToForeground("braze_deeplink_handler")
                        forwardInternalRoute(uri, "braze_deeplink_handler", closeInAppMessage = true)
                        return
                    }
                    defaultHandler.gotoUri(context, uriAction)
                }

                override fun getIntentFlags(intentFlagPurpose: IBrazeDeeplinkHandler.IntentFlagPurpose): Int =
                    defaultHandler.getIntentFlags(intentFlagPurpose)

                override fun createUriActionFromUrlString(
                    url: String,
                    extras: Bundle?,
                    openInWebView: Boolean,
                    channel: Channel,
                ): UriAction? =
                    defaultHandler.createUriActionFromUrlString(url, extras, openInWebView, channel)

                override fun createUriActionFromUri(
                    uri: Uri,
                    extras: Bundle?,
                    openInWebView: Boolean,
                    channel: Channel,
                ): UriAction =
                    defaultHandler.createUriActionFromUri(uri, extras, openInWebView, channel)
            },
        )
    }

    private fun configureInAppMessageNavigation() {
        val manager = BrazeInAppMessageManager.getInstance()
        manager.setCustomInAppMessageManagerListener(
            object : DefaultInAppMessageManagerListener() {
                override fun onInAppMessageClicked(inAppMessage: IInAppMessage): Boolean {
                    val uri = inAppMessage.uri ?: return false
                    return forwardInAppMessageUri(uri, inAppMessage.clickAction, "message")
                }

                override fun onInAppMessageButtonClicked(inAppMessage: IInAppMessage, button: MessageButton): Boolean {
                    val uri = button.uri ?: return false
                    return forwardInAppMessageUri(uri, button.clickAction, "button:${button.text}")
                }
            },
        )
        manager.setCustomHtmlInAppMessageActionListener(
            object : IHtmlInAppMessageActionListener {
                override fun onOtherUrlAction(inAppMessage: IInAppMessage, url: String, queryBundle: Bundle): Boolean =
                    forwardInAppMessageUri(url, "html")
            },
        )
    }

    private fun forwardInAppMessageUri(uri: Uri, clickAction: ClickAction, source: String): Boolean {
        if (clickAction != ClickAction.URI) return false
        return forwardInAppMessageUri(uri.toString(), source)
    }

    private fun forwardInAppMessageUri(uri: String, source: String): Boolean {
        val route = internalRouteFromUri(uri) ?: return false
        forwardInternalRoute(uri, "iam", closeInAppMessage = true)
        postLauncherTelemetry(
            type = "bridge_action",
            label = "Forwarded IAM deep link",
            status = "success",
            payload = JSONObject()
                .put("route", route)
                .put("uri", uri)
                .put("source", source),
        )
        return true
    }

    private fun sendCachedContentCards() {
        val braze = brazeOrNull() ?: return
        handleContentCards(braze.getCachedContentCards() ?: emptyList())
    }

    private fun refreshPushReadiness(reason: String = "manual") {
        refreshTrustDiagnostics("push_readiness:$reason")
        sendFcmTokenToBraze(reason = reason, attempt = 0)
    }

    private fun refreshTrustDiagnostics(reason: String = "manual") {
        val checks = listOf(
            "braze_images" to "https://braze-images.com/",
            "firebase_installations" to "https://firebaseinstallations.googleapis.com/",
        )
        Thread {
            val results = JSONArray()
            var allOk = true
            checks.forEach { (name, url) ->
                val result = JSONObject()
                    .put("name", name)
                    .put("url", url)
                runCatching {
                    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                        requestMethod = "GET"
                        connectTimeout = HTTPS_DIAGNOSTIC_TIMEOUT_MS
                        readTimeout = HTTPS_DIAGNOSTIC_TIMEOUT_MS
                        instanceFollowRedirects = false
                    }
                    val statusCode = connection.responseCode
                    runCatching { connection.inputStream?.close() }
                    runCatching { connection.errorStream?.close() }
                    connection.disconnect()
                    result
                        .put("ok", true)
                        .put("statusCode", statusCode)
                }.onFailure {
                    allOk = false
                    result
                        .put("ok", false)
                        .put("errorType", it.javaClass.simpleName)
                        .put("error", it.message ?: "unknown")
                }
                results.put(result)
            }
            val payload = JSONObject()
                .put("reason", reason)
                .put("ready", allOk)
                .put("sdkDeviceId", sdkDeviceId())
                .put("externalId", currentSdkExternalId.ifBlank { activeExternalId() })
                .put("checks", results)
            Handler(Looper.getMainLooper()).post {
                lastTrustDiagnostics = payload
                appendLog(if (allOk) "HTTPS trust diagnostics passed." else "HTTPS trust diagnostics failed.")
                postLauncherTelemetry(
                    type = "trust_diagnostics",
                    label = "Android HTTPS trust diagnostics",
                    status = if (allOk) "success" else "error",
                    payload = payload,
                )
                refreshDebugDrawer()
            }
        }.start()
    }

    private fun sendFcmTokenToBraze(reason: String, attempt: Int) {
        if (fcmTokenRequestInFlight) return
        fcmTokenRequestInFlight = true
        runCatching {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                fcmTokenRequestInFlight = false
                if (!task.isSuccessful) {
                    val error = task.exception?.message ?: "unknown error"
                    val retry = attempt < FCM_TOKEN_MAX_RETRIES && error.contains("SERVICE_NOT_AVAILABLE", ignoreCase = true)
                    appendLog("FCM token failed: $error${if (retry) " (retry ${attempt + 1})" else ""}")
                    postLauncherTelemetry(
                        type = "fcm_token",
                        label = if (retry) "FCM token retry scheduled" else "FCM token failed",
                        status = if (retry) "warning" else "error",
                        payload = pushDiagnosticsPayload()
                            .put("reason", reason)
                            .put("attempt", attempt)
                            .put("retryScheduled", retry),
                        result = JSONObject().put("error", error),
                    )
                    if (retry) {
                        pushRetryHandler.postDelayed({
                            sendFcmTokenToBraze(reason = reason, attempt = attempt + 1)
                        }, FCM_TOKEN_RETRY_DELAYS_MS.getOrElse(attempt) { FCM_TOKEN_RETRY_DELAYS_MS.last() })
                    }
                    refreshDebugDrawer()
                    return@addOnCompleteListener
                }
                val token = task.result.orEmpty()
                if (token == currentFcmToken) {
                    refreshDebugDrawer()
                    return@addOnCompleteListener
                }
                currentFcmToken = token
                brazeOrNull()?.let { braze ->
                    braze.registeredPushToken = token
                    braze.requestImmediateDataFlush()
                }
                appendLog("FCM token registered with Braze: ${token.take(18)}...")
                postLauncherTelemetry(
                    type = "fcm_token",
                    label = "FCM token registered",
                    status = "success",
                    payload = pushDiagnosticsPayload()
                        .put("preview", "${token.take(18)}...")
                        .put("reason", reason)
                        .put("attempt", attempt),
                )
                refreshDebugDrawer()
            }
        }.onFailure {
            fcmTokenRequestInFlight = false
            appendLog("FCM unavailable: ${it.message}")
            postLauncherTelemetry(
                type = "fcm_token",
                label = "FCM unavailable",
                status = "error",
                payload = pushDiagnosticsPayload().put("reason", reason).put("attempt", attempt),
                result = JSONObject().put("error", it.message ?: "unknown"),
            )
        }
    }

    private fun handleDemoCommandIntent(intent: Intent?) {
        if (intent?.action != ACTION_DEMO_COMMAND) return
        val encoded = intent.getStringExtra(EXTRA_COMMAND).orEmpty()
        if (encoded.isBlank()) {
            appendLog("Demo command skipped: missing payload.")
            return
        }

        runCatching {
            val raw = String(Base64.decode(encoded, Base64.DEFAULT), Charsets.UTF_8)
            executeDemoCommand(JSONObject(raw))
        }.onFailure {
            appendLog("Demo command failed: ${it.message}")
            postLauncherTelemetry(
                type = "demo_command",
                label = "Demo command failed",
                status = "error",
                result = JSONObject().put("error", it.message ?: "unknown"),
            )
        }
    }

    private fun executeDemoCommand(command: JSONObject) {
        val action = command.optString("action")
        val externalId = command.optString("externalId").ifBlank { activeExternalId() }
        val payload = command.optJSONObject("payload") ?: JSONObject()
        val callbackUrl = command.optString("callbackUrl")
        val needsBraze = action in setOf(
            "changeUser",
            "logCustomEvent",
            "setCustomAttribute",
            "logPurchase",
            "requestContentCardsRefresh",
            "requestPushReadiness",
        )
        if (needsBraze && brazeOrNull() == null) {
            throw IllegalStateException("Braze is not configured for the active Android profile")
        }

        val commandSync = syncEnvelope(authority = "control_room", reason = "command")

        if (externalId.isNotBlank() && action != "changeUser") {
            changeUser(externalId, commandSync)
        }

        when (action) {
            "changeUser" -> changeUser(externalId, commandSync, payload.optString("displayName"))
            "logCustomEvent" -> {
                val name = payload.optString("name")
                if (name.isBlank()) throw IllegalArgumentException("Missing event name")
                logCustomEvent(name, payload.optJSONObject("properties"))
            }
            "setCustomAttribute" -> {
                val attributes = payload.optJSONObject("attributes")
                if (attributes != null) {
                    attributes.keys().forEach { key -> setCustomAttribute(key, attributes.opt(key)) }
                } else {
                    val key = payload.optString("key")
                    if (key.isBlank()) throw IllegalArgumentException("Missing attribute key")
                    setCustomAttribute(key, payload.opt("value"))
                }
            }
            "logPurchase" -> logPurchase(payload)
            "requestContentCardsRefresh" -> refreshContentCards()
            "requestPushPermission" -> requestNotificationPermission()
            "requestPushReadiness" -> refreshPushReadiness(payload.optString("reason").ifBlank { "command" })
            "requestTrustDiagnostics" -> refreshTrustDiagnostics(payload.optString("reason").ifBlank { "command" })
            "navigate" -> sendNavigation(payload.optString("route").ifBlank { payload.optString("uri") }, "control_room")
            "foregroundPush" -> showDiagnosticPushPreview(
                title = payload.optString("title", BuildConfig.DEMO_PACK_NAME),
                body = payload.optString("body"),
                uri = payload.optString("uri").ifBlank { null },
            )
            else -> throw IllegalArgumentException("Unsupported demo command action: $action")
        }

        postLauncherTelemetry(
            type = "demo_command",
            label = "Executed Android demo command",
            status = "success",
            externalId = externalId,
            payload = command,
            result = JSONObject().put("sync", commandSync),
            callbackUrl = callbackUrl,
        )
    }

    private fun postLauncherTelemetry(
        type: String,
        label: String,
        status: String,
        externalId: String = currentSdkExternalId.ifBlank { activeExternalId() },
        payload: Any? = JSONObject(),
        result: Any? = null,
        callbackUrl: String = "",
    ) {
        val target = callbackUrl.ifBlank { BuildConfig.LAUNCHER_CALLBACK_URL }.trim()
        if (target.isBlank()) return
        val body = JSONObject()
            .put("platform", "android")
            .put("type", type)
            .put("label", label)
            .put("status", status)
            .put("externalId", externalId)
            .put("payload", payload ?: JSONObject.NULL)
        if (result != null) body.put("result", result)

        Thread {
            runCatching {
                val connection = (URL(target).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 1500
                    readTimeout = 1500
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                }
                connection.outputStream.use { stream ->
                    stream.write(body.toString().toByteArray(Charsets.UTF_8))
                }
                runCatching { connection.inputStream.close() }
                connection.disconnect()
            }.onFailure {
                Log.d(TAG, "Launcher telemetry failed: ${it.message}")
            }
        }.start()
    }

    private fun showDebugDrawer() {
        val dialog = Dialog(this)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 22, 24, 24)
            setBackgroundColor(Color.WHITE)
        }
        content.addView(TextView(this).apply {
            text = "Android Debug"
            textSize = 19f
            setTextColor(0xFF111827.toInt())
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        })
        content.addView(TextView(this).apply {
            text = debugSummary()
            textSize = 12f
            setTextColor(0xFF6B7280.toInt())
            setPadding(0, 8, 0, 14)
        })

        val row1 = buttonRow(
            button("IAM Event") { logCustomEvent("demo_iam_trigger", JSONObject().put("source", "android_debug_drawer")) },
            button("Cards") { refreshContentCards() },
            button("Push") { requestNotificationPermission() },
        )
        val row2 = buttonRow(
            button("FCM Copy") { copyFcmToken() },
            button("Profile") {
                sendConnectionToWeb()
                sendToWeb("profiles", store.profilesPayload())
            },
            button("Close") { dialog.dismiss() },
        )
        content.addView(row1)
        content.addView(row2)

        debugLogView = TextView(this).apply {
            textSize = 11f
            setTextColor(0xFF111827.toInt())
            setPadding(0, 14, 0, 0)
            text = debugLog.joinToString("\n")
        }
        content.addView(debugLogView)

        val scroll = ScrollView(this)
        scroll.addView(content)
        dialog.setContentView(scroll)
        dialog.window?.apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            setGravity(Gravity.BOTTOM)
            setLayout(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        dialog.setOnDismissListener { debugLogView = null }
        dialog.show()
        dialog.window?.setLayout(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    }

    private fun refreshDebugDrawer() {
        debugLogView?.text = debugLog.joinToString("\n")
    }

    private fun debugSummary(): String {
        val profile = store.activeProfile
        val token = currentFcmToken?.take(24)?.plus("...") ?: "pending"
        return buildString {
            append("Demo: ${BuildConfig.DEMO_PACK_NAME} (${BuildConfig.DEMO_PACK_ID})\n")
            append("Hash: ${BuildConfig.DEMO_CONFIG_HASH.ifBlank { "-" }}\n")
            append("Source: ${BuildConfig.DEMO_SOURCE_MODE} -> ${activeWebUrl()}\n")
            append("Override: ${if (isWebSourceOverrideActive()) "active" else "off"}\n")
            append("Profile: ${profile?.name ?: "none"}\n")
            append("Endpoint: ${profile?.endpoint ?: "-"}\n")
            append("External ID: ${profile?.externalId ?: CredentialStore.DEFAULT_EXTERNAL_ID}\n")
            append("Push permission: ${pushPermissionState()}\n")
            append("FCM token: $token")
        }
    }

    private fun button(label: String, action: () -> Unit): Button =
        Button(this).apply {
            text = label
            textSize = 12f
            isAllCaps = false
            setOnClickListener { action() }
        }

    private fun buttonRow(vararg buttons: Button): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            buttons.forEach { button ->
                addView(button, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    marginEnd = 8
                })
            }
        }

    private fun copyFcmToken() {
        val token = currentFcmToken
        if (token.isNullOrBlank()) {
            Toast.makeText(this, "FCM token is not ready yet.", Toast.LENGTH_SHORT).show()
            return
        }
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("FCM token", token))
        Toast.makeText(this, "FCM token copied.", Toast.LENGTH_SHORT).show()
    }

    private fun restartForProfileChange(previous: CredentialProfile?, next: CredentialProfile) {
        if (previous?.apiKey == next.apiKey && previous.endpoint == next.endpoint) {
            changeUser(next.externalId, syncEnvelope(authority = "native", reason = "profile_select"))
            webBridgeReady = false
            lastDeliveredContentCardsPayload = null
            webView.loadUrl(activeWebUrl())
            return
        }

        appendLog("Restarting app to apply Braze workspace.")
        Toast.makeText(this, "Restarting to apply Braze workspace.", Toast.LENGTH_SHORT).show()
        Handler(Looper.getMainLooper()).postDelayed({
            val intent = packageManager.getLaunchIntentForPackage(packageName)
                ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            if (intent != null) startActivity(intent)
            finishAffinity()
            Runtime.getRuntime().exit(0)
        }, 650)
    }

    private fun activeWebUrl(): String {
        val raw = store.activeProfile?.webURL?.takeIf { it.isNotBlank() } ?: CredentialStore.DEFAULT_WEB_URL
        val safeRaw = raw.takeIf { CredentialProfile.isAllowedLocalWebUrl(it) } ?: CredentialStore.DEFAULT_WEB_URL
        return when {
            safeRaw.startsWith("http://localhost") -> safeRaw.replace("http://localhost", "http://10.0.2.2")
            safeRaw.startsWith("http://127.0.0.1") -> safeRaw.replace("http://127.0.0.1", "http://10.0.2.2")
            else -> safeRaw
        }
    }

    private fun isWebSourceOverrideActive(): Boolean =
        store.activeProfile?.webURL?.takeIf { CredentialProfile.isAllowedLocalWebUrl(it) }?.isNotBlank() == true

    private fun runtimePayload(): JSONObject =
        JSONObject()
            .put("schemaVersion", 1)
            .put("id", BuildConfig.DEMO_PACK_ID)
            .put("name", BuildConfig.DEMO_PACK_NAME)
            .put("configHash", BuildConfig.DEMO_CONFIG_HASH)
            .put("generatedAt", BuildConfig.DEMO_GENERATED_AT)
            .put("sourceMode", BuildConfig.DEMO_SOURCE_MODE)
            .put("deviceId", sdkDeviceId())
            .put("externalId", currentSdkExternalId.ifBlank { activeExternalId() })
            .put("pushPermission", pushPermissionState())
            .put("pushTokenPresent", !currentFcmToken.isNullOrBlank())
            .put("trustReady", lastTrustDiagnostics?.optBoolean("ready") ?: false)
            .put("contentCardCount", lastContentCardCount)
            .put("expectedSources", JSONObject()
                .put("browser", BuildConfig.DEMO_BROWSER_URL)
                .put("android", BuildConfig.DEMO_ANDROID_URL)
                .put("ios", BuildConfig.DEMO_IOS_URL))

    private fun syncEnvelope(authority: String, reason: String): JSONObject =
        JSONObject()
            .put("protocol", SYNC_PROTOCOL)
            .put("sessionId", syncSessionId)
            .put("runtimeId", BuildConfig.DEMO_PACK_ID)
            .put("configHash", BuildConfig.DEMO_CONFIG_HASH)
            .put("authority", authority)
            .put("reason", reason)
            .put("timestamp", System.currentTimeMillis())

    private fun syncSignature(externalId: String, sync: JSONObject): String =
        listOf(
            externalId,
            sync.optString("protocol", SYNC_PROTOCOL),
            sync.optString("sessionId", syncSessionId),
            sync.optString("runtimeId", BuildConfig.DEMO_PACK_ID),
            sync.optString("configHash", BuildConfig.DEMO_CONFIG_HASH),
            sync.optString("authority"),
            sync.optString("reason"),
        ).joinToString("|")

    private fun activeExternalId(): String =
        store.activeProfile?.externalId?.takeIf { it.isNotBlank() } ?: CredentialStore.DEFAULT_EXTERNAL_ID

    private fun brazeOrNull(): Braze? {
        val profile = store.activeProfile ?: return null
        if (profile.apiKey.isBlank() || profile.endpoint.isBlank()) return null
        return runCatching { Braze.getInstance(applicationContext) }.getOrNull()
    }

    private fun sdkDeviceId(): String =
        runCatching { brazeOrNull()?.deviceId.orEmpty() }.getOrDefault("")

    private fun pushPermissionState(): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return "granted"
        return if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            "granted"
        } else {
            "default"
        }
    }

    private fun maybeRequestNotificationsOnLaunch() {
        Handler(Looper.getMainLooper()).postDelayed({
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                postLauncherTelemetry(
                    type = "push_permission",
                    label = "Notification permission already granted",
                    status = "success",
                    payload = pushDiagnosticsPayload().put("autoLaunch", true),
                )
                return@postDelayed
            }
            if (pushPermissionState() == "granted") {
                postLauncherTelemetry(
                    type = "push_permission",
                    label = "Notification permission already granted",
                    status = "success",
                    payload = pushDiagnosticsPayload().put("autoLaunch", true),
                )
                return@postDelayed
            }
            val prefs = getSharedPreferences(DEMO_PREFS, Context.MODE_PRIVATE)
            if (prefs.getBoolean(AUTO_PUSH_PROMPT_ATTEMPTED_KEY, false)) {
                postLauncherTelemetry(
                    type = "push_permission",
                    label = "Notification permission not granted",
                    status = "info",
                    payload = pushDiagnosticsPayload().put("autoLaunch", true).put("promptAlreadyAttempted", true),
                )
                return@postDelayed
            }
            prefs.edit().putBoolean(AUTO_PUSH_PROMPT_ATTEMPTED_KEY, true).apply()
            postLauncherTelemetry(
                type = "push_permission",
                label = "Requesting notification permission on launch",
                status = "info",
                payload = pushDiagnosticsPayload().put("autoLaunch", true),
            )
            requestNotificationPermission()
        }, 900)
    }

    private fun pushDiagnosticsPayload(includeLastPush: Boolean = true): JSONObject {
        val defaultChannelId = getString(R.string.default_notification_channel_id)
        val highChannelId = getString(R.string.high_visibility_notification_channel_id)
        val brazeDefaultChannelId = BRAZE_SDK_DEFAULT_CHANNEL_ID
        val notificationsEnabled = NotificationManagerCompat.from(this).areNotificationsEnabled()
        val preferredChannel = channelDiagnostics(highChannelId)
        val lastRequestedChannelId = lastPushDiagnostics?.optString("notificationChannelId")?.takeIf { it.isNotBlank() }
        val lastDisplayChannelId = lastPushDiagnostics?.optString("displayChannelId")?.takeIf { it.isNotBlank() }
        val activeChannelId = lastDisplayChannelId ?: lastRequestedChannelId
            ?: highChannelId
        val activeChannel = channelDiagnostics(activeChannelId)
        val activeChannelImportance = activeChannel.opt("importance")
        val activeChannelBlocked = activeChannel.optBoolean("blocked", false)
        val lastPushUsesHighVisibilityChannel = lastRequestedChannelId.isNullOrBlank() || lastRequestedChannelId == highChannelId
        val lastPushChannelWarning = if (!lastPushUsesHighVisibilityChannel) {
            "Last Braze push requested Android channel $lastRequestedChannelId. Select $highChannelId in Braze for heads-up and lock-screen demo behavior."
        } else {
            null
        }
        return JSONObject()
            .put("permission", pushPermissionState())
            .put("notificationsEnabled", notificationsEnabled)
            .put("notificationChannelsSupported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            .put("defaultChannelId", defaultChannelId)
            .put("highVisibilityChannelId", highChannelId)
            .put("brazeDefaultChannelId", brazeDefaultChannelId)
            .put("activeChannelId", activeChannelId)
            .put("channelName", activeChannel.opt("name"))
            .put("channelImportance", activeChannelImportance)
            .put("channelBlocked", activeChannelBlocked)
            .put("preferredChannelImportance", preferredChannel.opt("importance"))
            .put("preferredChannelBlocked", preferredChannel.optBoolean("blocked", false))
            .put("lastPushUsesHighVisibilityChannel", lastPushUsesHighVisibilityChannel)
            .put("lastPushChannelWarning", lastPushChannelWarning ?: JSONObject.NULL)
            .put("channels", JSONArray()
                .put(channelDiagnostics(defaultChannelId))
                .put(preferredChannel)
                .put(channelDiagnostics(brazeDefaultChannelId)))
            .apply {
                if (includeLastPush) put("lastPush", lastPushDiagnostics ?: JSONObject.NULL)
            }
            .put("lifecycleState", if (isActivityForeground) "foreground" else "background")
            .put("tokenPresent", !currentFcmToken.isNullOrBlank())
            .put("tokenPreview", currentFcmToken?.take(18)?.plus("...") ?: JSONObject.NULL)
            .put("firebaseSenderConfigured", BuildConfig.FIREBASE_SENDER_ID.isNotBlank())
            .put("sdkDeviceId", sdkDeviceId())
            .put("externalId", currentSdkExternalId.ifBlank { activeExternalId() })
    }

    private fun channelDiagnostics(channelId: String): JSONObject {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return JSONObject()
                .put("id", channelId)
                .put("supported", false)
                .put("exists", false)
                .put("importance", JSONObject.NULL)
                .put("blocked", false)
        }
        val channel = getSystemService(NotificationManager::class.java).getNotificationChannel(channelId)
        return JSONObject()
            .put("id", channelId)
            .put("supported", true)
            .put("exists", channel != null)
            .put("name", channel?.name?.toString() ?: JSONObject.NULL)
            .put("importance", channel?.importance ?: JSONObject.NULL)
            .put("blocked", channel?.importance == NotificationManager.IMPORTANCE_NONE)
    }

    private fun pushEventDiagnostics(payload: BrazeNotificationPayload): JSONObject =
        JSONObject()
            .put("receivedAt", System.currentTimeMillis())
            .put("title", payload.titleText ?: JSONObject.NULL)
            .put("bodyPresent", !payload.contentText.isNullOrBlank())
            .put("deeplink", payload.deeplink ?: JSONObject.NULL)
            .put("notificationChannelId", payload.notificationChannelId ?: JSONObject.NULL)
            .put("campaignId", payload.campaignId ?: JSONObject.NULL)
            .put("pushUniqueId", payload.pushUniqueId ?: JSONObject.NULL)
            .put("customNotificationId", payload.customNotificationId ?: JSONObject.NULL)
            .put("lifecycleState", if (isActivityForeground) "foreground" else "background")

    private fun foregroundNotificationChannelId(): String =
        getString(R.string.high_visibility_notification_channel_id)

    private fun deviceDiagnosticsPayload(includeLastPush: Boolean = true): JSONObject =
        JSONObject()
            .put("platform", "android")
            .put("sdkDeviceId", sdkDeviceId())
            .put("externalId", currentSdkExternalId.ifBlank { activeExternalId() })
            .put("push", pushDiagnosticsPayload(includeLastPush = includeLastPush))
            .put("trust", lastTrustDiagnostics ?: JSONObject.NULL)
            .put("contentCardCount", lastContentCardCount)

    private fun propertiesFromJson(json: JSONObject?): BrazeProperties? {
        if (json == null) return null
        return BrazeProperties(json)
    }

    private fun sendToWebRaw(action: String, rawJson: String) {
        val script = "window.__brazeBridge && window.__brazeBridge.receive(${JSONObject.quote(action)}, $rawJson);"
        if (::webView.isInitialized) {
            webView.post { webView.evaluateJavascript(script, null) }
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        val defaultChannel = NotificationChannel(
            getString(R.string.default_notification_channel_id),
            getString(R.string.default_notification_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = getString(R.string.default_notification_channel_description)
        }
        val highVisibilityChannel = NotificationChannel(
            getString(R.string.high_visibility_notification_channel_id),
            getString(R.string.high_visibility_notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = getString(R.string.high_visibility_notification_channel_description)
            enableVibration(true)
        }
        manager.createNotificationChannels(listOf(defaultChannel, highVisibilityChannel))
    }

    private companion object {
        private const val TAG = "BrazeDemoShell"
        private const val NOTIFICATION_PERMISSION_REQUEST = 4401
        private const val BRAND_NEUTRAL_LINE = 0xFFE5E7EB.toInt()
        private const val ACTION_DEMO_COMMAND = "com.braze.demoshell.DEMO_COMMAND"
        private const val EXTRA_COMMAND = "command"
        private const val SYNC_PROTOCOL = "braze-demo-sync/v1"
        private const val DEMO_PREFS = "braze.demo.runtime"
        private const val AUTO_PUSH_PROMPT_ATTEMPTED_KEY = "autoPushPromptAttempted"
        private const val ACTION_NOTIFICATION_OPENED = "com.braze.demoshell.NOTIFICATION_OPENED"
        private const val EXTRA_NOTIFICATION_URI = "notification_uri"
        private const val FOREGROUND_NOTIFICATION_TAG = "braze_demo_foreground_push"
        private const val BRAZE_SDK_DEFAULT_CHANNEL_ID = "com_appboy_default_notification_channel"
        private const val APP_DEEP_LINK_SCHEME = "braze-demo"
        private const val APP_ROUTE_HOST = "route"
        private const val MAX_INTERNAL_ROUTE_LENGTH = 2048
        private const val PUSH_FOREGROUND_DEDUPE_MS = 1_000L
        private const val FCM_TOKEN_MAX_RETRIES = 4
        private const val HTTPS_DIAGNOSTIC_TIMEOUT_MS = 3_000
        private val FCM_TOKEN_RETRY_DELAYS_MS = longArrayOf(2_000L, 5_000L, 10_000L, 20_000L)
        private val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.US)
    }
}
