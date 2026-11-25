// Sightline: the fork's own identity, and the changes it makes to the Expo
// config that app.config.ts builds for the Mentra App.
//
// Everything the fork changes about the build is applied here, after upstream's
// config object is complete, so app.config.ts itself keeps a small diff against
// upstream and merges stay cheap. See docs/sightline/spec-phase1.md, section 5.
//
// SIGHTLINE_VARIANT=off builds the unmodified Mentra App configuration (used to
// run upstream's own config tests).

const SIGHTLINE = Object.freeze({
  appName: "Sightline",
  bundleId: "com.jpaulgay.sightline",
  // The app's own URL scheme. Upstream's is `com.mentra`, which Mentra's
  // sign-in returns through and which the Mentra app on the same phone claims.
  scheme: "sightline",
  icon: "./assets/app-icons/sightline_icon.png",
  adaptiveIcon: "./assets/app-icons/sightline_icon_foreground.png",
  splashLight: "./assets/logo/sightline_logo_light.png",
  splashDark: "./assets/logo/sightline_logo_dark.png",
})

const BLUETOOTH_SDK_PLUGIN = "./modules/bluetooth-sdk/app.plugin.js"
const SPLASH_PLUGIN = "expo-splash-screen"
// Build-time plugins that exist only to feed a Mentra-owned service.
const REMOVED_PLUGINS = new Set(["@sentry/react-native/expo"])
// The URL scheme upstream registers for the Mentra App.
const UPSTREAM_SCHEME = "com.mentra"

// $(PRODUCT_NAME), ${TARGET_NAME} and the like, as library plugins write them.
const XCODE_NAME_PLACEHOLDER = /\$[({](?:PRODUCT_NAME|TARGET_NAME|EXECUTABLE_NAME)[)}]/g

function isSightline(env = process.env) {
  return env.SIGHTLINE_VARIANT !== "off"
}

/**
 * Replace the Mentra brand in text iOS shows to the person (permission
 * prompts). "Mentra Live" stays: it names a model of glasses, not this app.
 */
function rebrandText(value) {
  if (typeof value !== "string") return value
  return (
    value
      // Xcode expands these to the project's product name, which stays "Mentra".
      .replace(XCODE_NAME_PLACEHOLDER, SIGHTLINE.appName)
      .replace(/\bMentraOS\b/g, SIGHTLINE.appName)
      .replace(/\bThe Mentra App\b/g, SIGHTLINE.appName)
      .replace(/\bthe Mentra App\b/g, SIGHTLINE.appName)
      .replace(/\bMentra\b(?! Live)/g, SIGHTLINE.appName)
  )
}

/** Rebrand every permission prompt (`NS...UsageDescription`) in an Info.plist object. */
function rebrandPrompts(infoPlist) {
  return mapValues(infoPlist, (key, value) => (/UsageDescription$/.test(key) ? rebrandText(value) : value))
}

/**
 * Sightline's Info.plist: our prompts, the name iOS reports (the Xcode project keeps upstream's), and our URL scheme
 * in place of upstream's.
 */
function sightlineInfoPlist(infoPlist, upstreamSchemes = [UPSTREAM_SCHEME]) {
  const plist = rebrandPrompts(infoPlist)
  return {
    ...plist,
    CFBundleName: SIGHTLINE.appName,
    CFBundleURLTypes: sightlineUrlTypes(plist.CFBundleURLTypes, [...upstreamSchemes, UPSTREAM_SCHEME]),
  }
}

/**
 * Library plugins (expo-camera, expo-location, ...) write their own default
 * prompts, such as "Allow $(PRODUCT_NAME) to access your camera", while the
 * native project is generated: after applySightline has run. This plugin applies
 * sightlineInfoPlist again at that point. applySightline lists it first and last
 * because the order in which Expo runs such steps is Expo's business, and
 * rewriting twice is harmless. Expo is loaded here, not at the top, so the unit
 * tests run before dependencies are installed.
 */
function withSightlineInfoPlist(config) {
  const {withInfoPlist} = require("expo/config-plugins")
  return withInfoPlist(config, (mod) => {
    mod.modResults = sightlineInfoPlist(mod.modResults)
    return mod
  })
}

