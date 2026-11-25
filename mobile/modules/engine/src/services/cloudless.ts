/**
 * Sightline: running with no cloud at all.
 *
 * A host that configures the engine with `coreUrl: null` and `runtimeUrl: null`
 * has no Core and no Runtime. The engine then builds no cloud client, so every
 * path that would reach either service fails locally, before any request.
 * See docs/sightline/spec-phase2.md.
 */
import type {SpeechProcessing} from "./TranscriptionRouting"

/** Both service URLs are explicitly null. Unset (undefined) is not cloudless: that is an unconfigured host. */
export function isCloudlessConfig(config: {coreUrl?: string | null; runtimeUrl?: string | null}): boolean {
  return config.coreUrl === null && config.runtimeUrl === null
}

/**
 * Why a deployment refuses a transcription listener's processing, or null.
 *
 * Where cloud speech is off but on-device speech is on, `preferCloud` (what a
 * miniapp gets when it asks for nothing) is not refused: with cloud speech off
 * the cloud can never count as connected, so the listener is routed on-device
 * like any other whose cloud is unreachable (`targetSource`). It keeps its own
 * processing, which is what older SDKs sort delivered events by.
 */
export function speechProcessingRefusal(
  processing: SpeechProcessing,
  available: {cloud: boolean; onDevice: boolean},
): string | null {
  const {cloud, onDevice} = available
  if (processing === "localOnly" && !onDevice) return "On-device speech is disabled by this deployment"
  if (processing === "preferCloud" && !cloud && !onDevice) return "Cloud speech is disabled by this deployment"
  if (processing === "preferLocal" && !cloud && !onDevice) {
    return "Cloud and on-device speech are disabled by this deployment"
  }
  return null
}
