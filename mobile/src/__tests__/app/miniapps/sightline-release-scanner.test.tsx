import {act, render} from "@testing-library/react-native"

import ScannerScreen from "@/app/miniapps/miniappdev/scanner"

// Sightline: AD Home gets onto the phone one way, by scanning the release QR its laptop shows, in
// Settings > Miniapp Developer > Scan. This pins what the scanner does with that QR, and with the other things a
// person might scan by mistake. See docs/sightline/spec-phase2.md, section 6.

const LAPTOP = "http://192.168.1.20:6789"
const RELEASE_QR = `miniapp://release?url=${encodeURIComponent(LAPTOP)}&package=com.domingueandco.adhome&version=0.10.1&name=AD%20Home`

let mockOnScan: ((scan: {data: string}) => Promise<void>) | undefined
jest.mock("expo-camera", () => ({
  CameraView: (props: {onBarcodeScanned?: (scan: {data: string}) => Promise<void>}) => {
    if (props.onBarcodeScanned) mockOnScan = props.onBarcodeScanned
    return null
  },
  useCameraPermissions: () => [{granted: true, canAskAgain: true}, jest.fn()],
}))
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: {Success: "success"},
}))
const mockReleaseInstall = jest.fn()
const mockIsLocal = jest.fn((url: string) => /^https?:\/\/(192\.168\.|10\.|localhost)/.test(url))
jest.mock("@mentra/engine-host-internal", () => ({
  installMiniappFromJsonUrl: (baseUrl: string) => mockReleaseInstall(baseUrl),
  isLocalNetworkMiniappUrl: (url: string) => mockIsLocal(url),
  normalizeManifestPermissions: (permissions: unknown) => permissions ?? [],
  assertDevBuildAllowed: jest.fn(),
  registerDevApp: jest.fn(),
}))
const mockEngine = {
  miniapps: {
    refresh: jest.fn(async () => {}),
    list: jest.fn(() => [] as Array<{packageName: string}>),
    start: jest.fn(async () => true),
    stop: jest.fn(async () => {}),
    setForeground: jest.fn(async () => {}),
  },
}
const mockDecideDevOpenRoute = jest.fn()
jest.mock("@mentra/engine", () => ({
  get engine() {
    return mockEngine
  },
  decideDevOpenRoute: (...args: unknown[]) => mockDecideDevOpenRoute(...args),
}))
const mockLocalInstall = jest.fn()
jest.mock("@/services/miniapps/localMiniappInstall", () => ({
  installLocalMiniapp: (...args: unknown[]) => mockLocalInstall(...args),
  localMiniappInstallErrorAlert: () => ({title: "Install failed", message: "local"}),
}))
const mockLinkInstall = jest.fn()
jest.mock("@/services/miniapps/miniappInstallFlow", () => ({
  startMiniappInstallFromLink: (...args: unknown[]) => mockLinkInstall(...args),
}))
const mockAskPermissions = jest.fn(async (..._args: unknown[]) => 1)
jest.mock("@/utils/PermissionsUtils", () => ({
  askPermissionsUI: (...args: unknown[]) => mockAskPermissions(...args),
  checkPermissionsUI: jest.fn(async () => []),
  PERMISSION_CONFIG: {},
}))
const mockAlert = jest.fn()
jest.mock("@/utils/AlertUtils", () => ({__esModule: true, default: (...args: unknown[]) => mockAlert(...args)}))
jest.mock("@/utils/devMiniappAlerts", () => ({showDevBuildError: jest.fn()}))
jest.mock("@/utils/storage/storage", () => ({storage: {save: jest.fn(), remove: jest.fn(), load: jest.fn()}}))
jest.mock("@/stores/navigation", () => ({
  useNavigationStore: {getState: () => ({goBack: jest.fn(), push: jest.fn(), clearHistoryAndGoHome: jest.fn()})},
}))
jest.mock("@/contexts/ThemeContext", () => ({useAppTheme: () => ({theme: {colors: {}, spacing: {}}})}))
jest.mock("@/i18n", () => ({translate: (key: string) => key}))
jest.mock("@/components/ignite", () => {
  const {View} = require("react-native")
  return {Screen: View, Header: () => null, Text: () => null, Button: () => null}
})

const ok = <T,>(value: T) => ({is_ok: () => true, is_error: () => false, value})
const failed = (message: string) => ({is_ok: () => false, is_error: () => true, error: new Error(message)})
const fetched: string[] = []
const originalFetch = global.fetch

async function scan(data: string) {
  render(<ScannerScreen />)
  expect(mockOnScan).toBeDefined()
  await act(async () => {
    await mockOnScan!({data})
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockOnScan = undefined
  fetched.length = 0
  mockReleaseInstall.mockResolvedValue(ok({packageName: "com.domingueandco.adhome", version: "0.10.1", name: "AD Home"}))
  mockLocalInstall.mockResolvedValue(null)
  mockLinkInstall.mockResolvedValue("cancelled")
  global.fetch = (async (input: unknown) => {
    fetched.push(String(input))
    return new Response(
      JSON.stringify({packageName: "com.domingueandco.adhome", name: "AD Home", version: "0.10.1", permissions: []}),
    )
  }) as unknown as typeof fetch
})

afterAll(() => {
  global.fetch = originalFetch
})

it("installs the build a release QR names, once, from the address in the QR", async () => {
  await scan(RELEASE_QR)
  expect(mockReleaseInstall).toHaveBeenCalledTimes(1)
  expect(mockReleaseInstall).toHaveBeenCalledWith(LAPTOP)
  // The permission check before the install reads the laptop's own miniapp.json, and nothing else is fetched.
  expect(fetched).toEqual([`${LAPTOP}/miniapp.json`])
  expect(mockAskPermissions).toHaveBeenCalled()
  expect(mockLocalInstall).not.toHaveBeenCalled()
  expect(mockLinkInstall).not.toHaveBeenCalled()
})

it("does not install when the required permissions are declined", async () => {
  mockAskPermissions.mockResolvedValueOnce(-1)
  await scan(RELEASE_QR)
  expect(mockReleaseInstall).not.toHaveBeenCalled()
})

it("says so when the install is refused", async () => {
  mockReleaseInstall.mockResolvedValue(failed("This deployment does not allow miniapp development"))
  await scan(RELEASE_QR)
  expect(mockAlert).toHaveBeenCalledWith(
    "Install failed",
    "This deployment does not allow miniapp development",
    expect.anything(),
  )
})

it("says so when the QR carries no address", async () => {
  await scan("miniapp://release?package=com.domingueandco.adhome")
  expect(mockReleaseInstall).not.toHaveBeenCalled()
  expect(mockAlert).toHaveBeenCalledWith("Install failed", expect.stringContaining("missing url"), expect.anything())
})

it("treats a plain address on the local network as a development build, not a release", async () => {
  await scan(`${LAPTOP}/`)
  expect(mockLocalInstall).toHaveBeenCalledTimes(1)
  expect(mockLocalInstall.mock.calls[0][0]).toBe(`${LAPTOP}/`)
  expect(mockReleaseInstall).not.toHaveBeenCalled()
  expect(mockLinkInstall).not.toHaveBeenCalled()
})

it("sends a public miniapp address through the ordinary install sheet", async () => {
  await scan("https://adhome.example.com/")
  expect(mockLinkInstall).toHaveBeenCalledWith("https://adhome.example.com/", "scanner")
  expect(mockReleaseInstall).not.toHaveBeenCalled()
  expect(mockLocalInstall).not.toHaveBeenCalled()
})
