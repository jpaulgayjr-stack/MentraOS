/**
 * Sightline: the one local user. Kept apart from the provider so code that only needs the identity (the engine
 * hand-off) does not import the auth client. See docs/sightline/spec-phase2.md.
 */

/** Stable for the life of the install: per-account settings and miniapp storage are kept under it. */
export const LOCAL_USER_ID = "local:sightline"

/**
 * Not a credential. Upstream code asks "is there a session token" to mean "is someone signed in"; this constant
 * answers yes. No server exists to present it to.
 */
export const LOCAL_SESSION_MARKER = "local-device"
