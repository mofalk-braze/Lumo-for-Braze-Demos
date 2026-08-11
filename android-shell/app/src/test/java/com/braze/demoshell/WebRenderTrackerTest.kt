package com.braze.demoshell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WebRenderTrackerTest {
    @Test
    fun `readiness waits for page finish and same-generation bridge proof`() {
        val tracker = WebRenderTracker()
        tracker.onPageStarted()

        assertTrue(tracker.onPageFinished(SOURCE_A).isEmpty())
        val ready = tracker.onBridgeReady("$SOURCE_A/").single() as WebRenderSignal.Ready

        assertEquals(SOURCE_A, ready.sourceUrl)
        assertEquals(1L, ready.generation)
        assertEquals(null, ready.transition)
    }

    @Test
    fun `page and bridge URL mismatch fails the generation`() {
        val tracker = WebRenderTracker()
        tracker.onPageStarted()
        assertTrue(tracker.onPageFinished(SOURCE_A).isEmpty())

        val failed = tracker.onBridgeReady(SOURCE_B).single() as WebRenderSignal.Failed

        assertEquals(SOURCE_A, failed.sourceUrl)
        assertTrue(failed.error.contains("different source URLs"))
        assertTrue(tracker.onBridgeReady(SOURCE_A).isEmpty())
    }

    @Test
    fun `rejected bridge identity fails the current generation`() {
        val tracker = WebRenderTracker()
        tracker.onPageStarted()
        assertTrue(tracker.onPageFinished(SOURCE_A).isEmpty())

        val failed = tracker.onBridgeRejected(SOURCE_A, "webReady runtimeHash mismatch").single()
            as WebRenderSignal.Failed

        assertEquals(1L, failed.generation)
        assertTrue(failed.error.contains("runtimeHash"))
        assertTrue(tracker.onBridgeReady(SOURCE_A).isEmpty())
    }

    @Test
    fun `rejected bridge identity keeps transition correlation`() {
        val tracker = WebRenderTracker()
        val transition = transition(expectedUrl = SOURCE_A, executionId = "exec-identity")
        assertTrue(tracker.beginTransition(transition).isEmpty())
        tracker.onPageStarted()

        val failed = tracker.onBridgeRejected(SOURCE_A, "webReady identity mismatch").single()
            as WebRenderSignal.Failed

        assertEquals("exec-identity", failed.transition?.executionId)
    }

    @Test
    fun `rendered source must match the pending transition`() {
        val tracker = WebRenderTracker()
        val transition = transition(expectedUrl = SOURCE_B, executionId = "exec-b")
        assertTrue(tracker.beginTransition(transition).isEmpty())
        tracker.onPageStarted()
        assertTrue(tracker.onPageFinished(SOURCE_A).isEmpty())

        val failed = tracker.onBridgeReady(SOURCE_A).single() as WebRenderSignal.Failed

        assertEquals("exec-b", failed.transition?.executionId)
        assertTrue(failed.error.contains("did not match the requested source URL"))
    }

    @Test
    fun `a ready generation is reported only once`() {
        val tracker = WebRenderTracker()
        tracker.onPageStarted()
        assertTrue(tracker.onBridgeReady(SOURCE_A).isEmpty())
        assertEquals(1, tracker.onPageFinished(SOURCE_A).size)

        assertTrue(tracker.onPageFinished(SOURCE_A).isEmpty())
        assertTrue(tracker.onBridgeReady(SOURCE_A).isEmpty())
    }

    @Test
    fun `late reordered callbacks cannot replace a ready generation with failure`() {
        val tracker = WebRenderTracker()
        tracker.onPageStarted()
        assertTrue(tracker.onPageFinished(SOURCE_A).isEmpty())
        assertEquals(1, tracker.onBridgeReady(SOURCE_A).size)

        assertTrue(tracker.onPageFinished(SOURCE_B).isEmpty())
        assertTrue(tracker.onBridgeReady(SOURCE_B).isEmpty())
        assertTrue(tracker.onMainFrameFailed(SOURCE_B, "late failure").isEmpty())

        val ready = tracker.beginTransition(
            transition(expectedUrl = SOURCE_A, executionId = "exec-after-late-callbacks"),
        ).single() as WebRenderSignal.Ready
        assertEquals("exec-after-late-callbacks", ready.transition?.executionId)
        assertEquals(SOURCE_A, ready.sourceUrl)
    }

    @Test
    fun `a newer transition fails the superseded command and remains pending`() {
        val tracker = WebRenderTracker()
        val first = transition(expectedUrl = SOURCE_A, executionId = "exec-a")
        val second = transition(expectedUrl = SOURCE_B, executionId = "exec-b")
        assertTrue(tracker.beginTransition(first).isEmpty())

        val superseded = tracker.beginTransition(second).single() as WebRenderSignal.Failed
        assertEquals("exec-a", superseded.transition?.executionId)
        assertTrue(superseded.error.contains("superseded"))

        tracker.onPageStarted()
        assertTrue(tracker.onPageFinished(SOURCE_B).isEmpty())
        val ready = tracker.onBridgeReady(SOURCE_B).single() as WebRenderSignal.Ready
        assertEquals("exec-b", ready.transition?.executionId)
    }

    @Test
    fun `a changed-source transition waits for the next rendered generation`() {
        val tracker = WebRenderTracker()
        tracker.onPageStarted()
        assertTrue(tracker.onPageFinished(SOURCE_A).isEmpty())
        assertEquals(1, tracker.onBridgeReady(SOURCE_A).size)

        assertTrue(
            tracker.beginTransition(
                transition(expectedUrl = SOURCE_B, executionId = "exec-changed-source"),
            ).isEmpty(),
        )
        tracker.onPageStarted()
        assertTrue(tracker.onPageFinished(SOURCE_B).isEmpty())
        val ready = tracker.onBridgeReady(SOURCE_B).single() as WebRenderSignal.Ready

        assertEquals("exec-changed-source", ready.transition?.executionId)
        assertEquals(SOURCE_B, ready.sourceUrl)
        assertEquals(2L, ready.generation)
    }

    @Test
    fun `idempotent transition proves the already rendered canonical source`() {
        val tracker = WebRenderTracker()
        tracker.onPageStarted()
        assertTrue(tracker.onPageFinished(SOURCE_A).isEmpty())
        assertEquals(1, tracker.onBridgeReady("$SOURCE_A/").size)

        val ready = tracker.beginTransition(
            transition(expectedUrl = "$SOURCE_A/", executionId = "exec-idempotent"),
        ).single() as WebRenderSignal.Ready

        assertEquals("exec-idempotent", ready.transition?.executionId)
        assertEquals(SOURCE_A, ready.sourceUrl)
    }

    @Test
    fun `a hash-routed bundled asset confirms against the bare document`() {
        val tracker = WebRenderTracker()
        tracker.onPageStarted()

        // onPageFinished sees the document; webReady sees the app's entry route.
        assertTrue(tracker.onPageFinished(BUNDLED_ASSET).isEmpty())
        val ready = tracker.onBridgeReady("$BUNDLED_ASSET#/map").single() as WebRenderSignal.Ready

        assertEquals(BUNDLED_ASSET, ready.sourceUrl)
    }

    @Test
    fun `a deep link into a route is the same rendered document`() {
        val tracker = WebRenderTracker()
        tracker.onPageStarted()
        assertTrue(tracker.onPageFinished("$BUNDLED_ASSET#/map").isEmpty())

        // A push, in-app message, or Content Card deep link only moves the fragment.
        val ready = tracker.onBridgeReady("$BUNDLED_ASSET#/station/demo-location")
            .single() as WebRenderSignal.Ready

        assertEquals(BUNDLED_ASSET, ready.sourceUrl)
    }

    @Test
    fun `distinct dev-server origins still fail regardless of routing`() {
        val tracker = WebRenderTracker()
        tracker.onPageStarted()
        assertTrue(tracker.onPageFinished("$SOURCE_A#/map").isEmpty())

        val failed = tracker.onBridgeReady("$SOURCE_B#/map").single() as WebRenderSignal.Failed

        assertEquals(SOURCE_A, failed.sourceUrl)
        assertTrue(failed.error.contains("different source URLs"))
    }

    private fun transition(expectedUrl: String, executionId: String): WebSourceTransition =
        WebSourceTransition(
            expectedUrl = expectedUrl,
            expectedOverride = true,
            callbackUrl = "http://10.0.2.2:4317/api/native-event",
            launcherInstanceId = "launcher-a",
            executionId = executionId,
            action = "setWebSourceOverride",
        )

    private companion object {
        const val SOURCE_A = "http://10.0.2.2:5173"
        const val SOURCE_B = "http://10.0.2.2:5174"
        const val BUNDLED_ASSET = "file:///android_asset/demo/index.html"
    }
}
