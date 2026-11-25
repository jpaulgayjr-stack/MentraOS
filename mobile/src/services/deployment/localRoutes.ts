import {isCloudless} from "./adGlassManifest"
import {createOfficialManifest} from "./officialManifest"

/**
 * AD Glass has no account, so the sign-in, sign-up, password and organization
 * screens under `/auth` must never open, whoever asks for them: a stale deep
 * link, the link fallback, a debug tool. They are still in the bundle (removing
 * them is a later clean-up); this keeps them unreachable.
 */
const NO_ACCOUNT_SCREENS = isCloudless(createOfficialManifest())

/** Whether `path` (a route, with or without a query) is one of the account screens. */
export function isAccountRoute(path: string): boolean {
  // Collapse repeated slashes first: `//auth/start` is the same screen to the router.
  const route = path.split(/[?#]/)[0].replace(/\/{2,}/g, "/").replace(/\/+$/, "")
  return route === "/auth" || route.startsWith("/auth/")
}

/** Where a navigation to `path` goes in this build: the boot route instead of any account screen. */
export function routeForThisBuild(path: string): string {
  return NO_ACCOUNT_SCREENS && isAccountRoute(path) ? "/" : path
}
