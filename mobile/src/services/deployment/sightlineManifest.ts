import type {DeploymentManifest} from "./types"

/**
 * Sightline: the one deployment this build knows, with no server behind it.
 *
 * Core and Runtime are null, every cloud feature is off, and nothing here reads
 * the build environment, so no `EXPO_PUBLIC_CLOUD_*` value can point the app at
 * a server. See docs/sightline/spec-phase2.md.
 */

export const SIGHTLINE_DEPLOYMENT_ID = "sightline-local"

/** The fork's own notice: what this build is, and that Mentra does not support it. */
const FORK_NOTICE_URL = "https://github.com/jpaulgayjr-stack/MentraOS/blob/sightline/main/docs/sightline/NOTICE-fork.md"

export function createSightlineManifest(): DeploymentManifest {
  return {
    schemaVersion: 1,
    deploymentId: SIGHTLINE_DEPLOYMENT_ID,
    displayName: "Sightline",
    services: {coreUrl: null, runtimeUrl: null},
    auth: {mode: "local"},
    artifacts: {
      // Firmware updates are for Mentra Live glasses; the Even G2 has none here.
      mentraLiveOtaManifestUrl: null,
      // The speech models come from their publishers (sherpa-onnx on GitHub).
      sttModelBaseUrl: null,
      ttsModelBaseUrl: null,
      firstPartyMiniappsUrl: null,
      directoryUrl: null,
    },
    appUpdates: {
      // Builds arrive through TestFlight; there is no store page to send anyone to.
      mode: "managed",
      storeUrls: {android: null, ios: null},
      reviewUrls: {android: null, ios: null},
    },
    content: {wallpaperUrls: []},
    links: {
      privacyPolicyUrl: FORK_NOTICE_URL,
      termsOfServiceUrl: FORK_NOTICE_URL,
      documentationUrl: null,
      supportUrl: null,
    },
    // null keeps every compiled-in system miniapp, the Miniapp Developer tools
    // included: AD Home installs through them.
    systemMiniapps: {approvedPackageNamesOverride: null},
    miniapps: {managed: [], defaults: [], configuration: {}},
    glasses: {allowedModelsOverride: null},
    features: {
      runtimeRealtimeSession: false,
      managedStreams: false,
      nativeMeetings: false,
      cloudSpeech: false,
      onDeviceSpeech: true,
      navigation: false,
    },
    telemetry: false,
  }
}

/**
 * A deployment with neither Core nor Runtime: nothing in it may reach a server of its own. Both must be explicitly
 * null; a manifest that says nothing about its services (a partial one, in a test) is not treated as cloudless.
 */
export function isCloudless(manifest: Pick<DeploymentManifest, "services"> | undefined): boolean {
  return manifest?.services?.coreUrl === null && manifest.services.runtimeUrl === null
}
