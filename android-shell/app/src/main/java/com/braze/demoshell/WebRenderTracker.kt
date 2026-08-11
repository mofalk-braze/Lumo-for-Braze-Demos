package com.braze.demoshell

internal data class WebSourceTransition(
    val expectedUrl: String,
    val expectedOverride: Boolean,
    val callbackUrl: String,
    val launcherInstanceId: String,
    val executionId: String,
    val action: String,
)

internal sealed interface WebRenderSignal {
    data class Ready(
        val sourceUrl: String,
        val generation: Long,
        val transition: WebSourceTransition?,
    ) : WebRenderSignal

    data class Failed(
        val sourceUrl: String,
        val generation: Long,
        val error: String,
        val transition: WebSourceTransition?,
    ) : WebRenderSignal
}

/**
 * Main-thread state machine for proving that a WebView source rendered.
 *
 * Neither navigation completion nor the JavaScript bridge handshake is enough
 * by itself. A generation is ready only after both signals report the same
 * canonical source URL. Correlated source transitions are kept in memory so a
 * process/activity restart fails closed instead of replaying stale evidence.
 */
internal class WebRenderTracker {
    private data class Observation(
        val generation: Long,
        val sourceUrl: String,
    )

    private var generation = 0L
    private var pageFinished: Observation? = null
    private var bridgeReady: Observation? = null
    private var failedGeneration = -1L
    private var reportedGeneration = -1L
    private var pendingTransition: WebSourceTransition? = null

    fun onPageStarted() {
        generation += 1
        pageFinished = null
        bridgeReady = null
        failedGeneration = -1L
    }

    fun onPageFinished(sourceUrl: String): List<WebRenderSignal> {
        if (pendingTransition == null && reportedGeneration == generation) return emptyList()
        pageFinished = Observation(generation, canonicalWebSourceUrl(sourceUrl))
        return completionSignal()?.let(::listOf).orEmpty()
    }

    fun onBridgeReady(sourceUrl: String): List<WebRenderSignal> {
        if (pendingTransition == null && reportedGeneration == generation) return emptyList()
        bridgeReady = Observation(generation, canonicalWebSourceUrl(sourceUrl))
        return completionSignal()?.let(::listOf).orEmpty()
    }

    fun onBridgeRejected(sourceUrl: String, error: String): List<WebRenderSignal> {
        if (pendingTransition == null && reportedGeneration == generation) return emptyList()
        return listOf(
            failCurrentGeneration(
                sourceUrl = canonicalWebSourceUrl(sourceUrl),
                error = error,
                transition = pendingTransition,
            ),
        )
    }

    fun beginTransition(transition: WebSourceTransition): List<WebRenderSignal> {
        val canonical = transition.copy(expectedUrl = canonicalWebSourceUrl(transition.expectedUrl))
        val signals = mutableListOf<WebRenderSignal>()
        pendingTransition?.let { previous ->
            if (previous.executionId != canonical.executionId || previous.launcherInstanceId != canonical.launcherInstanceId) {
                signals += WebRenderSignal.Failed(
                    sourceUrl = previous.expectedUrl,
                    generation = generation,
                    error = "Web source transition was superseded by a newer command.",
                    transition = previous,
                )
            }
        }
        pendingTransition = canonical
        val finished = pageFinished
        val bridged = bridgeReady
        val alreadyRenderedExpectedSource =
            failedGeneration != generation &&
                finished?.generation == generation &&
                bridged?.generation == generation &&
                finished.sourceUrl == canonical.expectedUrl &&
                bridged.sourceUrl == canonical.expectedUrl
        if (alreadyRenderedExpectedSource) completionSignal()?.let(signals::add)
        return signals
    }

    fun onMainFrameFailed(sourceUrl: String, error: String): List<WebRenderSignal> {
        if (pendingTransition == null && reportedGeneration == generation) return emptyList()
        val canonical = canonicalWebSourceUrl(sourceUrl)
        val transition = pendingTransition
        if (transition != null && canonical != transition.expectedUrl) return emptyList()

        failedGeneration = generation
        pageFinished = null
        bridgeReady = null
        pendingTransition = null
        return listOf(
            WebRenderSignal.Failed(
                sourceUrl = canonical,
                generation = generation,
                error = error,
                transition = transition,
            ),
        )
    }

    private fun completionSignal(): WebRenderSignal? {
        if (failedGeneration == generation) return null
        val finished = pageFinished ?: return null
        val bridged = bridgeReady ?: return null
        if (finished.generation != generation || bridged.generation != generation) return null

        val transition = pendingTransition
        // Once an ordinary generation has been reported, late/reordered WebView
        // callbacks from that same generation are stale evidence. Ignore them
        // before evaluating URL agreement so they cannot replace a valid Ready
        // observation with an uncorrelated failure.
        if (transition == null && reportedGeneration == generation) return null
        if (finished.sourceUrl.isBlank() || finished.sourceUrl != bridged.sourceUrl) {
            return failCurrentGeneration(
                sourceUrl = finished.sourceUrl,
                error = "WebView completion and webReady reported different source URLs.",
                transition = transition,
            )
        }
        if (transition != null) {
            if (finished.sourceUrl != transition.expectedUrl) {
                return failCurrentGeneration(
                    sourceUrl = finished.sourceUrl,
                    error = "Rendered source did not match the requested source URL.",
                    transition = transition,
                )
            }
            pendingTransition = null
            reportedGeneration = generation
            return WebRenderSignal.Ready(finished.sourceUrl, generation, transition)
        }
        reportedGeneration = generation
        return WebRenderSignal.Ready(finished.sourceUrl, generation, null)
    }

    private fun failCurrentGeneration(
        sourceUrl: String,
        error: String,
        transition: WebSourceTransition?,
    ): WebRenderSignal.Failed {
        failedGeneration = generation
        pendingTransition = null
        return WebRenderSignal.Failed(
            sourceUrl = sourceUrl,
            generation = generation,
            error = error,
            transition = transition,
        )
    }
}

/**
 * Canonical *document* identity used for source confirmation.
 *
 * The web app routes through the URL fragment, which the bundled
 * `file:///android_asset/demo/index.html` asset requires. So `onPageFinished`
 * observes the bare document while `webReady` observes the routed URL
 * (`…/index.html#/map`), and an in-app deep link changes only the fragment.
 * All of those are the same rendered document, so the fragment is dropped here
 * — otherwise routing away from the entry screen, including any deep link from
 * a push, in-app message, or Content Card, would read as a source mismatch and
 * block live controls. The fully routed URL stays visible in device telemetry.
 */
internal fun canonicalWebSourceUrl(raw: String): String {
    val value = raw.trim().substringBefore('#')
    if ((value.startsWith("http://", ignoreCase = true) || value.startsWith("https://", ignoreCase = true)) &&
        !value.contains('?')
    ) {
        return value.trimEnd('/')
    }
    return value
}
