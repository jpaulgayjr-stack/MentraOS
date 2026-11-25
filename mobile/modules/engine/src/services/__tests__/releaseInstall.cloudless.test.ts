/// <reference types="bun-types" />

import {afterAll, beforeEach, describe, expect, mock, test} from "bun:test"
import {result as Res} from "typesafe-ts"

import "./reactNativeTestMock"
import {
  configure,
  isDevMiniappAllowed,
  isLocalMiniappPackageAllowed,
  isMiniappDevelopmentAllowed,
  resetForTests,
} from "../../runtime/bootstrap"

// Sightline: AD Home is installed by scanning the release QR its laptop shows. This runs that install (the real
// manualMiniappInstall and the real localBuildInstall) under the configuration Sightline gives the engine: no Core,
// no Runtime, every cloud feature off. It must succeed, as a local build, touching nothing but the laptop's address.
// See docs/sightline/spec-phase2.md, section 6.

const AD_HOME = "com.domingueandco.adhome"
const LAPTOP = "http://192.168.1.20:6789"

/**
 * What `deploymentCloudConfigValues(createConsumerDeployment())` hands the engine in this build. The app side pins
 * these values in `sightlineLocal.test.ts` ("what the engine is configured with").
 */
const SIGHTLINE_ENGINE_CONFIG = {
  coreUrl: null,
  runtimeUrl: null,
  runtimeRealtimeSession: false,
  localMiniappAllowlist: null,
  localMiniappPolicy: undefined,
  otaManifestUrl: null,
  allowLegacyOtaFallback: false,
  firstPartyMiniappsUrl: null,
  features: {managedStreams: false, nativeMeetings: false, cloudSpeech: false, onDeviceSpeech: true, navigation: false},
} as const

let installs: Array<{url: string; options: Record<string, unknown>}>
let selected: Array<[string, string | null]>
let events: string[]
mock.module("../AppRegistry", () => ({
  default: {
    installFromUrl: async (url: string, options: Record<string, unknown>) => {
      installs.push({url, options})
      ;(options.beforeActivate as (() => void) | undefined)?.()
      return Res.ok(undefined)
    },
    getPublisherKeyFingerprint: () => null,
    selectDevSnapshot: (packageName: string, version: string | null) => selected.push([packageName, version]),
    gcDevVersions: () => {},
  },
  registerDevApp: async () => events.push("register dev server"),
  unregisterDevApp: () => events.push("unregister dev server"),
}))
mock.module("../MiniappLauncher", () => ({
  miniappLauncher: {
    pauseLaunches: async () => () => {},
    isRunning: () => false,
    stop: async () => {},
    ensureRunning: async () => {},
  },
}))
mock.module("../../stores/apps", () => ({
  useAppStatusStore: {
    getState: () => ({
      runUpdate: async (_packageName: string, update: () => Promise<unknown>) => update(),
      refresh: async () => {
        events.push("refresh")
      },
    }),
  },
}))
mock.module("../miniappReleaseInstall", () => ({MiniappInstallCancelledError: class extends Error {}}))
// The install must not reach for the cloud client at all.
const cloudTouches: string[] = []
mock.module("../CloudClientService", () => ({
  cloudClientService: new Proxy(
    {},
    {
      get(_target, property) {
        cloudTouches.push(String(property))
        return () => {
          throw new Error("the cloud client must not be used")
        }
      },
    },
  ),
}))

const {installMiniappFromJsonUrl} = await import("../manualMiniappInstall")

const originalFetch = globalThis.fetch
let fetched: string[]

beforeEach(() => {
  installs = []
  selected = []
  events = []
  fetched = []
  cloudTouches.length = 0
  resetForTests()
  globalThis.fetch = (async (input: unknown) => {
    fetched.push(String(input))
    return new Response(JSON.stringify({packageName: AD_HOME, version: "0.10.1", name: "AD Home"}))
  }) as unknown as typeof fetch
})
afterAll(() => {
  globalThis.fetch = originalFetch
  resetForTests()
})

describe("under Sightline's engine configuration", () => {
  beforeEach(() => {
    // The host's auth seam: a local user id and nothing to exchange for a token.
    configure({auth: {getUserId: async () => "local:sightline"}, config: SIGHTLINE_ENGINE_CONFIG})
  })

  test("miniapp development is allowed, for AD Home's package too", () => {
    expect(isMiniappDevelopmentAllowed()).toBe(true)
    expect(isDevMiniappAllowed(AD_HOME)).toBe(true)
    expect(isLocalMiniappPackageAllowed(AD_HOME)).toBe(true)
  })

  test("a scanned release QR installs AD Home as a local build, from the laptop only", async () => {
    const result = await installMiniappFromJsonUrl(LAPTOP)
    expect(result.is_ok() && result.value).toEqual({packageName: AD_HOME, version: "0.10.1", name: "AD Home"})

    // One install, of the laptop's ZIP, recorded as a local build of the version the laptop showed.
    expect(installs).toHaveLength(1)
    expect(installs[0].url).toBe(`${LAPTOP}/bundle.zip`)
    expect(installs[0].options).toMatchObject({
      expectedPackageName: AD_HOME,
      expectedVersion: "0.10.1",
      releaseIdentity: {source: "local", sourceUrl: `${LAPTOP}/`},
    })
    const snapshot = String(installs[0].options.versionOverride)
    expect(snapshot).toMatch(/^dev-\d+$/)
    // With no development server, the snapshot is what runs: it keeps working when the laptop is off.
    expect(selected).toEqual([[AD_HOME, snapshot]])
    expect(events).toEqual(["unregister dev server", "refresh"])

    // Nothing but the laptop was asked, and the cloud client was never touched.
    expect(fetched).toEqual([`${LAPTOP}/miniapp.json`])
    expect(cloudTouches).toEqual([])
  })
})

describe("the gate is real", () => {
  test("a deployment that leaves the developer tools out refuses the same scan before anything is fetched", async () => {
    configure({
      auth: {getUserId: async () => "local:sightline"},
      config: {...SIGHTLINE_ENGINE_CONFIG, localMiniappAllowlist: ["com.mentra.settings"]},
    })
    expect(isMiniappDevelopmentAllowed()).toBe(false)
    const result = await installMiniappFromJsonUrl(LAPTOP)
    expect(result.is_error() && result.error.message).toContain("does not allow miniapp development")
    expect(fetched).toEqual([])
    expect(installs).toEqual([])
  })
})