/** Replace upstream's URL scheme with ours in the Info.plist URL types. Other schemes (msauth...) are kept. */
function sightlineUrlTypes(urlTypes, upstreamSchemes) {
  const types = (urlTypes ?? []).map((type) => ({
    ...type,
    CFBundleURLSchemes: (type.CFBundleURLSchemes ?? []).map((scheme) =>
      upstreamSchemes.includes(scheme) ? SIGHTLINE.scheme : scheme,
    ),
  }))
  const schemes = types.flatMap((type) => type.CFBundleURLSchemes)
  // Fail the build rather than ship an app that answers Mentra's links.
  const leftover = schemes.filter((scheme) => scheme === UPSTREAM_SCHEME || scheme.startsWith(`${UPSTREAM_SCHEME}.`))
  if (leftover.length > 0) {
    throw new Error(`[sightline] Info.plist still registers a Mentra URL scheme: ${leftover.join(", ")}`)
  }
  if (!schemes.includes(SIGHTLINE.scheme)) types.unshift({CFBundleURLSchemes: [SIGHTLINE.scheme]})
  return types
}

function mapValues(object, fn) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, fn(key, value)]))
}

function pluginName(plugin) {
  return Array.isArray(plugin) ? plugin[0] : plugin
}

function sightlinePlugin(plugin) {
  if (pluginName(plugin) === BLUETOOTH_SDK_PLUGIN) {
    // The SDK's usage analytics post to Mentra's PostHog project and are on by
    // default, whatever the app's own telemetry policy says. Off even when
    // upstream lists the plugin with no options, as [name] or as a bare string.
    const options = Array.isArray(plugin) ? plugin[1] : undefined
    return [BLUETOOTH_SDK_PLUGIN, {...(options && typeof options === "object" ? options : {}), analytics: false}]
  }
  if (!Array.isArray(plugin)) return plugin
  const [name, options] = plugin
  if (!options || typeof options !== "object") return plugin
  if (name === SPLASH_PLUGIN) {
    return [
      name,
      {...options, image: SIGHTLINE.splashLight, dark: {...(options.dark ?? {}), image: SIGHTLINE.splashDark}},
    ]
  }
  // Permission prompt text passed to library plugins (expo-location,
  // expo-media-library, ...).
  return [name, mapValues(options, (key, value) => (/Permission$/.test(key) ? rebrandText(value) : value))]
}

/**
 * Turn the Mentra App's finished Expo config into Sightline's.
 * @param {Record<string, any>} config
 * @param {NodeJS.ProcessEnv} [env]
 */
function applySightline(config, env = process.env) {
  if (!isSightline(env)) return config

  const plugins = config.plugins ?? []
  // Fail the build, not the privacy promise, if upstream moves the plugin.
  if (!plugins.some((plugin) => pluginName(plugin) === BLUETOOTH_SDK_PLUGIN)) {
    throw new Error(
      `[sightline] ${BLUETOOTH_SDK_PLUGIN} is not in the plugin list: its analytics cannot be turned off. ` +
        "Update mobile/scripts/sightline.cjs to match app.config.ts.",
    )
  }

  // Mentra's team owns the id upstream bakes in. Ours comes from the signing
  // workflow; an unsigned build has none.
  const {appleTeamId: _upstreamTeamId, ...ios} = config.ios ?? {}
  const teamId = env.SIGHTLINE_APPLE_TEAM_ID?.trim()
  const upstreamSchemes = [config.scheme].flat().filter((scheme) => typeof scheme === "string")

  // Upstream packages the Core URL of the build environment here. Nothing
  // reads it, and Sightline has no Core: do not ship the address.
  const {mentraBackendTarget: _backendTarget, ...extra} = config.extra ?? {}

  return {
    ...config,
    extra,
    scheme: SIGHTLINE.scheme,
    ios: {
      ...ios,
      ...(teamId ? {appleTeamId: teamId} : {}),
      infoPlist: sightlineInfoPlist(ios.infoPlist ?? {}, upstreamSchemes),
    },
    plugins: [
      withSightlineInfoPlist,
      ...plugins.filter((plugin) => !REMOVED_PLUGINS.has(pluginName(plugin))).map(sightlinePlugin),
      withSightlineInfoPlist,
    ],
  }
}

module.exports = {
  SIGHTLINE,
  isSightline,
  applySightline,
  sightlineInfoPlist,
  rebrandText,
  rebrandPrompts,
  withSightlineInfoPlist,
}
