# AD Glass, phase 2a spec: cut the cord

Status: draft for review, 2026-11-25. Owner: Paul. Engineering: Claude.
Branch: `ad-glass/phase2` on `jpaulgayjr-stack/MentraOS`, based on `ad-glass/rebrand` (PR 1 had not merged when this branch was cut; the PR for this work targets `ad-glass/main` and shows only its own diff once PR 1 merges).

Everything stated about the code was read from this checkout unless it carries a confidence tag. Line numbers are as of the base commit `6adcee24b`.

## 1. Goal

AD Glass opens straight to its home screen as a single local user, pairs the Even G2 glasses and the R1 ring, and runs AD Home, without ever contacting a server that Mentra owns.

"Done" for phase 2a:

1. This spec is committed before code.
2. The unsigned simulator build is green on `ad-glass/phase2`.
3. On the GitHub runner, the built app boots in an iOS Simulator with every Mentra hostname in section 9 pointed at a sinkhole, reaches the home screen with no login, and the sinkhole records zero connection attempts. Screenshot and log are attached to the run.
4. A draft PR is open inside the fork and has had a fresh-context adversarial review.
5. Paul has the on-device checklist (section 10): Bluetooth cannot be exercised in a simulator.

## 2. Decisions

All Claude-decided under the 2026-10-19 delegation unless marked.

