/// <reference types="bun-types" />

import {afterEach, beforeEach, describe, expect, mock, test} from "bun:test"

import {bluetoothSdk} from "./bluetoothSdkTestMock"
import {reactNative} from "./reactNativeTestMock"

// AD Glass: with neither Core nor Runtime the engine must build no cloud client, so nothing that needs the cloud
// gets as far as a request. See docs/ad-glass/spec-phase2.md.
;(globalThis as {__DEV__?: boolean}).__DEV__ = false
reactNative.Platform = {OS: "ios", Version: "26.0"}
bluetoothSdk.updateBluetoothSettings = mock(async () => {})

class FakeCloudClient {
  static built = 0
  readonly core = {}
  readonly auth = {
    getCoreToken: async () => "token",
    identity: {mentraUserId: "cloud-user", tenantId: "tenant"},
    clearSession: async () => {},
  }
  readonly runtime = {
    onStatusChanged: () => () => {},
    onTranscript: () => () => {},
    onTranslation: () => () => {},
    getStatus: () => ({status: "idle", audioTransport: null}),
    onConnected: () => {},
    onDisconnected: () => {},
    onError: () => {},
    connect: async () => {},
    close: () => {},
    setSubscriptions: async () => {},
  }
  constructor() {
    FakeCloudClient.built += 1
  }
}

mock.module("@mentra/cloud-client/react-native", () => ({
  CloudClient: FakeCloudClient,
  setNativeHttp: () => {},
  setNativeUdp: () => {},
  setSecureStorage: () => {},
}))
mock.module("@mentra/crust", () => ({default: {}, nativeHttpRequest: async () => ({})}))

type Config = {
  coreUrl?: string | null
  runtimeUrl?: string | null
  resolveCloudEndpoints?: () => {core: string | null; runtime: string | null}
  runtimeRealtimeSession?: boolean
}
const CLOUDLESS: Config = {
  coreUrl: null,
  runtimeUrl: null,
  // What the AD Glass host hands over: its resolver answers with the manifest's nulls.
  resolveCloudEndpoints: () => ({core: null, runtime: null}),
  runtimeRealtimeSession: false,
}
let config: Config = CLOUDLESS
let hostUserId: (() => Promise<string>) | undefined = async () => "local:adglass"

mock.module("../../runtime/bootstrap", () => ({
  // The local host supplies an identity and nothing to exchange for a token.
  getAuth: () => (hostUserId ? {getUserId: hostUserId} : {}),
  getConfigValues: () => config,
  isFeatureEnabled: () => false,
}))
mock.module("../../stores/settings", () => ({
  SETTINGS: {core_token: {key: "core_token"}, lc3_frame_size: {key: "lc3_frame_size"}},
  useSettingsStore: {
    getState: () => ({getSetting: () => null, setSetting: async () => ({is_error: () => false})}),
    subscribe: () => () => {},
  },
}))
const kept = new Map<string, unknown>()
const ok = (value?: unknown) => ({is_ok: () => true, is_error: () => false, value})
mock.module("../../utils/storage", () => ({
  storage: {
    load: (key: string) =>
      kept.has(key) ? ok(kept.get(key)) : {is_ok: () => false, is_error: () => true, error: new Error("missing")},
    save: (key: string, value: unknown) => {
      kept.set(key, value)
      return ok()
    },
    remove: (key: string) => {
      kept.delete(key)
      return ok()
    },
  },
}))
mock.module("../../utils/cloudClient/RnUdpAdapter", () => ({createCloudUdpSocket: () => ({})}))
mock.module("../../utils/cloudClient/cloudSecureStore", () => ({cloudSecureStore: {delete: async () => {}}}))
mock.module("../../stores/cloudClientStatus", () => ({
  useCloudClientStatusStore: {
    getState: () => ({setSnapshot: () => {}, reset: () => {}, status: "idle", audioTransport: null}),
  },
}))
mock.module("../NotificationsEmitter", () => ({islandNotifications: {emit: () => {}}}))
mock.module("../CloudTranscriptE2EMetrics", () => ({logCloudV2TranscriptMetric: () => {}}))
mock.module("../../utils/timers", () => ({
  BgTimer: {setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}},
}))

