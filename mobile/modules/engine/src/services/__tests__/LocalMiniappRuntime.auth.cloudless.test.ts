/// <reference types="bun-types" />

import {describe, expect, test} from "bun:test"
import {readFileSync} from "node:fs"

import {variantConfiguration} from "../miniappVariant"

// Sightline: with no Core there is no miniapp token to hand out. A miniapp that connects (AD Home, as a local
// build) must still be acknowledged and left running, with no token, no request for one and no retry timer ticking
// for ever. Runs the shipped methods, in the style of LocalMiniappRuntime.auth.test.ts (whose fake Core always
// exists). See docs/sightline/spec-phase2.md.
const source = readFileSync(new URL("../LocalMiniappRuntime.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n")
const methods = [
  "updateVisibility",
  "handleConnect",
  "requestMiniappAuth",
  "refreshMiniappAuth",
  "handleAuthRefresh",
  "authRefreshOptions",
  "currentAuthApp",
  "scheduleMiniappAuthRefresh",
  "armMiniappAuthRefresh",
  "clearMiniappAuthRefresh",
  "deliverInitialMiniappAuth",
  "scheduleInitialMiniappAuthRetry",
  "clearMiniappAuthDeliveryRetry",
  "redriveMiniappAuthDelivery",
]
  .map((name) => {
    const start = source.search(new RegExp(`^  (?:public|private) (?:async )?${name}\\(`, "m"))
    if (start < 0) throw new Error(`Missing runtime method ${name}`)
    const rest = source.slice(start)
    const end = rest.search(/^ {2}}$/m)
    if (end < 0) throw new Error(`Missing end of runtime method ${name}`)
    return rest.slice(0, end + 3)
  })
  .join("\n")
const constants = [
  "MINIAPP_AUTH_REFRESH_HEADROOM_MS",
  "MINIAPP_AUTH_REFRESH_MIN_DELAY_MS",
  "MINIAPP_AUTH_RETRY_BASE_MS",
  "MINIAPP_AUTH_RETRY_MAX_MS",
]
  .map((name) => {
    const line = source.match(new RegExp(`^const ${name} = .*$`, "m"))
    if (!line) throw new Error(`Missing runtime constant ${name}`)
    return line[0]
  })
  .join("\n")
const compiled = new Bun.Transpiler({loader: "ts"}).transformSync(`${constants}\nclass Host { ${methods} }`)

const AD_HOME = "com.domingueandco.adhome"
const DAY_MS = 24 * 60 * 60 * 1000

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