| Topic | Decision | Why |
|---|---|---|
| Identity | One local user, id `local:adglass`, no email, no password, no account screens. Provided by a new `LocalAuthProvider` behind the existing `mentraAuth` seam (`src/utils/auth/authClient.ts`). | Every consumer of auth (boot, deep links, engine storage partition, per-account settings) already goes through that seam, so one new provider replaces the whole Mentra account client with no fake server. |
| Session token | The local session carries the constant `local-device` as its token. It is a marker, not a credential: there is no server to present it to. | Three upstream gates test `session.token` for truthiness (`index.tsx:159`, `DeeplinkContext.tsx:564-574`, `backgroundRecovery.ts:32`). A constant keeps those files unedited. |
| Deployment | The embedded manifest becomes `ad-glass-local`: `services.coreUrl` and `runtimeUrl` are `null`, `auth.mode` is the new `"local"`, every cloud feature flag is `false`, `telemetry` is `false`. It reads no environment variable. | The manifest type already allows null services. Hard-coding beats configuration: a stray `EXPO_PUBLIC_CLOUD_CORE_URL` in a build environment cannot bring the cloud back. |
| "Cloudless" test | One predicate, `isCloudless(manifest)`: both service URLs are null. Host and engine each have a copy of this one-line rule. | The engine is a separate package and must not import app code. |
| Fresh install | The deployment store starts resolved. There is no "Mentra or organization" chooser and no organization (Microsoft Entra) path. | `index.tsx:357` sends an unresolved install to `/auth/start`. |
| Debug URL overrides | Ignored while the manifest is cloudless. | A saved dev override (`cloud_core_url` setting) would otherwise repoint the app at a server. |
| Boot | `index.tsx` skips the version check, the cached version floor and the token exchange; it starts the engine and goes to home. The first-run "welcome" carousel is skipped: home already shows the "Pair glasses" card. | Task requirement: boot straight to home. |
| Engine with no cloud | `CloudClientService.construct()` returns without building a client when the config is cloudless. `hasCore()` is then false, which already gates support-profile sync, fleet, crash reports and the core-token push to the glasses (`engine.ts:119-146`). | Today `engine.start()` throws at `engine.ts:80` with no Runtime, so nothing starts. One guard at the single place a client is built covers every lazy caller. |
| Storage identity | The host passes `auth.getUserId = () => "local:adglass"` and no `getSubjectToken`. | `resolveMentraUserId()` (`CloudClientService.ts:762`) uses the host id first. Without it a miniapp's storage calls fail with `NOT_CONNECTED`, which would break AD Home's notes. |
| Speech to text | With cloud speech off, `preferCloud` and `preferLocal` are both treated as `localOnly`. | Today a default-option listener is refused ("Cloud speech is disabled by this deployment", `LocalMiniappRuntime.ts:292`) instead of being served on-device. `localOnly` is the only value that can never select a cloud path. |
| Text to speech | Same coercion (it shares `readSpeechProcessing`), so `speak` goes on-device or fails cleanly with `TTS_LOCAL_UNAVAILABLE`. | `LocalMiniappRuntime.ts:3009-3016`. |
| System miniapps | Keep the screens compiled into the app: Settings, Gallery, Mirror, Notifications, Miniapp Developer. Hide Feedback (it only files reports with Mentra). Install none of the twelve downloaded ones (AI, Call, Captions, Notes, Navigation and others): `miniapps.defaults` is empty and `firstPartyMiniappsUrl` is null. | The five kept ones are routes in the binary (`BuiltInMiniappCatalog.ts:205-333`); nothing is downloaded for them. Seven of the twelve downloads have no source in this repo, and a G2 user needs none of them to run AD Home. |
| AD Home install | **Scan the release QR from Paul's laptop**, exactly as he installs it today: `scripts\release.cmd` in the AD Home repo, then AD Glass > Settings > Miniapp Developer > Scan. It installs as a local build and keeps running without the laptop. | See section 6. |
| Ring pairing entry | "Pair controller" in Settings is shown always, not only in super mode. | It is the only route to `/pairing/select-controller` (`DeviceSettingsSection.tsx:294`), and the ring fix is the reason this fork exists. |
| URL scheme | `adglass`. Applied in `scripts/ad-glass.cjs`; the code reads `APP_SCHEME` instead of the literal `com.mentra`. | Mentra sign-in no longer returns through the scheme, and AD Glass must not answer links meant for the Mentra app installed on the same phone. |
| Bluetooth SDK update check | Runs only if the Info.plist key `MentraBluetoothSdkUpdateCheckEnabled` is `true`. AD Glass never sets it. | The request to `core.mentraglass.com` is hard-coded in native code and ignores every other setting. Opt-in fails closed if a config step is ever lost. |
| Firmware updates | `mentraLiveOtaManifestUrl` is null and the legacy fallback is off. | OTA code serves Mentra Live and AR99 hardware. The G2 has `hasOta` false and never reaches it. |
| Links, wallpapers, store | Privacy and terms links point at the fork notice in this repository. Wallpaper list is empty. App Store and review links are null (`appUpdates.mode: "managed"`). | They were Mentra URLs. The manifest type requires a URL for the two legal links. |

Rejected alternatives:

- **Keep `auth.mode: "mentra-account"` and detect local mode only from null URLs.** Smaller diff, but the manifest would claim a Mentra account that does not exist.
- **A stub server inside the app that answers Core's API.** Explicitly out: faking a server keeps every cloud code path alive and one config slip away from the real one.
- **Delete the auth screens, account client and cloud client now.** Large diff against upstream for no change in behaviour: they are unreachable once the gate is gone. Deleting dead code is phase 2b, when the vendor packages go too.

## 3. Inputs

- Base: `ad-glass/rebrand` (`6adcee24b`): upstream `dev` + ring fix + ONNX fix + rebrand.
- `spec-phase1.md` section 10 (the host and cloud-call inventory) is the checklist; section 8 of this file maps each row to what now happens.
- No secrets, no Apple account, no new service.

## 4. Outputs

### New files

