import {engine} from "@mentra/engine"

import {useDefaultMiniappsStore} from "@/stores/defaultMiniapps"

import {defaultMiniapps} from "./defaultMiniapps"

// AD Glass: there is no Core to ask for a default miniapp list and no Mentra host to install from, so nothing
// installs, nothing is fetched and Home never says it is waiting for a connection.
// See docs/ad-glass/spec-phase2.md.

jest.mock("@mentra/engine-host-internal", () => ({
  appRegistry: {getInstalledVersions: jest.fn(() => [])},
  getDevAppRecords: jest.fn(() => []),
  firstPartyMiniappUrl: jest.requireActual("../../../modules/engine/src/services/systemMiniappTrust")
    .firstPartyMiniappUrl,
  InstallMiniappError: class extends Error {},
}))

const install = jest.fn()
const readListing = jest.fn()
Object.assign(engine.miniapps, {install, readListing})

const fetchSpy = jest.fn(() => Promise.reject(new Error("no server should be asked")))
const originalFetch = global.fetch

beforeEach(() => {
  jest.clearAllMocks()
  defaultMiniapps.reset()
  global.fetch = fetchSpy as unknown as typeof fetch
})

afterAll(() => {
  global.fetch = originalFetch
})

it("installs nothing, fetches nothing and is not waiting for a connection", async () => {
  useDefaultMiniappsStore.setState({status: "waiting", pending: ["com.mentra.ai"], listings: {}, failed: []})
  await defaultMiniapps.sync(() => true)
  expect(fetchSpy).not.toHaveBeenCalled()
  expect(install).not.toHaveBeenCalled()
  expect(readListing).not.toHaveBeenCalled()
  expect(useDefaultMiniappsStore.getState()).toMatchObject({status: "idle", pending: [], failed: []})
})
