package com.braze.demoshell

internal data class WebReadyIdentity(
    val protocol: String,
    val runtimeId: String,
    val configHash: String,
    val runtimeHash: String,
)

/**
 * Validates the web bundle's deployment identity before it can prove a render.
 *
 * URL agreement only proves which document loaded. These fields bind that
 * document to the native shell's canonical bundled runtime manifest, including
 * the active assets covered by runtimeHash v2.
 */
internal fun webReadyIdentityRejection(
    reported: WebReadyIdentity?,
    expected: WebReadyIdentity,
): String? {
    val expectedFields = mapOf(
        "protocol" to expected.protocol,
        "runtimeId" to expected.runtimeId,
        "configHash" to expected.configHash,
        "runtimeHash" to expected.runtimeHash,
    )
    val missingExpected = expectedFields.filterValues(String::isBlank).keys
    if (missingExpected.isNotEmpty()) {
        return "Native runtime identity is unavailable: ${missingExpected.joinToString()}."
    }
    if (reported == null) return "webReady sync identity is missing."

    val reportedFields = mapOf(
        "protocol" to reported.protocol,
        "runtimeId" to reported.runtimeId,
        "configHash" to reported.configHash,
        "runtimeHash" to reported.runtimeHash,
    )
    val missingReported = reportedFields.filterValues(String::isBlank).keys
    if (missingReported.isNotEmpty()) {
        return "webReady sync identity is incomplete: ${missingReported.joinToString()}."
    }
    val mismatched = expectedFields.keys.filter { reportedFields[it] != expectedFields[it] }
    if (mismatched.isNotEmpty()) {
        return "webReady sync identity does not match the native runtime: ${mismatched.joinToString()}."
    }
    return null
}
