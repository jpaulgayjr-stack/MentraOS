// AD Glass: the fork's own identity, and the changes it makes to the Expo
// config that app.config.ts builds for the Mentra App.
//
// Everything the fork changes about the build is applied here, after upstream's
// config object is complete, so app.config.ts itself keeps a small diff against
// upstream and merges stay cheap. See docs/ad-glass/spec-phase1.md, section 5.
//
// AD_GLASS_VARIANT=off builds the unmodified Mentra App configuration (used to
// run upstream's own config tests).

const AD_GLASS = Object.freeze({
  appName: "AD Glass",
  bundleId: "com.domingueandco.adglass",
  icon: "./assets/app-icons/ad_glass_icon.png",
  adaptiveIcon: "./assets/app-icons/ad_glass_icon_foreground.png",
  splashLight: "./assets/logo/ad_glass_logo_light.png",
  splashDark: "./assets/logo/ad_glass_logo_dark.png",
})

const BLUETOOTH_SDK_PLUGIN = "./modules/bluetooth-sdk/app.plugin.js"
const SPLASH_PLUGIN = "expo-splash-screen"
// Build-time plugins that exist only to feed a Mentra-owned service.
const REMOVED_PLUGINS = new Set(["@sentry/react-native/expo"])

function isAdGlass(env = process.env) {
  return env.AD_GLASS_VARIANT !== "off"
}

/**
 * Replace the Mentra brand in text iOS shows to the person (permission
 * prompts). "Mentra Live" stays: it names a model of glasses, not this app.
 */
function rebrandText(value) {
  if (typeof value !== "string") return value
  return (
    value
      // Xcode expands this to the project's product name, which stays "Mentra".
      .replace(/\$\(PRODUCT_NAME\)/g, AD_GLASS.appName)
      .replace(/\bMentraOS\b/g, AD_GLASS.appName)
      .replace(/\bThe Mentra App\b/g, AD_GLASS.appName)
      .replace(/\bthe Mentra App\b/g, AD_GLASS.appName)
      .replace(/\bMentra\b(?! Live)/g, AD_GLASS.appName)
  )
}

/** Rebrand every permission prompt (`NS...UsageDescription`) in an Info.plist object. */
function rebrandPrompts(infoPlist) {
  return mapValues(infoPlist, (key, value) => (/UsageDescription$/.test(key) ? rebrandText(value) : value))
}

/** AD Glass's Info.plist: our prompts, and the name iOS reports (the Xcode project keeps upstream's). */
function adGlassInfoPlist(infoPlist) {
  return {...rebrandPrompts(infoPlist), CFBundleName: AD_GLASS.appName}
}

/**
 * Library plugins (expo-camera, expo-location, ...) write their own default
 * prompts, such as "Allow $(PRODUCT_NAME) to access your camera", while the
 * native project is generated: after applyAdGlass has run. This plugin applies
 * adGlassInfoPlist again at that point. applyAdGlass lists it first and last
 * because the order in which Expo runs such steps is Expo's business, and
 * rewriting twice is harmless. Expo is loaded here, not at the top, so the unit
 * tests run before dependencies are installed.
 */
function withAdGlassInfoPlist(config) {
  const {withInfoPlist} = require("expo/config-plugins")
  return withInfoPlist(config, (mod) => {
    mod.modResults = adGlassInfoPlist(mod.modResults)
    return mod
  })
}

function mapValues(object, fn) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, fn(key, value)]))
}

function pluginName(plugin) {
  return Array.isArray(plugin) ? plugin[0] : plugin
}

function adGlassPlugin(plugin) {
  if (!Array.isArray(plugin)) return plugin
  const [name, options] = plugin
  if (name === BLUETOOTH_SDK_PLUGIN) {
    // The SDK's usage analytics post to Mentra's PostHog project and are on by
    // default, whatever the app's own telemetry policy says. Off even when
    // upstream passes the plugin no options at all.
    return [name, {...(options && typeof options === "object" ? options : {}), analytics: false}]
  }
  if (!options || typeof options !== "object") return plugin
  if (name === SPLASH_PLUGIN) {
    return [
      name,
      {...options, image: AD_GLASS.splashLight, dark: {...(options.dark ?? {}), image: AD_GLASS.splashDark}},
    ]
  }
  // Permission prompt text passed to library plugins (expo-location,
  // expo-media-library, ...).
  return [name, mapValues(options, (key, value) => (/Permission$/.test(key) ? rebrandText(value) : value))]
}

/**
 * Turn the Mentra App's finished Expo config into AD Glass's.
 * @param {Record<string, any>} config
 * @param {NodeJS.ProcessEnv} [env]
 */
function applyAdGlass(config, env = process.env) {
  if (!isAdGlass(env)) return config

  const plugins = config.plugins ?? []
  // Fail the build, not the privacy promise, if upstream moves the plugin.
  if (!plugins.some((plugin) => pluginName(plugin) === BLUETOOTH_SDK_PLUGIN && Array.isArray(plugin))) {
    throw new Error(
      `[ad-glass] ${BLUETOOTH_SDK_PLUGIN} is not in the plugin list with options: its analytics cannot be turned off. ` +
        "Update mobile/scripts/ad-glass.cjs to match app.config.ts.",
    )
  }

  // Mentra's team owns the id upstream bakes in. Ours comes from the signing
  // workflow; an unsigned build has none.
  const {appleTeamId: _upstreamTeamId, ...ios} = config.ios ?? {}
  const teamId = env.ADGLASS_APPLE_TEAM_ID?.trim()

  return {
    ...config,
    ios: {
      ...ios,
      ...(teamId ? {appleTeamId: teamId} : {}),
      infoPlist: adGlassInfoPlist(ios.infoPlist ?? {}),
    },
    plugins: [
      withAdGlassInfoPlist,
      ...plugins.filter((plugin) => !REMOVED_PLUGINS.has(pluginName(plugin))).map(adGlassPlugin),
      withAdGlassInfoPlist,
    ],
  }
}

module.exports = {AD_GLASS, isAdGlass, applyAdGlass, rebrandText, rebrandPrompts, withAdGlassInfoPlist}
