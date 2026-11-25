/// <reference types="bun-types" />

import {describe, expect, mock, test} from "bun:test"
import {readFileSync} from "node:fs"

import {readSpeechProcessing} from "../TranscriptionRouting"
import {prepareTtsSentences} from "../TtsTextSanitizer"

// AD Glass: where cloud speech is off, speak() is on-device or it fails. It never asks the cloud, whatever the
// miniapp asked for and whatever the cloud client claims. Runs the real handler, as LocalMiniappRuntime.speech.test.ts
// does. See docs/ad-glass/spec-phase2.md.
const source = readFileSync(new URL("../LocalMiniappRuntime.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n")
const methods = ["handleSpeak", "cancelSpeech"]
  .map((name) => {
    const start = source.search(new RegExp(`^  private (?:async )?${name}\\(`, "m"))
    if (start < 0) throw new Error(`Missing runtime method ${name}`)
    const rest = source.slice(start)
    const end = rest.search(/^ {2}\}$/m)
    if (end < 0) throw new Error(`Missing end of runtime method ${name}`)
    return rest.slice(0, end + 3)
  })
  .join("\n")
const constantsStart = source.indexOf("const CLOUD_SPEECH_FORMAT")
const constants = source.slice(constantsStart, source.indexOf("const DIAGNOSTIC_MAX_LIST_ITEMS", constantsStart))
const compiled = new Bun.Transpiler({loader: "ts"}).transformSync(`${constants}\nclass Host { ${methods} }`)

type Completion = (
  id: string,
  success: boolean,
  error: string | null,
  duration: number | null,
  reason: "completed" | "interrupted" | "error",
) => void

function createHost(options: {cloudSpeech: boolean; offlineAvailable?: boolean; cloudConnected?: boolean}) {
  const {cloudSpeech, offlineAvailable = true, cloudConnected = true} = options
  const plays: Array<{request: {requestId: string; audioUrl: string}; complete: Completion}> = []
  const streams: unknown[] = []
  const ttsModelManager = {
    isModelAvailable: mock(async () => offlineAvailable),
    getAvailableLanguages: () => [{code: "en"}],
    synthesizeToFile: mock(async () => ({audioUrl: "file://offline.wav", cleanup: mock(async () => {})})),
  }
  const audioPlaybackService = {
    play: mock(async (request: {requestId: string; audioUrl: string}, complete: Completion) => {
      plays.push({request, complete})
    }),
    playPcmUrl: mock(async (request: unknown) => {
      streams.push(request)
    }),
    cancelPlayback: mock((_id: string) => {}),
  }
  // A cloud client that would happily answer: the handler must not ask it.
  const ttsSpeak = mock(async () => ({audioUrl: "https://runtime.test/api/tts/speak?x"}))
  const features: Record<string, boolean> = {cloudSpeech, onDeviceSpeech: true}
  const Host = new Function(
    "prepareTtsSentences",
    "readSpeechProcessing",
    "cloudClientService",
    "ttsModelManager",
    "audioPlaybackService",
    "isFeatureEnabled",
    "MiniappErrorCode",
    "LOG_TAG",
    `${compiled}; return Host`,
  )(
    prepareTtsSentences,
    readSpeechProcessing,
    {isConnected: () => cloudConnected, tts: {speak: ttsSpeak}},
    ttsModelManager,
    audioPlaybackService,
    (feature: string) => features[feature] !== false,
    {INTERNAL: "INTERNAL", TTS_UPSTREAM_ERROR: "TTS_UPSTREAM_ERROR", TTS_LOCAL_UNAVAILABLE: "TTS_LOCAL_UNAVAILABLE"},
    "TEST",
  )
  const host = new Host()
  host.speechRuns = new Map()
  host.setSpeakerState = mock(() => {})
  host.sendResult = mock(() => {})
  return {host, plays, streams, ttsModelManager, ttsSpeak}
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const REQUESTS: Array<[string, Record<string, unknown>]> = [
  ["no processing (the default, preferCloud)", {}],
  ["preferCloud", {processing: "preferCloud"}],
  ["preferLocal", {processing: "preferLocal"}],
  ["localOnly", {processing: "localOnly"}],
  ["the older forceLocal flag", {forceLocal: true}],
]

describe("speaking where cloud speech is off", () => {
  test.each(REQUESTS)("%s is spoken on-device, and the cloud is not asked", async (_name, request) => {
    const {host, plays, streams, ttsSpeak, ttsModelManager} = createHost({cloudSpeech: false})
    await host.handleSpeak("com.domingueandco.adhome", {text: "Next meeting at three.", ...request}, "speak-1")
    await settle()
    expect(ttsSpeak).not.toHaveBeenCalled()
    expect(streams).toHaveLength(0)
    expect(ttsModelManager.synthesizeToFile).toHaveBeenCalledTimes(1)
    expect(plays).toHaveLength(1)
    expect(plays[0].request.audioUrl).toBe("file://offline.wav")
  })

  test.each(REQUESTS)("%s fails cleanly when the on-device voice is missing, without the cloud", async (_name, request) => {
    const {host, plays, streams, ttsSpeak} = createHost({cloudSpeech: false, offlineAvailable: false})
    await host.handleSpeak("com.domingueandco.adhome", {text: "Next meeting at three.", ...request}, "speak-2")
    await settle()
    expect(ttsSpeak).not.toHaveBeenCalled()
    expect(streams).toHaveLength(0)
    expect(plays).toHaveLength(0)
    expect(host.sendResult).toHaveBeenCalledTimes(1)
    const [, requestId, success, , error] = host.sendResult.mock.calls[0]
    expect(requestId).toBe("speak-2")
    expect(success).toBe(false)
    expect(error).toMatchObject({code: "TTS_LOCAL_UNAVAILABLE"})
  })
})

describe("speaking where cloud speech is on (upstream behaviour, for contrast)", () => {
  test("the default request does ask the cloud", async () => {
    const {host, ttsSpeak} = createHost({cloudSpeech: true})
    await host.handleSpeak("com.example.speech", {text: "Hello."}, "speak-3")
    await settle()
    expect(ttsSpeak).toHaveBeenCalledTimes(1)
  })
})
