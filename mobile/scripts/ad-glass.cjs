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
  return value
    .replace(/\bThe Mentra App\b/g, AD_GLASS.appName)
    .replace(/\bthe Mentra App\b/g, AD_GLASS.appName)
    .replace(/\bMentra\b(?! Live)/g, AD_GLASS.appName)
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
  if (!options || typeof options !== "object") return plugin
  if (name === BLUETOOTH_SDK_PLUGIN) {
    // The SDK's usage analytics post to Mentra's PostHog project and are on by
    // default, whatever the app's own telemetry policy says.
    return [name, {...options, analytics: false}]
  }
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
  const infoPlist = mapValues(ios.infoPlist ?? {}, (key, value) =>
    /UsageDescription$/.test(key) ? rebrandText(value) : value,
  )

  return {
    ...config,
    ios: {
      ...ios,
      ...(teamId ? {appleTeamId: teamId} : {}),
      // The Xcode project keeps upstream's name; this is the name iOS reports.
      infoPlist: {...infoPlist, CFBundleName: AD_GLASS.appName},
    },
    plugins: plugins.filter((plugin) => !REMOVED_PLUGINS.has(pluginName(plugin))).map(adGlassPlugin),
  }
}

module.exports = {AD_GLASS, isAdGlass, applyAdGlass, rebrandText}
