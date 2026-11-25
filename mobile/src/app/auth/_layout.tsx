import {Redirect, Slot} from "expo-router"

import {hasAccountScreens} from "@/services/deployment/localRoutes"

/**
 * Sightline: there is no account, so none of the screens in this folder (sign-in, sign-up, password reset,
 * organization sign-in) may be shown. This layout wraps every one of them: however a navigation or a link was
 * spelled, if the router resolved it to a screen here, it leaves again for the boot route, which goes Home.
 * The checks on the way in (`routeForThisBuild` in the navigation store and the system link handler) keep most
 * navigations from getting this far; this is the one that cannot be spelled around.
 * See docs/sightline/spec-phase2.md.
 */
export default function AccountScreensLayout() {
  if (!hasAccountScreens()) return <Redirect href="/" />
  return <Slot />
}