| File | What |
|---|---|
| `mobile/src/services/deployment/adGlassManifest.ts` | The `ad-glass-local` manifest and `isCloudless()` |
| `mobile/src/utils/auth/provider/localClient.ts` | `LocalAuthProvider` |
| `mobile/modules/engine/src/services/cloudless.ts` | Engine-side `isCloudlessConfig()` and the speech coercion |
| Tests beside each of the above, and `mobile/scripts/ad-glass-hosts.test.mjs` | See section 7 |
| `mobile/scripts/ad-glass-blocked-hosts.txt` | Every Mentra hostname the simulator job sinkholes (section 9) |
| `mobile/scripts/ad-glass-sim-boot.sh`, `ad-glass-sinkhole.py`, `ad-glass-ocr.swift` | Simulator boot proof (section 7) |

### Upstream files edited (kept as small as possible)

| File | Edit |
|---|---|
| `mobile/src/services/deployment/officialManifest.ts` | `createOfficialManifest()` returns the AD Glass manifest; no environment reads remain |
| `mobile/src/services/deployment/types.ts` | Add `{mode: "local"}` to the auth union |
| `mobile/src/services/deployment/store.ts` | Start resolved on the embedded local deployment; ignore any persisted workspace selection |
| `mobile/src/services/deployment/debugOverrides.ts` | No Core or Runtime override on a cloudless manifest |
| `mobile/src/services/cloudClient.ts` | `resolvedEndpoints()` typed as nullable; `allowLegacyOtaFallback` false when cloudless |
| `mobile/src/utils/auth/authClient.ts` | Pick `LocalAuthProvider` on a local deployment |
| `mobile/src/contexts/AuthContext.tsx` | Telemetry flag from the manifest instead of a literal `true`; `logout` is a no-op for the local user |
| `mobile/src/app/index.tsx` | Local boot path; no version check, no cached floor, no token gate, no welcome carousel |
| `mobile/src/services/MantleManager.ts` | Local auth seam (`getUserId` only) |
| `mobile/src/services/miniapps/defaultMiniapps.ts` | No Core means the manifest's (empty) list, not "waiting for connection" |
| `mobile/src/services/miniapps/BuiltInMiniappCatalog.ts` | Hide Feedback when cloudless |
| `mobile/src/effects/AllEffects.tsx` | Do not mount `FleetSheets` when cloudless |
| `mobile/src/app/miniapps/settings/main.tsx` | Hide the Profile and Feedback rows when cloudless |
| `mobile/src/components/settings/DeviceSettingsSection.tsx` | "Pair controller" without super mode |
| `mobile/src/contexts/DeeplinkContext.tsx`, `mobile/src/app/+native-intent.tsx`, `mobile/src/services/miniapps/miniappInstallLinks.ts`, `mobile/src/constants/appConfig.ts` | Scheme from `APP_SCHEME`; an unmatched link goes home, not to `/auth/start` |
| `mobile/modules/engine/src/services/CloudClientService.ts` | Cloudless guard in `construct()` |
| `mobile/modules/engine/src/services/TranscriptionRouting.ts` (or its two call sites) | Speech coercion |
| `mobile/modules/bluetooth-sdk/ios/Source/internal/BluetoothSdkUpdateCheck.swift` | Opt-in guard at the top of `start()` |
| `mobile/scripts/ad-glass.cjs`, `ad-glass.test.mjs` | Scheme `adglass`; guard that the update-check key is absent |
| `.github/workflows/ad-glass-ios-simulator.yml` | Canary environment, static guards, unit tests, simulator boot job |
| Upstream tests that assert the old behaviour (`officialManifest.test.ts`, `__tests__/app/version-reset.test.tsx`) | Rewritten or removed, listed in the PR |

Not touched: `mobile/modules/bluetooth-sdk/ios/Source/sgcs/G2.swift`, the pairing screens, the miniapp runtime's launch path, Android sources.

## 5. Boot sequence after this change

