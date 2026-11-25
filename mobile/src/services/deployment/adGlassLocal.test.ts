import {engine, SETTINGS} from "@mentra/engine"

import {deploymentCloudConfigValues, resolvedEndpoints} from "@/services/cloudClient"

import {isCloudless} from "./adGlassManifest"
import {
  coreOverrideChangesCore,
  deploymentDebugOverrides,
  resolveDeploymentManifest,
  saveDeploymentCloudOverrides,
} from "./debugOverrides"
import {isAccountRoute, routeForThisBuild} from "./localRoutes"
import {createConsumerDeployment} from "./officialManifest"
import {DeploymentStore, deploymentStore, type DeploymentStorage} from "./store"

// AD Glass: the app is its own single deployment from the first launch, and nothing saved on the phone can give it
// a server. See docs/ad-glass/spec-phase2.md.

class MemoryStorage implements DeploymentStorage {
  constructor(public value: unknown | null = null) {}
  load() {
    return this.value
  }
  save(value: unknown) {
    this.value = value
  }
  remove() {
    this.value = null
  }
}

const WORKSPACE_SELECTION = {
  kind: "workspace",
  source: "manual",
  workspaceOrigin: "https://workspace.example",
  manifestUrl: "https://workspace.example/.well-known/mentra-deployment.json",
  activatedAt: "2026-01-01T00:00:00.000Z",
  manifest: {
    ...createConsumerDeployment().manifest,
    deploymentId: "some-org",
    services: {coreUrl: "https://core.workspace.example", runtimeUrl: "https://runtime.workspace.example"},
    auth: {
      mode: "microsoft-entra",
      authorityUrl: "https://login.microsoftonline.com/common",
      clientId: "00000000-0000-4000-8000-000000000000",
      sessionScopes: ["api://x/.default"],
      teamsScopes: [],
    },
  },
}

describe("the deployment store", () => {
  it("is resolved on a first launch, with nothing to choose", () => {
    const store = new DeploymentStore(new MemoryStorage())
    expect(store.isResolved()).toBe(true)
    expect(store.getActive().kind).toBe("consumer")
    expect(isCloudless(store.getActive().manifest)).toBe(true)
    expect(store.isTelemetryAllowed()).toBe(false)
  })

  it("does not honour an organization selection left on the phone", () => {
    const store = new DeploymentStore(new MemoryStorage(WORKSPACE_SELECTION))
    expect(store.getActive().kind).toBe("consumer")
    expect(store.getActive().manifest.services).toEqual({coreUrl: null, runtimeUrl: null})
  })

  it("is what the app uses", () => {
    expect(deploymentStore.isResolved()).toBe(true)
    expect(deploymentStore.getActive().manifest.deploymentId).toBe("ad-glass-local")
  })
})

describe("saved debug URLs", () => {
  const deployment = createConsumerDeployment()

  afterEach(async () => {
    await engine.settings.setManyLocal({
      [SETTINGS.cloud_core_url.key]: "",
      [SETTINGS.cloud_runtime_url.key]: "",
      [SETTINGS.cloud_url_deployment.key]: "",
    })
  })

  it("cannot give the deployment a server", async () => {
    await saveDeploymentCloudOverrides(deployment, {
      core: "https://core.debug.example",
      runtime: "https://runtime.debug.example",
    })
    // The override is stored, and ignored.
    expect(deploymentDebugOverrides(deployment)).toEqual({
      core: "https://core.debug.example",
      runtime: "https://runtime.debug.example",
    })
    expect(resolveDeploymentManifest(deployment).services).toEqual({coreUrl: null, runtimeUrl: null})
    expect(resolvedEndpoints()).toEqual({core: null, runtime: null})
    expect(coreOverrideChangesCore(deployment, "https://core.debug.example")).toBe(false)
    const config = deploymentCloudConfigValues(deployment)
    expect(config.coreUrl).toBeNull()
    expect(config.runtimeUrl).toBeNull()
  })
})

describe("what the engine is configured with", () => {
  const config = deploymentCloudConfigValues(createConsumerDeployment())

  it("has no Core, no Runtime and no live session", () => {
    expect(config.coreUrl).toBeNull()
    expect(config.runtimeUrl).toBeNull()
    expect(config.runtimeRealtimeSession).toBe(false)
    expect(config.resolveCloudEndpoints?.()).toEqual({core: null, runtime: null})
  })

  it("keeps on-device speech and turns the cloud features off", () => {
    expect(config.features).toEqual({
      managedStreams: false,
      nativeMeetings: false,
      cloudSpeech: false,
      onDeviceSpeech: true,
      navigation: false,
    })
  })

  it("has no firmware manifest and no fallback to Mentra's public one", () => {
    expect(config.otaManifestUrl).toBeNull()
    expect(config.allowLegacyOtaFallback).toBe(false)
  })

  it("names no miniapp host and allows every local miniapp, the developer tools included", () => {
    expect(config.firstPartyMiniappsUrl).toBeNull()
    expect(config.localMiniappAllowlist).toBeNull()
    expect(config.localMiniappPolicy).toBeUndefined()
  })
})

describe("account screens", () => {
  it.each([
    "/auth/start",
    "/auth/workspace-signin",
    "/auth/email-login?email=a",
    "/auth/reset-password#x",
    "/auth/",
    "/auth",
    "//auth/start",
    "/auth//start",
    "auth/start",
    "auth/start?x=1",
    "/./auth/start",
    "/../auth/start",
    "/x/../auth/start",
    "/%2e/auth/start",
    "/%61uth/start",
    "/AUTH/start",
    "\\auth\\start",
  ])(
    "%s is replaced by the boot route",
    (path) => {
      expect(isAccountRoute(path)).toBe(true)
      expect(routeForThisBuild(path)).toBe("/")
    },
  )

  it.each([
    "/",
    "/home",
    "home",
    "/pairing/scan",
    "/miniapps/settings/main",
    "/miniapps/settings//debug",
    "/authentic",
    "/auth%2Fstart",
    "/applet/local?x=/auth/start",
    "/applet/local?u=//auth/x",
    "/applet/auth/../local",
  ])(
    "%s is left alone",
    (path) => {
      expect(isAccountRoute(path)).toBe(false)
      expect(routeForThisBuild(path)).toBe(path)
    },
  )
})
