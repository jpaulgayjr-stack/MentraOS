import {createSightlineManifest, isCloudless} from "./sightlineManifest"
import {createConsumerDeployment, createOfficialManifest} from "./officialManifest"

// Sightline: the embedded deployment has no server behind it, whatever the build environment says.
// See docs/sightline/spec-phase2.md.

const CLOUD_ENV = [
  "EXPO_PUBLIC_CLOUD_CORE_URL",
  "EXPO_PUBLIC_CLOUD_RUNTIME_URL",
  "EXPO_PUBLIC_MINIAPPS_URL",
  "EXPO_PUBLIC_DIRECTORY_URL",
  "EXPO_PUBLIC_ASG_OTA_VERSION_URL",
] as const
const original = Object.fromEntries(CLOUD_ENV.map((name) => [name, process.env[name]]))

afterEach(() => {
  for (const name of CLOUD_ENV) {
    if (original[name] === undefined) delete process.env[name]
    else process.env[name] = original[name]
  }
})

it("has no Core and no Runtime", () => {
  const manifest = createOfficialManifest()
  expect(manifest.services).toEqual({coreUrl: null, runtimeUrl: null})
  expect(isCloudless(manifest)).toBe(true)
  expect(manifest.deploymentId).toBe("sightline-local")
  expect(manifest.auth).toEqual({mode: "local"})
})

it("is the deployment the app embeds", () => {
  expect(createConsumerDeployment()).toEqual({kind: "consumer", source: "embedded", manifest: createSightlineManifest()})
})

it("ignores every cloud URL in the build environment", () => {
  const before = createOfficialManifest()
  for (const name of CLOUD_ENV) process.env[name] = `https://${name.toLowerCase().replace(/_/g, "-")}.example/`
  expect(createOfficialManifest()).toEqual(before)
})

it("turns every cloud feature off and keeps on-device speech", () => {
  const {features, telemetry} = createOfficialManifest()
  expect(features).toEqual({
    runtimeRealtimeSession: false,
    managedStreams: false,
    nativeMeetings: false,
    cloudSpeech: false,
    onDeviceSpeech: true,
    navigation: false,
  })
  expect(telemetry).toBe(false)
})

it("names no host for miniapps, the directory, firmware, wallpapers or the store", () => {
  const manifest = createOfficialManifest()
  expect(manifest.artifacts).toEqual({
    mentraLiveOtaManifestUrl: null,
    sttModelBaseUrl: null,
    ttsModelBaseUrl: null,
    firstPartyMiniappsUrl: null,
    directoryUrl: null,
  })
  expect(manifest.content.wallpaperUrls).toEqual([])
  expect(manifest.appUpdates.storeUrls).toEqual({android: null, ios: null})
  expect(manifest.appUpdates.reviewUrls).toEqual({android: null, ios: null})
  expect(manifest.miniapps).toEqual({managed: [], defaults: [], configuration: {}})
})

it("mentions no Mentra host anywhere", () => {
  const text = JSON.stringify(createOfficialManifest()).toLowerCase()
  for (const host of ["mentraglass.com", "mentraglass.cn", "mentra.glass", "posthog", "sentry"]) {
    expect(text).not.toContain(host)
  }
})

it("keeps the Miniapp Developer tools, which AD Home installs through", () => {
  expect(createOfficialManifest().systemMiniapps.approvedPackageNamesOverride).toBeNull()
})

describe("isCloudless", () => {
  it.each([
    [{coreUrl: "https://core.example", runtimeUrl: null}],
    [{coreUrl: null, runtimeUrl: "https://runtime.example"}],
    [{coreUrl: "https://core.example", runtimeUrl: "https://runtime.example"}],
  ])("is false with a server (%j)", (services) => {
    expect(isCloudless({services})).toBe(false)
  })
})