function fixture() {
  let now = 1_800_000_000_000
  let timerSeq = 0
  const timers = new Map<number, {at: number; callback: () => void}>()
  const bgTimer = {
    setTimeout(callback: () => void, delay: number) {
      const id = ++timerSeq
      timers.set(id, {at: now + delay, callback})
      return id
    },
    clearTimeout(id: number) {
      timers.delete(id)
    },
  }
  const tokenRequests: string[] = []
  // What the engine's cloud client is with no Core and no Runtime: nothing to ask.
  const cloudClientService = {
    hasCore: () => false,
    getMiniappAuthToken(packageName: string): Promise<never> {
      tokenRequests.push(packageName)
      return Promise.reject(new Error("cloud client not initialized"))
    },
  }
  const warnings: string[] = []
  const Host = new Function(
    "BgTimer",
    "cloudClientService",
    "isLocalBuildContext",
    "useSettingsStore",
    "ISLAND_SETTINGS_KEYS",
    "DeviceTypes",
    "getModelCapabilities",
    "computeDeclaredPermissionRecord",
    "getMiniappConfiguration",
    "variantConfiguration",
    "MiniappResponseType",
    "MiniappErrorCode",
    "Platform",
    "LOG_TAG",
    "Date",
    "console",
    `${compiled}; return Host`,
  )(
    bgTimer,
    cloudClientService,
    // AD Home is installed by release QR, which makes it a local build.
    () => true,
    {getState: () => ({getSetting: () => undefined})},
    {defaultWearable: "default_wearable"},
    {NONE: "none"},
    () => ({}),
    () => ({}),
    () => ({}),
    variantConfiguration,
    {CONNECT_ACK: "connect_ack", AUTH_UPDATE: "auth_update"},
    {NOT_CONNECTED: "not_connected", INTERNAL: "internal"},
    {OS: "ios"},
    "LOCAL_MINIAPP",
    {now: () => now},
    {log() {}, warn: (message: string) => warnings.push(String(message))},
  )

  let visible: string | null = null
  const host = new Host()
  const sent: Array<{type: string; auth?: unknown}> = []
  const results: Array<{requestId?: string; ok: boolean; auth?: unknown; error?: {code: string; message: string}}> = []
  host.connectedApps = new Map()
  host.handshookApps = new Set()
  host.visiblePackage = null
  host.authSessionSeq = 0
  host.currentVisiblePackage = () => visible
  host.sendToMiniapp = (_packageName: string, message: {type: string; auth?: unknown}) => sent.push(message)
  host.sendVisibilityChange = () => {}
  host.sendResult = (
    _packageName: string,
    requestId: string | undefined,
    ok: boolean,
    data?: {auth?: unknown},
    error?: {code: string; message: string},
  ) => results.push({requestId, ok, auth: data?.auth, error})
  host.sendCloudStatusToMiniapp = () => {}
  host.flushConnectWaiters = () => {}
  host.connectedApps.set(AD_HOME, {
    lastPongAt: 0,
    unansweredPingRounds: 0,
    authRefreshTimerId: null,
    authRetryTimerId: null,
    authDelivered: false,
    authSession: 0,
    authRequestPending: false,
  })

  return {
    host,
    sent,
    results,
    tokenRequests,
    warnings,
    armed: () => timers.size,
    async advance(ms: number) {
      const target = now + ms
      for (let guard = 0; guard < 10_000; guard++) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        timers.delete(due[0])
        now = Math.max(now, due[1].at)
        due[1].callback()
        await flush()
      }
      now = target
      await flush()
    },
    async connect() {
      host.handleConnect(AD_HOME, {}, "req-1")
      await flush()
    },
    async show(packageName: string | null) {
      visible = packageName
      host.updateVisibility()
      await flush()
    },
  }
}

describe("a miniapp that connects where there is no Core", () => {
  test("is acknowledged, with no token and no request for one", async () => {
    const f = fixture()
    await f.connect()
    expect(f.sent.filter((message) => message.type === "connect_ack")).toHaveLength(1)
    expect(f.sent.filter((message) => message.type === "auth_update")).toHaveLength(0)
    expect(f.tokenRequests).toEqual([])
  })

  test("starts no token retry or refresh that would tick for ever", async () => {
    const f = fixture()
    await f.connect()
    await f.advance(7 * DAY_MS)
    expect(f.tokenRequests).toEqual([])
    expect(f.armed()).toBe(0)
  })

  test("is left alone when it comes to the foreground and when the cloud client would reconnect", async () => {
    const f = fixture()
    await f.connect()
    await f.show(AD_HOME)
    await f.show(null)
    await f.show(AD_HOME)
    f.host.redriveMiniappAuthDelivery()
    await f.advance(DAY_MS)
    expect(f.tokenRequests).toEqual([])
    expect(f.sent.filter((message) => message.type === "auth_update")).toHaveLength(0)
    expect(f.armed()).toBe(0)
  })

  test("is told plainly when it asks for a token itself, and nothing is retried", async () => {
    const f = fixture()
    await f.connect()
    f.host.handleAuthRefresh(AD_HOME, {}, "req-refresh")
    await f.advance(DAY_MS)
    const answer = f.results.find((result) => result.requestId === "req-refresh")
    expect(answer).toBeDefined()
    expect(answer?.auth).toBeUndefined()
    expect(f.tokenRequests).toEqual([])
    expect(f.armed()).toBe(0)
  })
})
