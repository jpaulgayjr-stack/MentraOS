import {LOCAL_SESSION_MARKER, LOCAL_USER_ID} from "@/utils/auth/localUser"

import {LocalAuthProvider} from "./localClient"

// AD Glass: one local user, and no account service to call. See docs/ad-glass/spec-phase2.md.

const fetchSpy = jest.fn(() => Promise.reject(new Error("the local user must not reach the network")))
const originalFetch = global.fetch

beforeEach(() => {
  fetchSpy.mockClear()
  global.fetch = fetchSpy as unknown as typeof fetch
})

afterAll(() => {
  global.fetch = originalFetch
})

it("always has the same signed-in user, with no email", async () => {
  const provider = new LocalAuthProvider()
  const session = await provider.getSession()
  expect(session.is_ok()).toBe(true)
  if (!session.is_ok()) return
  expect(session.value).toEqual({
    token: LOCAL_SESSION_MARKER,
    user: {id: LOCAL_USER_ID, name: "AD Glass", provider: "local"},
  })
  const user = await provider.getUser()
  expect(user.is_ok() && user.value).toEqual({id: "local:adglass", name: "AD Glass", provider: "local"})
  // A second provider (a relaunch) is the same user: settings and miniapp storage are kept under this id.
  const again = await new LocalAuthProvider().getSession()
  expect(again.is_ok() && again.value.user?.id).toBe(LOCAL_USER_ID)
})

it("hands out copies, so no caller can change the user for the others", async () => {
  const provider = new LocalAuthProvider()
  const first = await provider.getUser()
  if (first.is_ok()) first.value.id = "someone-else"
  const second = await provider.getUser()
  expect(second.is_ok() && second.value.id).toBe(LOCAL_USER_ID)
})

it("accepts an auth listener and never calls it", () => {
  const listener = jest.fn()
  const subscription = new LocalAuthProvider().onAuthStateChange(listener)
  expect(subscription.is_ok()).toBe(true)
  if (subscription.is_ok()) expect(() => subscription.value.unsubscribe()).not.toThrow()
  expect(listener).not.toHaveBeenCalled()
})

it("treats refresh and sign-out as nothing to do", async () => {
  const provider = new LocalAuthProvider()
  expect((await provider.startAutoRefresh()).is_ok()).toBe(true)
  expect((await provider.stopAutoRefresh()).is_ok()).toBe(true)
  expect((await provider.signOut()).is_ok()).toBe(true)
  const session = await provider.getSession()
  expect(session.is_ok() && session.value.user?.id).toBe(LOCAL_USER_ID)
})

it("has no account operations and no token to give a server", async () => {
  const provider = new LocalAuthProvider()
  const refused = await Promise.all([
    provider.getSubjectToken(),
    provider.signInWithPassword({email: "a@example.com", password: "x"}),
    provider.signUp({email: "a@example.com", password: "x"}),
    provider.resetPasswordForEmail("a@example.com"),
    provider.updateUserPassword("x"),
    provider.updateUserEmail("a@example.com"),
    provider.requestAccountDeletion(),
    provider.appleSignIn(),
    provider.googleSignIn(),
    provider.completeOAuthHandoff({code: "c", state: "s"}),
  ])
  for (const result of refused) expect(result.is_error()).toBe(true)
})

it("never touches the network", async () => {
  const provider = new LocalAuthProvider()
  await provider.getSession()
  await provider.getUser()
  await provider.signOut()
  await provider.getSubjectToken()
  expect(fetchSpy).not.toHaveBeenCalled()
})
