import {router} from "expo-router"

import {useNavigationStore} from "./navigation"

// Sightline: every navigation goes through this store, and none of them may open an account screen.
// See docs/sightline/spec-phase2.md.

jest.mock("expo-router", () => ({
  router: {push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn(), canGoBack: () => false},
}))

const nav = () => useNavigationStore.getState()
const target = (call: jest.Mock) => (call.mock.calls[0][0] as {pathname: string}).pathname

beforeEach(() => {
  jest.clearAllMocks()
  useNavigationStore.setState({history: [], historyParams: [], interceptor: null})
})

it.each(["/auth/start", "/auth/workspace-signin", "/auth/email-login", "/auth/reset-password"])(
  "sends every kind of navigation to %s to the boot route instead",
  (path) => {
    nav().replaceAll(path)
    expect(target(router.replace as jest.Mock)).toBe("/")
    expect(nav().history).toEqual(["/"])

    jest.clearAllMocks()
    nav().replace(path, {transition: "fade"})
    expect(target(router.replace as jest.Mock)).toBe("/")

    jest.clearAllMocks()
    useNavigationStore.setState({history: ["/home"], historyParams: [undefined]})
    nav().push(path)
    expect(target(router.push as jest.Mock)).toBe("/")
    expect(nav().history).toEqual(["/home", "/"])

    jest.clearAllMocks()
    nav().navigate(path)
    expect(target(router.navigate as jest.Mock)).toBe("/")
  },
)

it("does not let a hosted screen's own stack take an account route either", () => {
  const push = jest.fn(() => true)
  useNavigationStore.setState({interceptor: {push, replace: () => true, goBack: () => true}})
  nav().push("/auth/start")
  expect(push).toHaveBeenCalledWith("/", undefined)
})

it("leaves every other route alone", () => {
  nav().replaceAll("/home")
  expect(target(router.replace as jest.Mock)).toBe("/home")
  jest.clearAllMocks()
  nav().push("/pairing/select-glasses-model")
  expect(target(router.push as jest.Mock)).toBe("/pairing/select-glasses-model")
})
