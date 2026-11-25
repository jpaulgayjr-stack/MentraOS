import {describe, expect, test} from "bun:test"

import {isCloudlessConfig, speechProcessingRefusal, speechProcessingWithoutCloud} from "../cloudless"
import {needsLocal, targetSource, type SpeechProcessing} from "../TranscriptionRouting"

describe("a cloudless engine config", () => {
  test("is one whose Core and Runtime are both explicitly null", () => {
    expect(isCloudlessConfig({coreUrl: null, runtimeUrl: null})).toBe(true)
  })

  test.each([
    {coreUrl: "https://core.example", runtimeUrl: null},
    {coreUrl: null, runtimeUrl: "https://runtime.example"},
    {coreUrl: "https://core.example", runtimeUrl: "https://runtime.example"},
    // Unset is an unconfigured host, which keeps the engine's own defaults.
    {},
    {coreUrl: null},
    {runtimeUrl: null},
    {coreUrl: "", runtimeUrl: ""},
  ])("is not %j", (config) => {
    expect(isCloudlessConfig(config)).toBe(false)
  })
})

const ALL: SpeechProcessing[] = ["preferCloud", "preferLocal", "localOnly"]

describe("transcription where cloud speech is off and on-device speech is on", () => {
  test.each(ALL)("accepts a %s listener", (processing) => {
    expect(speechProcessingRefusal(processing, {cloud: false, onDevice: true})).toBeNull()
  })

  // LocalMiniappRuntime.cloudSpeechUp() is `cloudSpeech enabled && session connected`, so with cloud speech off the
  // routing state always says the cloud is not connected. Every listener is then on-device, and needs it running.
  test.each(ALL)("routes a %s listener on-device, whatever it listens for", (processing) => {
    for (const stream of ["transcription:auto", "transcription:en-US", "transcription:fr-FR"]) {
      for (const localLanguage of [null, "en-US"]) {
        const state = {cloudConnected: false, onDevice: true, localLanguage, pickedLanguage: "en-US", hints: ["fr"]}
        expect(targetSource({stream, processing}, state)).toBe("local")
        if (stream !== "transcription:fr-FR") expect(needsLocal({stream, processing}, null, state)).toBe(true)
      }
    }
  })
})

describe("the other speech deployments keep upstream's answers", () => {
  test("everything is accepted where both are on", () => {
    for (const processing of ALL) expect(speechProcessingRefusal(processing, {cloud: true, onDevice: true})).toBeNull()
  })

  test("on-device requests are refused where on-device speech is off", () => {
    expect(speechProcessingRefusal("localOnly", {cloud: true, onDevice: false})).toBe(
      "On-device speech is disabled by this deployment",
    )
    expect(speechProcessingRefusal("preferCloud", {cloud: true, onDevice: false})).toBeNull()
    expect(speechProcessingRefusal("preferLocal", {cloud: true, onDevice: false})).toBeNull()
  })

  test("everything is refused where both are off", () => {
    expect(speechProcessingRefusal("localOnly", {cloud: false, onDevice: false})).toBe(
      "On-device speech is disabled by this deployment",
    )
    expect(speechProcessingRefusal("preferCloud", {cloud: false, onDevice: false})).toBe(
      "Cloud speech is disabled by this deployment",
    )
    expect(speechProcessingRefusal("preferLocal", {cloud: false, onDevice: false})).toBe(
      "Cloud and on-device speech are disabled by this deployment",
    )
  })
})

describe("speaking where cloud speech is off", () => {
  test.each(ALL)("a %s request is on-device only", (requested) => {
    expect(speechProcessingWithoutCloud(requested, false)).toBe("localOnly")
  })

  test.each(ALL)("a %s request is left alone where cloud speech is on", (requested) => {
    expect(speechProcessingWithoutCloud(requested, true)).toBe(requested)
  })
})
