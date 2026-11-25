// Sightline: the same link checks as native-intent.test.ts, under the scheme a real build has. In unit tests there
// is no packaged Expo config, so the other suite runs with the fallback scheme (`com.mentra`); this one supplies the
// config, to prove the guard reads `sightline://` links. See docs/sightline/spec-phase2.md.
jest.mock("expo-constants", () => ({__esModule: true, default: {expoConfig: {scheme: "sightline", extra: {}}}}))

import {APP_SCHEME} from "@/constants/appConfig"
import {redirectSystemPath} from "@/app/+native-intent"

it("runs under the app's real scheme", () => {
  expect(APP_SCHEME).toBe("sightline")
})

it.each([
  "sightline://auth/start",
  "sightline:auth/start",
  "sightline:///auth/start",
  "sightline://./auth/start",
  "sightline://auth/workspace-signin",
  "sightline://auth/callback?code=example",
  "sightline://miniapps/settings/profile",
  "sightline://miniapps/settings/change-password",
  "sightline://miniapps/settings/data-export",
])("never routes to an account screen or page: %s", (link) => {
  expect(redirectSystemPath({path: link, initial: false})).toBeNull()
  expect(redirectSystemPath({path: link, initial: true})).toBe("/")
})

it.each(["sightline://home", "sightline://miniapps/settings/speech", "sightline://pairing/select-glasses-model"])(
  "leaves an ordinary link alone: %s",
  (link) => {
    expect(redirectSystemPath({path: link, initial: false})).toBe(link)
  },
)

it("no longer treats Mentra's scheme as the app's own", () => {
  // A com.mentra:// link is some other app's. Its path is still read, so an account path in it is not routed.
  expect(redirectSystemPath({path: "com.mentra://home", initial: false})).toBe("com.mentra://home")
})
