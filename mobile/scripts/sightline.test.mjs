// Run with: node --test mobile/scripts/sightline.test.mjs
import assert from "node:assert/strict"
import {createRequire} from "node:module"
import {test} from "node:test"

const require = createRequire(import.meta.url)
const {SIGHTLINE, applySightline, isSightline, rebrandPrompts, rebrandText, withSightlineInfoPlist} = require("./sightline.cjs")
const {resolveAndroidPackageName} = require("./android-package-name.cjs")

const BLUETOOTH = "./modules/bluetooth-sdk/app.plugin.js"

function upstreamConfig() {
  return {
    name: "Mentra",
    ios: {
      bundleIdentifier: SIGHTLINE.bundleId,
      appleTeamId: "T5XXXL6N36",
      infoPlist: {
        CFBundleDisplayName: "Sightline",
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

test("Sightline is the default and can be switched off for upstream's own tests", () => {
  assert.equal(isSightline({}), true)
  assert.equal(isSightline({SIGHTLINE_VARIANT: "off"}), false)
  const config = upstreamConfig()
  assert.equal(applySightline(config, {SIGHTLINE_VARIANT: "off"}), config)
})

test("the bundle id is ours whatever the region, track or build name", () => {
  assert.equal(resolveAndroidPackageName({region: "china", buildName: "stable", track: "dev"}), SIGHTLINE.bundleId)
})

test("permission prompts name Sightline, and the Mentra Live glasses keep their name", () => {
  const {infoPlist} = applySightline(upstreamConfig(), {}).ios
  assert.equal(infoPlist.NSMicrophoneUsageDescription, "Sightline uses your phone microphone for live captions.")
  assert.equal(infoPlist.NSLocationWhenInUseUsageDescription, "Sightline uses your location. Sightline shows directions.")
  assert.equal(
    infoPlist.NSLocalNetworkUsageDescription,
    "Sightline uses your local network to exchange photos with Mentra Live glasses.",
  )
  assert.equal(infoPlist.CFBundleName, "Sightline")
})

test("protocol identifiers are not rebranded", () => {
  const {infoPlist} = applySightline(upstreamConfig(), {}).ios
  assert.deepEqual(infoPlist.NSBonjourServices, ["_mentra-live._tcp", "_http._tcp"])
  assert.deepEqual(infoPlist.BGTaskSchedulerPermittedIdentifiers, ["com.mentra.background-timer"])
  assert.equal(rebrandText(42), 42)
})

test("Mentra's Apple team id is dropped, and ours is used only when the signing workflow provides it", () => {
  assert.equal("appleTeamId" in applySightline(upstreamConfig(), {}).ios, false)
  assert.equal(applySightline(upstreamConfig(), {SIGHTLINE_APPLE_TEAM_ID: " ABCDE12345 "}).ios.appleTeamId, "ABCDE12345")
})

test("Bluetooth SDK analytics are off and the Sentry build plugin is gone", () => {
  const {plugins} = applySightline(upstreamConfig(), {})
  const bluetooth = plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === BLUETOOTH)
  assert.deepEqual(bluetooth[1], {node: true, analytics: false})
  assert.equal(
    plugins.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === "@sentry/react-native/expo"),
    false,
  )
  assert.equal(plugins.includes("expo-router"), true)
})

test("library permission text and the splash image are ours", () => {
  const {plugins} = applySightline(upstreamConfig(), {})
  const byName = (name) => plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === name)[1]
  assert.equal(byName("expo-location").locationAlwaysAndWhenInUsePermission, "Allow Sightline to use your location.")
  assert.deepEqual(byName("expo-splash-screen"), {
    image: SIGHTLINE.splashLight,
    dark: {backgroundColor: "#171717", image: SIGHTLINE.splashDark},
  })
})

test("the build fails if the Bluetooth SDK plugin can no longer be found", () => {
  const config = upstreamConfig()
  config.plugins = config.plugins.filter((plugin) => !(Array.isArray(plugin) && plugin[0] === BLUETOOTH))
  assert.throws(() => applySightline(config, {}), /analytics cannot be turned off/)
})

test("Bluetooth SDK analytics are off even when upstream passes the plugin no options", () => {
  const isBluetooth = (plugin) => Array.isArray(plugin) && plugin[0] === BLUETOOTH
  for (const bare of [[BLUETOOTH], BLUETOOTH]) {
    const config = upstreamConfig()
    config.plugins = config.plugins.map((plugin) => (isBluetooth(plugin) ? bare : plugin))
    const bluetooth = applySightline(config, {}).plugins.filter(isBluetooth)
    assert.deepEqual(bluetooth, [[BLUETOOTH, {analytics: false}]])
  }
})

test("prompts that name the Xcode product, which stays Mentra, are ours too", () => {
  const config = upstreamConfig()
  config.plugins.push(["expo-camera", {cameraPermission: "Allow $(PRODUCT_NAME) to access your camera"}])
  const {plugins} = applySightline(config, {})
  const camera = plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-camera")
  assert.equal(camera[1].cameraPermission, "Allow Sightline to access your camera")
  // What a library plugin writes on its own while the native project is generated.
  assert.deepEqual(
    rebrandPrompts({
      NSLocationAlwaysUsageDescription: "Allow $(PRODUCT_NAME) to use your location",
      NSContactsUsageDescription: "Allow ${PRODUCT_NAME} or $(TARGET_NAME) to read contacts for MentraOS",
      NSLocalNetworkUsageDescription: "Mentra talks to Mentra Live glasses.",
      CFBundleName: "Mentra",
    }),
    {
      NSLocationAlwaysUsageDescription: "Allow Sightline to use your location",
      NSContactsUsageDescription: "Allow Sightline or Sightline to read contacts for Sightline",
      NSLocalNetworkUsageDescription: "Sightline talks to Mentra Live glasses.",
      CFBundleName: "Mentra",
    },
  )
  // The native-project pass is registered on both sides of every other plugin.
  assert.equal(plugins[0], withSightlineInfoPlist)
  assert.equal(plugins.at(-1), withSightlineInfoPlist)
})
