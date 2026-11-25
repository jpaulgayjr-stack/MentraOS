import {isCloudless} from "./sightlineManifest"
import {createOfficialManifest} from "./officialManifest"

/**
 * Sightline has no account, so the sign-in, sign-up, password and organization
 * screens under `/auth` must never open, whoever asks for them: a stale deep
 * link, the link fallback, a debug tool. They are still in the bundle (removing
 * them is a later clean-up); this keeps them unreachable.
 *
 * Two layers. `routeForThisBuild` turns a navigation to an account route into
 * one to the boot route, in the navigation store and the system link handler.
 * `src/app/auth/_layout.tsx` wraps the screens themselves and leaves at once,
 * so a spelling the first layer does not recognise still cannot show one.
 */
const NO_ACCOUNT_SCREENS = isCloudless(createOfficialManifest())

/**
 * Settings pages that only make sense with an account or a server behind the app: profile (log out, delete
 * account), password and email changes, data export, organization, feedback to Mentra. No layout wraps them (they
 * share a folder with the real settings pages), so the route check is their only guard.
 */
const ACCOUNT_SETTINGS_PAGES = new Set([
  "profile",
  "change-password",
  "change-email",
  "confirm-deletion",
  "data-export",
  "workspace",
  "feedback",
])

/** Whether this build has account screens at all. Sightline does not. */
export function hasAccountScreens(): boolean {
  return !NO_ACCOUNT_SCREENS
}

/**
 * Whether `path` names one of the account screens. Read the way a router would: the query and fragment do not
 * count, a backslash is a slash, empty and `.` segments vanish, `..` steps back, percent-encoding is decoded,
 * and a leading slash is optional (`auth/start` is the same screen as `/auth/start`).
 */
export function isAccountRoute(path: string): boolean {
  const segments: string[] = []
  for (const written of path.split(/[?#]/)[0].replace(/\\/g, "/").split("/")) {
    let segment = written
    try {
      segment = decodeURIComponent(written)
    } catch {
      // Not valid percent-encoding: compare it as written.
    }
    if (segment === "" || segment === ".") continue
    if (segment === "..") segments.pop()
    else segments.push(segment)
  }
  const [first, second, third] = segments.map((segment) => segment.toLowerCase())
  if (first === "auth") return true
  // The account pages inside Settings. Their rows are hidden; this keeps a typed or stale link from opening them.
  return first === "miniapps" && second === "settings" && ACCOUNT_SETTINGS_PAGES.has(third ?? "")
}

/** Where a navigation to `path` goes in this build: the boot route instead of any account screen. */
export function routeForThisBuild(path: string): string {
  return NO_ACCOUNT_SCREENS && isAccountRoute(path) ? "/" : path
}
