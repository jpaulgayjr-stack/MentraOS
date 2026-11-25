// Run with: node --test mobile/scripts/ad-glass.test.mjs
import assert from "node:assert/strict"
import {createRequire} from "node:module"
import {test} from "node:test"

const require = createRequire(import.meta.url)
const {AD_GLASS, applyAdGlass, isAdGlass, rebrandPrompts, rebrandText, withAdGlassInfoPlist} = require("./ad-glass.cjs")
const {resolveAndroidPackageName} = require("./android-package-name.cjs")

const BLUETOOTH = "./modules/bluetooth-sdk/app.plugin.js"

function upstreamConfig() {
  return {
    name: "Mentra",
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

test("Bluetooth SDK analytics are off even when upstream passes the plugin no options", () => {
  const config = upstreamConfig()
  const isBluetooth = (plugin) => Array.isArray(plugin) && plugin[0] === BLUETOOTH
  config.plugins = config.plugins.map((plugin) => (isBluetooth(plugin) ? [BLUETOOTH] : plugin))
  const bluetooth = applyAdGlass(config, {}).plugins.find(isBluetooth)
  assert.deepEqual(bluetooth[1], {analytics: false})
})

test("prompts that name the Xcode product, which stays Mentra, are ours too", () => {
  const config = upstreamConfig()
  config.plugins.push(["expo-camera", {cameraPermission: "Allow $(PRODUCT_NAME) to access your camera"}])
  const {plugins} = applyAdGlass(config, {})
  const camera = plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-camera")
  assert.equal(camera[1].cameraPermission, "Allow AD Glass to access your camera")
  // What a library plugin writes on its own while the native project is generated.
  assert.deepEqual(
    rebrandPrompts({
      NSLocationAlwaysUsageDescription: "Allow $(PRODUCT_NAME) to use your location",
      NSLocalNetworkUsageDescription: "Mentra talks to Mentra Live glasses.",
      CFBundleName: "Mentra",
    }),
    {
      NSLocationAlwaysUsageDescription: "Allow AD Glass to use your location",
      NSLocalNetworkUsageDescription: "AD Glass talks to Mentra Live glasses.",
      CFBundleName: "Mentra",
    },
  )
  // The native-project pass is registered on both sides of every other plugin.
  assert.equal(plugins[0], withAdGlassInfoPlist)
  assert.equal(plugins.at(-1), withAdGlassInfoPlist)
})
