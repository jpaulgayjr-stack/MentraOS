import {act, fireEvent, render} from "@testing-library/react-native"
import {engine, SETTINGS} from "@mentra/engine"

import InitScreen from "@/app/index"
import {createConsumerDeployment} from "@/services/deployment/officialManifest"
import {LOCAL_SESSION_MARKER, LOCAL_USER_ID} from "@/utils/auth/localUser"
import {fetchMinimumClientVersion} from "@/utils/cloudVersion"

// Sightline boot: straight to Home as the local user. No version check, no cached version floor, no sign-in, no
// network. See docs/sightline/spec-phase2.md.

const mockDeployment = createConsumerDeployment()
const mockReplace = jest.fn()
const mockReplaceAll = jest.fn()
const mockGoHome = jest.fn()
const mockMantleInit = jest.fn()
const mockProcessUrl = jest.fn()
let mockPendingRoute: string | null = null
let mockAuth: {user: unknown; session: unknown; loading: boolean}

jest.mock("expo-router", () => ({useRootNavigationState: () => ({key: "root"})}))
jest.mock("@/contexts/AuthContext", () => ({useAuth: () => mockAuth}))
jest.mock("@/contexts/DeeplinkContext", () => ({useDeeplink: () => ({processUrl: mockProcessUrl})}))
jest.mock("@/contexts/ThemeContext", () => ({useAppTheme: () => ({theme: {colors: {}}})}))
jest.mock("@/services/deployment", () => ({
  ...jest.requireActual("@/services/deployment/store"),
  ...jest.requireActual("@/services/deployment/refresh"),
  useDeployment: () => ({activeDeployment: mockDeployment, selectionResolved: true}),
}))
jest.mock("@/stores/navigation", () => ({
  useNavigationStore: {
    getState: () => ({
      replace: mockReplace,
      replaceAll: mockReplaceAll,
      clearHistoryAndGoHome: mockGoHome,
      getPendingRoute: () => mockPendingRoute,
      setPendingRoute: (route: string | null) => {
        mockPendingRoute = route
      },
      setAnimation: jest.fn(),
    }),
  },
}))
jest.mock("@/stores/capsule", () => ({useCapsuleStore: {getState: () => ({active: null})}}))
jest.mock("@/services/MantleManager", () => ({
  __esModule: true,
  default: {init: () => mockMantleInit(), isInitialized: () => false, applyDeploymentUpdate: jest.fn()},
}))
jest.mock("@/utils/cloudVersion", () => ({fetchMinimumClientVersion: jest.fn()}))
jest.mock("@/i18n", () => ({translate: (key: string) => key}))
jest.mock("@/components/brands/MentraLogoStandalone", () => ({MentraLogoStandalone: () => null}))
jest.mock("@/components/splash/SplashVideo", () => ({SplashVideo: () => null}))
jest.mock("@/components/ignite", () => {
  const {Text, View, Pressable} = require("react-native")
  return {
    Screen: View,
    Header: () => null,
    Icon: () => null,
    Text: ({text}: {text: string}) => <Text>{text}</Text>,
    Button: ({text, tx, onPress}: {text?: string; tx?: string; onPress: () => void}) => (
      <Pressable onPress={onPress}>
        <Text>{text ?? tx}</Text>
      </Pressable>
    ),
  }
})

const fetchSpy = jest.fn(() => Promise.reject(new Error("boot must not reach the network")))
const originalFetch = global.fetch
const originalVersion = process.env.EXPO_PUBLIC_MENTRAOS_VERSION

async function boot() {
  const screen = render(<InitScreen />)
  // The route change follows a short delay after the engine starts.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400))
  })
  return screen
}

