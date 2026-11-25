// Run with: node --test mobile/scripts/ad-glass.test.mjs
import assert from "node:assert/strict"
import {createRequire} from "node:module"
import {test} from "node:test"

const require = createRequire(import.meta.url)
const {AD_GLASS, SDK_UPDATE_CHECK_KEY, applyAdGlass, isAdGlass, rebrandText} = require("./ad-glass.cjs")
const {resolveAndroidPackageName} = require("./android-package-name.cjs")

const BLUETOOTH = "./modules/bluetooth-sdk/app.plugin.js"

function upstreamConfig() {
  return {
    name: "Mentra",
    scheme: "com.mentra",
    extra: {
      mentraBackendTarget: {schemaVersion: 1, coreUrl: "https://core.example"},
      MENTRA_APP_AGE_RATING: "12+",
    },
    ios: {
      bundleIdentifier: AD_GLASS.bundleId,
      appleTeamId: "T5XXXL6N36",
      infoPlist: {
        CFBundleDisplayName: "AD Glass",
        NSMicrophoneUsageDescription: "The Mentra App uses your phone microphone for live captions.",
        NSLocationWhenInUseUsageDescription: "Mentra uses your location. Mentra shows directions.",
        NSLocalNetworkUsageDescription: "Mentra uses your local network to exchange photos with Mentra Live glasses.",
        NSBonjourServices: ["_mentra-live._tcp", "_http._tcp"],
        BGTaskSchedulerPermittedIdentifiers: ["com.mentra.background-timer"],
        CFBundleURLTypes: [
          {CFBundleURLSchemes: ["com.mentra"]},
          {CFBundleURLSchemes: [`msauth.${AD_GLASS.bundleId}`]},
        ],
      },
    },
    plugins: [
      "expo-router",
      [BLUETOOTH, {node: true, analytics: {environment: "dev"}}],
      ["expo-splash-screen", {image: "./assets/logo/logo_light.png", dark: {backgroundColor: "#171717", image: "x"}}],
      ["expo-location", {locationAlwaysAndWhenInUsePermission: "Allow Mentra to use your location."}],
      ["@sentry/react-native/expo", {organization: "mentra-labs"}],
    ],
  }
}

test("AD Glass is the default and can be switched off for upstream's own tests", () => {
  assert.equal(isAdGlass({}), true)
  assert.equal(isAdGlass({AD_GLASS_VARIANT: "off"}), false)
  const config = upstreamConfig()
  assert.equal(applyAdGlass(config, {AD_GLASS_VARIANT: "off"}), config)
})

test("the bundle id is ours whatever the region, track or build name", () => {
  assert.equal(resolveAndroidPackageName({region: "china", buildName: "stable", track: "dev"}), AD_GLASS.bundleId)
})

test("permission prompts name AD Glass, and the Mentra Live glasses keep their name", () => {
  const {infoPlist} = applyAdGlass(upstreamConfig(), {}).ios
  assert.equal(infoPlist.NSMicrophoneUsageDescription, "AD Glass uses your phone microphone for live captions.")
  assert.equal(infoPlist.NSLocationWhenInUseUsageDescription, "AD Glass uses your location. AD Glass shows directions.")
  assert.equal(
    infoPlist.NSLocalNetworkUsageDescription,
    "AD Glass uses your local network to exchange photos with Mentra Live glasses.",
  )
  assert.equal(infoPlist.CFBundleName, "AD Glass")
})

test("protocol identifiers are not rebranded", () => {
  const {infoPlist} = applyAdGlass(upstreamConfig(), {}).ios
  assert.deepEqual(infoPlist.NSBonjourServices, ["_mentra-live._tcp", "_http._tcp"])
  assert.deepEqual(infoPlist.BGTaskSchedulerPermittedIdentifiers, ["com.mentra.background-timer"])
  assert.equal(rebrandText(42), 42)
})

test("Mentra's Apple team id is dropped, and ours is used only when the signing workflow provides it", () => {
  assert.equal("appleTeamId" in applyAdGlass(upstreamConfig(), {}).ios, false)
  assert.equal(applyAdGlass(upstreamConfig(), {ADGLASS_APPLE_TEAM_ID: " ABCDE12345 "}).ios.appleTeamId, "ABCDE12345")
})

test("Bluetooth SDK analytics are off and the Sentry build plugin is gone", () => {
  const {plugins} = applyAdGlass(upstreamConfig(), {})
  const bluetooth = plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === BLUETOOTH)
  assert.deepEqual(bluetooth[1], {node: true, analytics: false})
  assert.equal(
    plugins.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === "@sentry/react-native/expo"),
    false,
  )
  assert.equal(plugins.includes("expo-router"), true)
})

test("library permission text and the splash image are ours", () => {
  const {plugins} = applyAdGlass(upstreamConfig(), {})
  const byName = (name) => plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === name)[1]
  assert.equal(byName("expo-location").locationAlwaysAndWhenInUsePermission, "Allow AD Glass to use your location.")
  assert.deepEqual(byName("expo-splash-screen"), {
    image: AD_GLASS.splashLight,
    dark: {backgroundColor: "#171717", image: AD_GLASS.splashDark},
  })
})

test("the build fails if the Bluetooth SDK plugin can no longer be found", () => {
  const config = upstreamConfig()
  config.plugins = config.plugins.filter((plugin) => !(Array.isArray(plugin) && plugin[0] === BLUETOOTH))
  assert.throws(() => applyAdGlass(config, {}), /analytics cannot be turned off/)
  config.plugins.push(BLUETOOTH)
  assert.throws(() => applyAdGlass(config, {}), /analytics cannot be turned off/)
})

test("the URL scheme is adglass, and Mentra's is gone", () => {
  const config = applyAdGlass(upstreamConfig(), {})
  assert.equal(config.scheme, "adglass")
  assert.deepEqual(config.ios.infoPlist.CFBundleURLTypes, [
    {CFBundleURLSchemes: ["adglass"]},
    {CFBundleURLSchemes: [`msauth.${AD_GLASS.bundleId}`]},
  ])
})

test("the scheme is registered even if upstream stops listing URL types", () => {
  const config = upstreamConfig()
  delete config.ios.infoPlist.CFBundleURLTypes
  assert.deepEqual(applyAdGlass(config, {}).ios.infoPlist.CFBundleURLTypes, [{CFBundleURLSchemes: ["adglass"]}])
})

test("the build fails if a Mentra URL scheme would still be registered", () => {
  const config = upstreamConfig()
  config.ios.infoPlist.CFBundleURLTypes.push({CFBundleURLSchemes: ["com.mentra.dev"]})
  assert.throws(() => applyAdGlass(config, {}), /still registers a Mentra URL scheme: com\.mentra\.dev/)
})

test("the Bluetooth SDK update check is never switched on", () => {
  const config = upstreamConfig()
  config.ios.infoPlist[SDK_UPDATE_CHECK_KEY] = true
  assert.equal(SDK_UPDATE_CHECK_KEY in applyAdGlass(config, {}).ios.infoPlist, false)
  assert.equal(SDK_UPDATE_CHECK_KEY in applyAdGlass(upstreamConfig(), {}).ios.infoPlist, false)
})

test("no Core address is packaged in the app's config", () => {
  const {extra} = applyAdGlass(upstreamConfig(), {})
  assert.deepEqual(extra, {MENTRA_APP_AGE_RATING: "12+"})
  assert.equal(JSON.stringify(applyAdGlass(upstreamConfig(), {})).includes("core.example"), false)
})