const {cloudClientService} = await import("../CloudClientService")

beforeEach(() => {
  FakeCloudClient.built = 0
  config = CLOUDLESS
  hostUserId = async () => "local:adglass"
  kept.clear()
})

afterEach(() => {
  cloudClientService.stop()
})

describe("the engine with neither Core nor Runtime", () => {
  test("starts without building a cloud client", () => {
    expect(() => cloudClientService.init()).not.toThrow()
    expect(FakeCloudClient.built).toBe(0)
    expect(cloudClientService.hasCore()).toBe(false)
    expect(cloudClientService.isConnected()).toBe(false)
    expect(cloudClientService.getCoreSession()).toBeNull()
  })

  test("builds none on a reconnect either, even one that names servers", () => {
    cloudClientService.init()
    cloudClientService.reconnect()
    cloudClientService.reconnect({core: "https://core.example", runtime: "https://runtime.example"})
    cloudClientService.reconnect(null)
    expect(FakeCloudClient.built).toBe(0)
    expect(cloudClientService.hasCore()).toBe(false)
  })

  test("refuses every call that needs a server, without building a client for it", async () => {
    cloudClientService.init()
    const lazy: Array<() => unknown> = [
      () => cloudClientService.getMiniappAuthToken("com.example.app"),
      () => cloudClientService.syncCoreTokenToBluetooth(),
      () => cloudClientService.createTeamsMeeting({}),
      () => cloudClientService.getMeetingCredential(),
      () => cloudClientService.core.supportProfile.update({} as never),
      () => cloudClientService.core.fleet.report({} as never),
      () => cloudClientService.core.reports.submit({} as never),
      () => cloudClientService.startManagedPhoto(),
      () => cloudClientService.tts.speak("hello"),
      () => cloudClientService.maps.directions({} as never),
      () => cloudClientService.getCoreUrl(),
    ]
    for (const call of lazy) {
      let failed = false
      try {
        await call()
      } catch {
        failed = true
      }
      expect(failed).toBe(true)
    }
    expect(await cloudClientService.resolveCoreSession()).toBeNull()
    expect(FakeCloudClient.built).toBe(0)
    expect(bluetoothSdk.updateBluetoothSettings).not.toHaveBeenCalled()
  })

  test("drops audio and subscriptions quietly", async () => {
    cloudClientService.init()
    expect(() => cloudClientService.sendAudioFrame(new Uint8Array(4))).not.toThrow()
    await cloudClientService.setSubscriptions([])
    expect(cloudClientService.getAudioPosition()).toBeNull()
    expect(FakeCloudClient.built).toBe(0)
  })

  test("partitions miniapp storage by the host's local user, with no token exchange", async () => {
    cloudClientService.init()
    expect(await cloudClientService.resolveMentraUserId()).toBe("local:adglass")
    expect(cloudClientService.getMentraUserId()).toBe("local:adglass")
    expect(FakeCloudClient.built).toBe(0)
  })

  test("without a host identity, storage identity fails instead of reaching for a server", async () => {
    hostUserId = undefined
    cloudClientService.init()
    await expect(cloudClientService.resolveMentraUserId()).rejects.toThrow()
    expect(FakeCloudClient.built).toBe(0)
  })
})

describe("a host that does name a Runtime", () => {
  test("still gets its cloud client", () => {
    config = {
      coreUrl: "https://core.example",
      runtimeUrl: "https://runtime.example",
      runtimeRealtimeSession: false,
    }
    // No auth mode is configured in this harness, which is the client's own complaint, not the cloudless guard's.
    expect(() => cloudClientService.init()).toThrow("no Runtime authentication mode")
  })
})