beforeEach(async () => {
  jest.clearAllMocks()
  mockPendingRoute = null
  mockMantleInit.mockResolvedValue(undefined)
  mockAuth = {
    user: {id: LOCAL_USER_ID, name: "Sightline", provider: "local"},
    session: {token: LOCAL_SESSION_MARKER, user: {id: LOCAL_USER_ID, name: "Sightline"}},
    loading: false,
  }
  global.fetch = fetchSpy as unknown as typeof fetch
  process.env.EXPO_PUBLIC_MENTRAOS_VERSION = "3.5.0"
  await engine.settings.setManyLocal({
    [SETTINGS.cached_required_version.key]: "",
    [SETTINGS.onboarding_completed.key]: false,
    [SETTINGS.default_wearable.key]: "",
  })
})

afterAll(() => {
  global.fetch = originalFetch
  if (originalVersion === undefined) delete process.env.EXPO_PUBLIC_MENTRAOS_VERSION
  else process.env.EXPO_PUBLIC_MENTRAOS_VERSION = originalVersion
})

it("starts the engine and goes Home on a first launch, with no welcome carousel and no sign-in", async () => {
  await boot()
  expect(mockMantleInit).toHaveBeenCalledTimes(1)
  expect(mockGoHome).toHaveBeenCalledTimes(1)
  expect(mockReplace).not.toHaveBeenCalled()
  expect(mockReplaceAll).not.toHaveBeenCalled()
})

// The engine start is mocked here: this is about index.tsx itself. What the engine does with no cloud is covered by
// the engine tests (CloudClientService.cloudless) and the simulator job.
it("asks no server about versions and makes no request of its own", async () => {
  await boot()
  expect(fetchMinimumClientVersion).not.toHaveBeenCalled()
  expect(fetchSpy).not.toHaveBeenCalled()
})

it("is not held back by a required version cached by some earlier build", async () => {
  await engine.settings.setManyLocal({[SETTINGS.cached_required_version.key]: "runtime:99.0.0"})
  const screen = await boot()
  expect(screen.queryByText("versionCheck:updateRequiredTitle")).toBeNull()
  expect(screen.queryByText("versionCheck:updateRequiredButton")).toBeNull()
  expect(mockGoHome).toHaveBeenCalledTimes(1)
})

it("boots even when the build carries no version string", async () => {
  delete process.env.EXPO_PUBLIC_MENTRAOS_VERSION
  const screen = await boot()
  expect(screen.queryByText("versionCheck:missingVersionTitle")).toBeNull()
  expect(mockGoHome).toHaveBeenCalledTimes(1)
})

it("waits for the local user before starting", async () => {
  mockAuth = {user: null, session: null, loading: true}
  await boot()
  expect(mockMantleInit).not.toHaveBeenCalled()
  expect(mockGoHome).not.toHaveBeenCalled()
  expect(mockReplaceAll).not.toHaveBeenCalled()
})

it("goes Home and then opens a link that was waiting", async () => {
  mockPendingRoute = "sightline://open?url=https%3A%2F%2Fexample.com%2F"
  jest.useFakeTimers()
  try {
    render(<InitScreen />)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000)
    })
  } finally {
    jest.useRealTimers()
  }
  expect(mockGoHome).toHaveBeenCalledTimes(1)
  expect(mockProcessUrl).toHaveBeenCalledWith("sightline://open?url=https%3A%2F%2Fexample.com%2F", false, true)
  expect(mockPendingRoute).toBeNull()
})

it("says so when the engine cannot start, and starts on Try again", async () => {
  mockMantleInit.mockRejectedValueOnce(new Error("bluetooth module missing"))
  const errors = jest.spyOn(console, "error").mockImplementation(() => {})
  const screen = await boot()
  errors.mockRestore()
  expect(screen.getByText("Sightline could not start")).toBeTruthy()
  expect(screen.getByText("bluetooth module missing")).toBeTruthy()
  expect(mockGoHome).not.toHaveBeenCalled()
  expect(mockReplaceAll).not.toHaveBeenCalled()

  await act(async () => {
    fireEvent.press(screen.getByText("Try again"))
    await new Promise((resolve) => setTimeout(resolve, 400))
  })
  expect(mockMantleInit).toHaveBeenCalledTimes(2)
  expect(mockGoHome).toHaveBeenCalledTimes(1)
})