1. `_layout.tsx` loads settings and mounts providers (unchanged). Sentry stays uninitialized (empty DSN, telemetry false).
2. `DeploymentStore` constructs with the embedded local manifest, already resolved.
3. `AuthProvider` asks `mentraAuth.getSession()`. The lazy client sees `auth.mode === "local"` and builds `LocalAuthProvider`, which answers from memory: user `local:adglass`, token marker `local-device`. `openAccountSettings("local:adglass")` opens that user's settings store.
4. `index.tsx` waits for auth and navigation, then on a cloudless deployment runs `mantle.init()` and navigates. No network call is made on this path.
5. `MantleManager.initialize()` configures the engine with `auth: {getUserId}` and the cloudless config. `engine.start()` skips the cloud client, the audio uplink (flags off), and every `hasCore()` service; Bluetooth, device events, settings sync, the local miniapp runtime and the display processor start as before.
6. `defaultMiniapps.sync` finds an empty list and goes idle. `miniappUpdateScheduler` still checks each installed miniapp against its own URL (AD Home's is the laptop address; unreachable is a quiet no-op).
7. Home renders: "Pair glasses" on a first run, otherwise glasses and controller status and the miniapp grid.

## 6. Miniapps without the cloud

### Which system miniapps are what

- **Compiled into the app** (`BuiltInMiniappCatalog.ts`): `com.mentra.settings`, `com.mentra.camera` (Gallery), `com.mentra.mirror`, `com.mentra.feedback`, `cloud.augmentos.notify`, `com.mentra.miniappdev`. No download.
- **Downloaded** from `<firstPartyMiniappsUrl><package>/` (`SYSTEM_MINIAPP_PACKAGES`, `src/constants/miniapps.ts:45-58`): ai, call, enterprise, link, livestreamer, merge, notes, captions, navigation, recorder, teleprompter, translation. Source for five of them is in `miniapps/`; the other seven are not in the repository.

Phase 2a keeps the first group minus Feedback and installs none of the second. If Paul wants Captions or Translation on the glasses later, they can be built from `miniapps/` and installed the same way as AD Home; that is a follow-up, not a blocker.

### AD Home: three options, one chosen

| Option | Domain rule | Cost | Verdict |
|---|---|---|---|
| **A. Release QR from the laptop** (`miniapp://release?url=http://<laptop>:<port>`) | Not applied, by design: a local-network address can never satisfy the rule (`miniapp-url.ts:105-113`), so the installer takes the developer path (`manualMiniappInstall.ts`), stores a snapshot marked as a local build, and never contacts the registry. This is what the rule's authors intended for a developer's own build, so nothing is being bypassed. | Zero new infrastructure. Needs the laptop and phone on the same Wi-Fi at install time only. | **Chosen for 2a.** It is the flow Paul already uses, and it has no Mentra dependency. |
| B. Its own HTTPS URL, for example `https://adhome.domingueandco.com/` | Satisfied honestly: `com.domingueandco.adhome` begins with the reversed registrable domain of the host. Installs through "Add a miniapp" as an ordinary release and self-updates from that URL. | A DNS record and static hosting (Paul-only: DNS). The registry call fails quietly with no Core (`installMiniapp.ts:638-641`). | The right long-term answer. Follow-up. |
| C. Bundle the ZIP into the app binary | The dormant `bundled_asset` path trusts it fully. | AD Home's bundle would be published in a public repository, and every AD Home change would need a new TestFlight build. | Rejected. |

Requirements option A places on this change: miniapp development must stay allowed (`approvedPackageNamesOverride: null`), the Miniapp Developer screen must stay reachable from Settings (it is, `main.tsx:124-130`), and the storage identity must resolve without Core (section 2).

Known limit, stated plainly: a local build carries no publisher identity. Anyone who can make Paul scan a QR on his own Wi-Fi could install a build named `com.domingueandco.adhome`. That is true of the Mentra app today as well. Option B removes it.

### What a miniapp can no longer get

`session.getToken()` style Mentra miniapp tokens (none without Core; `LocalMiniappRuntime.ts:1835` returns null and the miniapp still connects), cloud transcription, cloud speech, managed photo and stream upload, Teams meetings, maps. AD Home uses none of these.

A miniapp whose age rating is above the app's own cannot launch: the gate needs a declared age from Core (`miniappAgeGate.ts:200-216`). AD Home declares no rating. Follow-up if it ever matters.

## 7. Verification

### Unit tests (run locally and in the workflow)

- `adGlassManifest.test.ts`: services null, flags false, telemetry false, no `mentraglass` or `mentra.glass` string anywhere in the manifest, and the same result whatever `EXPO_PUBLIC_CLOUD_*` says.
- `localClient.test.ts`: session, user and subscription behaviour; `getSubjectToken`, sign-in and sign-up reject; no `fetch` is called.
- `store` and `debugOverrides` tests: resolved on first run; a saved override does not change null services.
- Engine (`bun test`): cloudless config builds no client and `init()` does not throw; speech coercion table; `targetSource` stays `local`.
- `ad-glass.test.mjs`: scheme is `adglass` in `scheme` and `CFBundleURLTypes`; no `com.mentra` scheme remains; the update-check opt-in key is absent.
- `ad-glass-hosts.test.mjs`: every `*.mentraglass.com`, `*.mentraglass.cn` and `mentra.glass` hostname that appears in `mobile/src`, `mobile/modules/*/src`, `mobile/modules/*/ios/Source` and `cloud-v2/packages/cloud-client/src` is in the blocked-hosts list, so a host that upstream adds later fails the build until it is triaged.

### Static guards on the built app (workflow)

- The job builds with canary values in `EXPO_PUBLIC_CLOUD_CORE_URL`, `EXPO_PUBLIC_CLOUD_RUNTIME_URL`, `EXPO_PUBLIC_MINIAPPS_URL` and `EXPO_PUBLIC_DIRECTORY_URL`, then fails if any canary string is in `main.jsbundle` or in the packaged Expo config. This is the "packaged manifest has a non-null Core or Runtime" guard: the manifest is code, so the proof is that nothing in the bundle read those variables. The deployment id `ad-glass-local` must be present.
- `Info.plist`: URL schemes contain `adglass` and not `com.mentra`; `MentraBluetoothSdkUpdateCheckEnabled` is absent; the phase 1 checks stay.
- Source grep: the opt-in guard is still in `BluetoothSdkUpdateCheck.swift` (it must survive upstream merges, like the ring fix).

### Simulator boot with Mentra blocked (workflow)

1. Append every hostname in `ad-glass-blocked-hosts.txt` to the runner's `/etc/hosts`, pointing at `127.0.0.1`, and flush the DNS cache. The simulator uses the Mac's resolver.
2. Start a sinkhole on `127.0.0.1` ports 80 and 443 that accepts, logs and closes every connection.
3. Boot a simulator, install the built app, launch it, wait, take screenshots.
4. Pass conditions: the app process is still running; text recognition (Apple's Vision framework, already on the runner) finds the home screen's "Pair glasses" text and no sign-in text; the sinkhole log is empty.
5. `xcrun simctl openurl booted adglass://...` opens the app (scheme registered).
6. Screenshots, recognized text and the sinkhole log are uploaded as artifacts.

The sinkhole is used instead of an unroutable address because it proves more: an unroutable address only shows the app survives a failed call, the sinkhole shows no call was attempted.

Limits of this proof, stated plainly: it covers boot and the idle home screen for about a minute. It does not cover code that runs only with glasses connected, only on a screen nobody opened, or only after hours (the six-hour support-profile timer is covered by the engine gate and its unit test, not by observation). It also cannot see a host that is not in the blocked list, which is what the hosts test above is for.

### Cannot be verified without Paul's phone

Bluetooth does not exist in the simulator. Pairing, reconnection, the display, the microphone path, on-device transcription with real audio, the calendar and location permissions, the QR install over Wi-Fi and the share sheet are all unverified until the first TestFlight build. Section 10 is the checklist.

## 8. Phase 1 inventory, row by row

| # | Area | After phase 2a |
|---|---|---|
| 1 | Accounts and login | `LocalAuthProvider`; `accountClient.ts` is never constructed. Auth screens remain in the bundle but nothing navigates to them (the deep-link fallback goes home). Authing and Entra code is unreachable; removal is 2b |
| 2 | Version check | Not called on a cloudless deployment; the cached floor is never read. Bluetooth SDK update check is opt-in and off |
| 3 | Support profile, fleet, workspaces, declared age, core token to glasses | Not started: `hasCore()` is false. `FleetSheets` is not mounted |
| 4 | Miniapp directory, defaults, registry | No defaults, no first-party host, no directory URL. Registry calls throw locally before any request and installs continue |
| 5 | Firmware and OTA | No manifest URL, no legacy fallback, so the update check returns before any fetch. The legacy URL constants remain in source for Mentra Live glasses only |
| 6 | Wallpapers, onboarding video | Empty list. `onboarding/live.tsx` is Mentra Live only and is not reached with a G2 |
| 7 | Telemetry | Sentry, Firebase and PostHog already off (phase 1). Report services not started (`hasCore()`), Feedback hidden |
| 8 | Speech | Cloud flags off, no client, coercion to `localOnly`. Sherpa model downloads from GitHub and Hugging Face stay |
| 9 | Realtime session, camera, streams, meetings | No client is built; each entry point throws "cloud client not connected" before any request |
| 10 | Maps | `navigation` flag off. The Mapbox SDK is still linked; removal is 2b |
| 11 | Links | Fork notice. Universal links were already dropped |

## 9. Hostnames blocked in the simulator job

Kept in `mobile/scripts/ad-glass-blocked-hosts.txt`; the list there is authoritative and the hosts test keeps it complete. It includes Core and Runtime for production, staging and dev in every region found in the source, `core.mentraglass.com`, `miniapps*.mentraglass.com`, `api.apps*.mentraglass.com`, `apps.mentraglass.com`, `apps.mentra.glass`, `ota.mentraglass.com`, `mtkfirmware.mentraglass.com`, `artifactscdn.mentraglass.com`, `mentra-wallpapers.mentraglass.com`, `mentra-videos-cdn.mentraglass.com`, `asset.mentraglass.cn`, `mentraglass.com`, `docs.mentraglass.com`, `api.mentra.glass`, plus PostHog (`us.i.posthog.com`) and Sentry ingest as a second line behind the phase 1 switches.

## 10. On-device checklist for Paul (first TestFlight build)

1. Put the phone in airplane mode with Wi-Fi off. Open AD Glass. It opens to the home screen with a "Pair glasses" card and never shows a sign-in screen.
2. Turn Wi-Fi back on. Tap Pair glasses, choose Even Realities G2, follow the steps. The glasses connect and show the AD Glass idle screen.
3. Settings > Pair controller > R1. The ring pairs and a ring press does something on the glasses.
4. Force-quit the app, reopen it. Glasses and ring reconnect on their own.
5. On the laptop run `scripts\release.cmd` in the AD Home folder. In AD Glass: Settings > Miniapp Developer > Scan, scan the QR. AD Home installs and opens.
6. Turn the laptop off. AD Home still opens and shows time, weather and calendar on the glasses.
7. Say a voice note in AD Home. It is transcribed (the first use downloads the speech model from GitHub, about a minute on Wi-Fi).
8. Add a note, force-quit, reopen: the note is still there.
9. Use the share button on a note: the iOS share sheet opens.
10. Leave it running for a day with the Mentra app deleted from the phone.

## 11. Edge cases

- **Mentra's store app on the same phone.** Different bundle id, different URL scheme, separate storage. Both will fight for the glasses' Bluetooth connection: delete the store app or keep it closed.
- **Upgrade from a phase 1 build.** None exists on any phone, so there is no stored Mentra session or deployment selection to migrate. The store still ignores a persisted workspace selection defensively.
- **A saved cloud URL override or OTA override in settings.** Ignored on a cloudless manifest. The OTA override was already inert outside super mode.
- **A link to `apps.mentraglass.com/package/...` tapped inside AD Glass.** With no directory URL the app hands it to the browser, as upstream does. Nothing is fetched by the app.
- **Speech model not downloaded and no network.** Transcription reports `downloading` or `unavailable`; text to speech fails with `TTS_LOCAL_UNAVAILABLE`. Neither tries a cloud path.
- **A miniapp that asks for `preferCloud`.** Served on-device.
- **Logout.** There is no row for it. If a stale route calls it, it does nothing: wiping local data with no account to return to would only lose Paul's settings.
- **Background recovery (iOS relaunching the app after a Bluetooth event).** `backgroundRecovery.ts` needs a resolved deployment and a session token; both are satisfied locally.
- **Upstream merges.** Fifteen or so upstream files carry small edits. Conflicts in `officialManifest.ts` resolve as "keep ours". The guards in section 7 fail the build if a merge silently restores a cloud path.

## 12. The three most likely silent failures

1. **A cloud call that only happens on a phone.** Something that needs connected glasses (a core-token push, an OTA probe, a fleet report) reaches for a Mentra host and the simulator never sees it. Guards: the engine builds no cloud client at all in cloudless mode (unit-tested), so those paths throw locally; the native update check is opt-in; the hosts test forces every Mentra hostname in the source to be triaged. Residual risk: native Swift code under `modules/*/ios` that builds its own request. Read for this change: only `BluetoothSdkUpdateCheck.swift`, PostHog (off) and the OTA manifest URLs (Mentra Live only) do.
2. **AD Home's data silently lands in the wrong place or nowhere.** If the storage identity did not resolve, storage calls would fail and AD Home would look fine but forget its notes. Guard: `getUserId` is supplied and unit-tested; checklist steps 8 and 6.
3. **An upstream merge quietly brings the cloud back.** For example upstream rewrites `officialManifest.ts` and the merge takes theirs. Guards: the canary check on the built bundle, the manifest unit test, the simulator sinkhole, and the grep for the native opt-in guard.

## 13. Blast radius

- Paul's fork: one branch, about fifteen upstream files with small edits, about ten new files, one workflow.
- Paul's phone: nothing until the first TestFlight build. Then one app with its own storage.
- The glasses and ring: nothing is written to them that the Mentra app does not write. No core token is pushed any more.
- Not touched: Mentra's repository and services, AD-ERP, the AD Home repository, Android.
- Anyone else: nobody. The app is not distributed.

## 14. Rollback

| What went wrong | Rollback |
|---|---|
| The phase 2 build misbehaves on the phone | Delete AD Glass, reinstall the Mentra store app, sign in. Glasses and ring pair with either. AD Home reinstalls there by the same QR |
| A commit on the branch is wrong | `git revert` it; the workflow rebuilds |
| The whole approach is wrong | Close the PR. `ad-glass/main` is untouched until it merges |

## 15. Phase 2b follow-ups (not in this change)

1. Remove the Mapbox, Firebase, Sentry, Azure Communication, LiveKit and WebRTC packages and the Entra (MSAL) module, and with them the dead auth screens and `accountClient.ts`.
2. Reword Mentra text and logos on the screens that survive (splash, settings, pairing copy).
3. Signed archive and TestFlight workflow (needs Paul's Apple enrolment and the four `ADGLASS_*` secrets).
4. AD Home on its own HTTPS address under `domingueandco.com` (option B), which gives it self-update and a publisher identity. Needs a DNS record from Paul.
5. Bundle the English speech model in the app so the first voice note needs no download.
6. Android.
7. Optional: build Captions or Translation from `miniapps/` if Paul wants them.

## 16. Needed from Paul

Nothing for this change. For the first build on his phone: the Apple enrolment he is already doing, then the steps in `spec-phase1.md` section 9.
