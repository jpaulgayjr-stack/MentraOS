# Sightline, phase 2a spec: cut the cord

Status: draft for review, 2026-11-25. Owner: Paul. Engineering: Claude.
Branch: `sightline/phase2` on `jpaulgayjr-stack/MentraOS`. It was cut from the rebrand branch before PR 1 merged, under the app's first name, AD Glass. Paul renamed the app to Sightline on 2026-11-25 (PR 5); this branch carries the rename through everything phase 2 added (file names, the URL scheme, the deployment and local user ids) and has `sightline/main` (PRs 1, 3 and 5) merged in, so the PR shows only this work.

Everything stated about the code was read from this checkout unless it carries a confidence tag. Line numbers are as of the base commit `6adcee24b`.

## 1. Goal

Sightline opens straight to its home screen as a single local user, pairs the Even G2 glasses and the R1 ring, and runs AD Home, without ever contacting a server that Mentra owns.

"Done" for phase 2a:

1. This spec is committed before code.
2. The unsigned simulator build is green on `sightline/phase2`.
3. On the GitHub runner, the built app boots in an iOS Simulator with every Mentra hostname in section 9 pointed at a sinkhole, reaches the home screen with no login, and the sinkhole records zero connection attempts. Screenshot and log are attached to the run.
4. A draft PR is open inside the fork and has had a fresh-context adversarial review.
5. Paul has the on-device checklist (section 10): Bluetooth cannot be exercised in a simulator.

## 2. Decisions

All Claude-decided under the 2026-10-19 delegation unless marked.

| Topic | Decision | Why |
|---|---|---|
| Name | The app is **Sightline**, bundle id `com.jpaulgay.sightline` (Paul, 2026-11-25; see `spec-phase1.md`). Phase 2's own names follow: URL scheme `sightline`, deployment `sightline-local`, local user `local:sightline`. | Nothing had been installed on a phone, so no stored data depended on the earlier ids. The AD Home miniapp keeps its name and package. |
| Identity | One local user, id `local:sightline`, no email, no password, no account screens. Provided by a new `LocalAuthProvider` behind the existing `mentraAuth` seam (`src/utils/auth/authClient.ts`). | Every consumer of auth (boot, deep links, engine storage partition, per-account settings) already goes through that seam, so one new provider replaces the whole Mentra account client with no fake server. |
| Session token | The local session carries the constant `local-device` as its token. It is a marker, not a credential: there is no server to present it to. | Three upstream gates test `session.token` for truthiness (`index.tsx:159`, `DeeplinkContext.tsx:564-574`, `backgroundRecovery.ts:32`). A constant keeps those files unedited. |
| Deployment | The embedded manifest becomes `sightline-local`: `services.coreUrl` and `runtimeUrl` are `null`, `auth.mode` is the new `"local"`, every cloud feature flag is `false`, `telemetry` is `false`. It reads no environment variable. | The manifest type already allows null services. Hard-coding beats configuration: a stray `EXPO_PUBLIC_CLOUD_CORE_URL` in a build environment cannot bring the cloud back. |
| "Cloudless" test | One predicate, `isCloudless(manifest)`: both service URLs are null. Host and engine each have a copy of this one-line rule. | The engine is a separate package and must not import app code. |
| Fresh install | The deployment store starts resolved. There is no "Mentra or organization" chooser and no organization (Microsoft Entra) path. | `index.tsx:357` sends an unresolved install to `/auth/start`. |
| Debug URL overrides | Ignored while the manifest is cloudless, and never counted as "this changes Core". | A saved dev override (`cloud_core_url` setting) would otherwise repoint the app at a server, and the debug URL screen would start a sign-out. |
| Account screens | Two layers. Every navigation to `/auth/*` is sent to the boot route, in the navigation store (all in-app navigation goes through it) and in the system link handler. And a layout that wraps every screen in `src/app/auth/` leaves for the boot route as soon as it renders. The account pages inside Settings (profile, password and email change, account deletion, data export, organization, feedback) are covered by the first layer only: they share a folder with the real settings pages, so no layout can wrap them. Their rows are hidden, and a link to one boots normally. | The sign-in, password and organization screens stay in the bundle until phase 2b, and several upstream paths still navigate to them (the link fallback, Mentra Live pairing). Recognising paths is not enough on its own: review found spellings (`sightline:auth/start`, dot segments) that the router resolves to a sign-in screen and a path check misses. The layout cannot be spelled around. |
| Boot | `index.tsx` skips the version check, the cached version floor and the token exchange; it starts the engine and goes to home. The first-run "welcome" carousel is skipped: home already shows the "Pair glasses" card. | Task requirement: boot straight to home. |
| Engine with no cloud | `CloudClientService.construct()` returns without building a client when the config is cloudless. `hasCore()` is then false, which already gates support-profile sync, fleet, crash reports and the core-token push to the glasses (`engine.ts:119-146`). | Today `engine.start()` throws at `engine.ts:80` with no Runtime, so nothing starts. One guard at the single place a client is built covers every lazy caller. |
| Storage identity | The host passes `auth.getUserId = () => "local:sightline"` and no `getSubjectToken`. | `resolveMentraUserId()` (`CloudClientService.ts:762`) uses the host id first. Without it a miniapp's storage calls fail with `NOT_CONNECTED`, which would break AD Home's notes. |
| Speech to text | With cloud speech off and on-device speech on, a `preferCloud` listener (the default) is accepted instead of refused, and is served on-device like `preferLocal` and `localOnly`. | Upstream refuses it ("Cloud speech is disabled by this deployment", `LocalMiniappRuntime.ts:292`). The router picks the cloud only while the cloud counts as connected, and that needs both the `cloudSpeech` flag and a live session (`cloudSpeechUp()`), neither of which exists here. The listener keeps its own `processing` value because older miniapp SDKs sort delivered events by it. |
| Text to speech | A speak request is treated as `localOnly` where cloud speech is off, so it goes on-device or fails cleanly with `TTS_LOCAL_UNAVAILABLE`. | `localOnly` is the one branch of the speak path with no cloud call in it (`LocalMiniappRuntime.ts:3009-3016`). |
| System miniapps | Keep the screens compiled into the app: Settings, Gallery, Mirror, Notifications, Miniapp Developer. Hide Feedback (it only files reports with Mentra). Install none of the twelve downloaded ones (AI, Call, Captions, Notes, Navigation and others): `miniapps.defaults` is empty and `firstPartyMiniappsUrl` is null. | The five kept ones are routes in the binary (`BuiltInMiniappCatalog.ts:205-333`); nothing is downloaded for them. Seven of the twelve downloads have no source in this repo, and a G2 user needs none of them to run AD Home. |
| AD Home install | **Scan the release QR from Paul's laptop**, exactly as he installs it today: `scripts\release.cmd` in the AD Home repo, then Sightline > Settings > Miniapp Developer > Scan. It installs as a local build and keeps running without the laptop. | See section 6. |
| Ring pairing entry | "Pair controller" in Settings is shown always, not only in super mode. | It is the only route to `/pairing/select-controller` (`DeviceSettingsSection.tsx:294`), and the ring fix is the reason this fork exists. |
| URL scheme | `sightline`. Applied in `scripts/sightline.cjs`; the code reads `APP_SCHEME` instead of the literal `com.mentra`. | Mentra sign-in no longer returns through the scheme, and Sightline must not answer links meant for the Mentra app installed on the same phone. |
| Bluetooth SDK update check | Already stopped on `sightline/main` (PR 1): the SDK's start-up call to `core.mentraglass.com` does not run when the SDK's analytics are off, which Sightline always sets (`MentraBluetoothSdkAnalyticsDisabled`). Swift tests for it run in the workflow, and the built app's Info.plist is checked for the key. | This branch first added a separate opt-in key for the same call. It was removed when `sightline/main` was merged in: one mechanism, the one that is tested by running it. |
| Firmware updates | `mentraLiveOtaManifestUrl` is null and the legacy fallback is off. | OTA code serves Mentra Live and AR99 hardware. The G2 has `hasOta` false and never reaches it. |
| Links, wallpapers, store | Privacy and terms links point at the fork notice in this repository. Wallpaper list is empty. App Store and review links are null (`appUpdates.mode: "managed"`). | They were Mentra URLs. The manifest type requires a URL for the two legal links. |

Rejected alternatives:

- **Keep `auth.mode: "mentra-account"` and detect local mode only from null URLs.** Smaller diff, but the manifest would claim a Mentra account that does not exist.
- **A stub server inside the app that answers Core's API.** Explicitly out: faking a server keeps every cloud code path alive and one config slip away from the real one.
- **Delete the auth screens, account client and cloud client now.** Large diff against upstream for no change in behaviour: they are unreachable once the gate is gone. Deleting dead code is phase 2b, when the vendor packages go too.

## 3. Inputs

- Base: `sightline/rebrand` (`6adcee24b`): upstream `dev` + ring fix + ONNX fix + rebrand.
- `spec-phase1.md` section 10 (the host and cloud-call inventory) is the checklist; section 8 of this file maps each row to what now happens.
- No secrets, no Apple account, no new service.

## 4. Outputs

### New files

| File | What |
|---|---|
| `mobile/src/services/deployment/sightlineManifest.ts` | The `sightline-local` manifest and `isCloudless()` |
| `mobile/src/services/deployment/localRoutes.ts` | `routeForThisBuild()`: account routes become the boot route |
| `mobile/src/app/auth/_layout.tsx` | Wraps every account screen and redirects to the boot route. Upstream has no layout in this folder, so the file cannot conflict |
| `mobile/src/utils/auth/localUser.ts`, `mobile/src/utils/auth/provider/localClient.ts` | The local user's id and session marker; `LocalAuthProvider` |
| `mobile/modules/engine/src/services/cloudless.ts` | Engine side: `isCloudlessConfig()` and the speech refusal rule |
| `mobile/scripts/sightline-blocked-hosts.txt`, `sightline-hosts.test.mjs` | The hostnames the simulator job sinkholes, and the test that keeps the list complete |
| `mobile/scripts/sightline-sim/` (`boot.sh`, `sinkhole.py`, `ocr.swift`, `pick-simulator.py`, `sinkhole-hosts.py`) | Simulator boot proof (section 7) |
| `mobile/src/test-utils/mentraCloudManifest.ts` | Test fixture only: upstream's Mentra manifest, for the upstream suites that are about a deployment with servers |
| `mobile/scripts/sightline-jest-gate.mjs` (+ test) | The verdict on a jest run: everything must pass except two upstream suites that cannot load in this repository |
| Tests: `sightlineManifest.test.ts`, `sightlineLocal.test.ts`, `localClient.test.ts`, `sightline-boot.test.tsx`, `navigation.sightline.test.ts`, `defaultMiniapps.sightline.test.ts`, and in the engine `cloudless.test.ts`, `CloudClientService.cloudless.test.ts`, `LocalMiniappRuntime.speech.cloudless.test.ts` | See section 7 |

### Upstream files edited (each edit is a few lines unless noted)

| File | Edit |
|---|---|
| `mobile/src/services/deployment/officialManifest.ts` | Rewritten: `createOfficialManifest()` returns the Sightline manifest; no environment reads remain. On a merge conflict, keep ours |
| `mobile/src/services/deployment/types.ts` | Add `{mode: "local"}` to the auth union |
| `mobile/src/services/deployment/auth/createDeploymentAuthProvider.ts` | The new mode in its `switch` (throws: it is not an organization sign-in) |
| `mobile/src/services/deployment/store.ts` | Start resolved on the embedded local deployment; ignore any persisted organization selection |
| `mobile/src/services/deployment/debugOverrides.ts` | No Core or Runtime override on a cloudless manifest |
| `mobile/src/services/cloudClient.ts` | `allowLegacyOtaFallback` false when cloudless |
| `mobile/src/utils/auth/authClient.ts` | Pick `LocalAuthProvider` on a local deployment |
| `mobile/src/contexts/AuthContext.tsx` | Telemetry flag from the manifest instead of a literal `true`; `logout` does nothing for the local user |
| `mobile/src/app/index.tsx` | Local boot path, and a "could not start" screen with Try again instead of an endless splash |
| `mobile/src/services/MantleManager.ts` | Local auth seam (`getUserId` only) |
| `mobile/src/services/miniapps/defaultMiniapps.ts` | No Core means the manifest's (empty) list, not "waiting for connection" |
| `mobile/src/services/miniapps/miniappVisibility.ts` | Hide the Feedback tile when cloudless |
| `mobile/src/effects/AllEffects.tsx` | Do not mount `FleetSheets` or the screenshot feedback prompt when cloudless |
| `mobile/src/app/miniapps/settings/main.tsx` | Hide the Profile and Feedback rows when cloudless |
| `mobile/src/components/settings/DeviceSettingsSection.tsx` | "Pair controller" without super mode |
| `mobile/src/stores/navigation.ts`, `mobile/src/app/+native-intent.tsx` | Account routes go to the boot route; scheme from `APP_SCHEME` |
| `mobile/src/services/miniapps/miniappInstallLinks.ts`, `loadAuthoringMiniapp.ts`, `mobile/src/services/attendedPermissionRequest.ts`, `permissionStatusRequest.ts` | Scheme from `APP_SCHEME` instead of the literal `com.mentra` |
| `mobile/modules/engine/src/services/CloudClientService.ts` | Cloudless guard at the top of `construct()` |
| `mobile/modules/engine/src/services/LocalMiniappRuntime.ts` | The speech refusal rule comes from `cloudless.ts`; one line in `handleSpeak` makes every speak request `localOnly` where cloud speech is off (written inline, with names the engine's source-extraction tests already inject) |
| `mobile/src/app/miniapps/settings/debug.tsx` | The Cloud URL switcher and the firmware URL switcher are not shown when cloudless (their presets are Mentra's servers, and saving fetches them) |
| `mobile/src/services/miniapps/miniappInstallFlow.ts` | A package link says there is no directory instead of opening Mentra's directory website |
| `mobile/scripts/sightline.cjs`, `sightline.d.cts`, `sightline.test.mjs` | Scheme `sightline`, enforced both when the config is built and again while the native project is generated; no Core address in the packaged config |
| `.github/workflows/sightline-ios-simulator.yml` | Three jobs: tests, simulator build with no-backend guards, boot with hosts sinkholed |

Upstream tests touched:

- Removed, because the behaviour they covered is gone and new tests cover its replacement: `officialManifest.test.ts` (environment-driven Core URL; see `sightlineManifest.test.ts`) and `__tests__/app/version-reset.test.tsx` (boot version check; see `sightline-boot.test.tsx`).
- Given the cloud fixture with one added `jest.mock` line, nothing else changed: `configuration.test.ts`, `deployment.test.ts`, `deploymentManagedMiniappSync.test.ts`, `defaultMiniapps.test.ts`, `components/dev/CloudUrl.test.tsx`.
- `__tests__/app/native-intent.test.ts`: two expectations changed. Links to account screens used to pass through to the router; now they boot normally.
- `MantleManager.test.ts`: one test added (the engine hand-off).

Not touched: `mobile/modules/bluetooth-sdk/ios/Source/sgcs/G2.swift`, the pairing screens, the miniapp runtime's launch and install paths, `DeeplinkContext.tsx`, Android sources.

## 5. Boot sequence after this change

1. `_layout.tsx` loads settings and mounts providers (unchanged). Sentry stays uninitialized (empty DSN, telemetry false).
2. `DeploymentStore` constructs with the embedded local manifest, already resolved.
3. `AuthProvider` asks `mentraAuth.getSession()`. The lazy client sees `auth.mode === "local"` and builds `LocalAuthProvider`, which answers from memory: user `local:sightline`, token marker `local-device`. `openAccountSettings("local:sightline")` opens that user's settings store. `accountClient.ts` (the client for Mentra's account service) is never constructed.
4. `index.tsx` waits for auth and navigation, then on a cloudless deployment runs `mantle.init()` and navigates. `index.tsx` itself makes no network call.
5. `MantleManager.initialize()` configures the engine with `auth: {getUserId}` and the cloudless config. `engine.start()` skips the cloud client, the audio uplink (flags off), and every `hasCore()` service; Bluetooth, device events, settings sync, the local miniapp runtime and the display processor start as before.
6. `MantleManager` starts the on-device speech model downloads in the background (`offlineSpeechModelService.startBackgroundDownloads()`, unchanged from upstream): on a first launch the speech-to-text, text-to-speech and wake-word models are fetched from `github.com/k2-fsa/sherpa-onnx` and `huggingface.co`, on whatever connection the phone has, mobile data included. These are not Mentra's servers. See the edge cases.
7. `defaultMiniapps.sync` finds an empty list and goes idle. `miniappUpdateScheduler` still runs, but a local build has no update address (`miniappUrlUpdates.ts`, about line 186), so AD Home is never updated in the background: each new AD Home version is a fresh scan of the laptop's QR.
8. Home renders: "Pair glasses" on a first run, otherwise glasses and controller status and the miniapp grid.

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

`session.getToken()` style Mentra miniapp tokens (none without Core; `LocalMiniappRuntime.ts:1835` returns null and the miniapp still connects), cloud transcription, cloud speech, managed photo and stream upload, Teams meetings, maps. AD Home calls none of these itself.

**One thing AD Home does lose: "Hey Mentra, add a note in AD Home".** That is the note path in AD Home's default Simple mode. The voice assistant that hears it is Mentra AI (`com.mentra.ai`), one of the downloaded system miniapps that this build does not install, and only a system package may invoke another miniapp's action (`LocalMiniappRuntime`, `isSystemPackage`), so nothing can call AD Home's `add_note`. Still working: the "New voice note" button on the phone, and in Full mode the swipe that starts a note. The fix belongs in AD Home (a gesture in Simple mode that starts a voice note), not in a looser trust rule here. Found by a trace of AD Home against this branch; inferred, not read, that Mentra AI is the only caller (its source is not in the repository).

**Installing AD Home has exactly one route**: Settings > Miniapp Developer > Scan, with the QR that `scripts\release.cmd` shows. The iPhone's own Camera cannot do it (`miniapp://` is not a scheme any app registers, here or upstream), and typing the laptop's address installs a development build that needs the laptop running, not a permanent one.

A miniapp whose age rating is above the app's own cannot launch: the gate needs a declared age from Core (`miniappAgeGate.ts:200-216`). AD Home declares no rating. Follow-up if it ever matters.

## 7. Verification

### Unit tests (run locally and in the workflow)

- `sightlineManifest.test.ts`: services null, flags false, telemetry false, no `mentraglass` or `mentra.glass` string anywhere in the manifest, and the same result whatever `EXPO_PUBLIC_CLOUD_*` says.
- `localClient.test.ts`: session, user and subscription behaviour; every account operation and `getSubjectToken` reject; no `fetch` is called.
- `sightlineLocal.test.ts`: the store is resolved on first run and ignores a stored organization; a saved override does not change null services; what the engine is configured with; the account-route rule.
- `sightline-boot.test.tsx`: `index.tsx` starts the engine and goes Home with no version call, no request of its own, no cached floor and no welcome carousel; a start failure shows a message and a retry. The engine start is mocked in this test: what the engine does without a cloud is covered by the engine tests and the simulator job.
- `navigation.sightline.test.ts`: push, replace, replaceAll and navigate to an account route all land on the boot route.
- `auth/sightline-account-screens.test.tsx`: the layout around the account screens redirects to the boot route and renders none of them.
- `defaultMiniapps.sightline.test.ts`: nothing fetched, nothing installed, not "waiting".
- Engine (`bun test`, the whole engine suite runs in the workflow): a cloudless config builds no client on init or reconnect, every cloud call fails locally, storage identity comes from the host; the speech refusal table; routing stays on-device; the real speak handler never asks the cloud where cloud speech is off.
- AD Home's path, each under Sightline's real configuration: `releaseInstall.cloudless.test.ts` (engine: a scanned release QR installs as a local build from the laptop only, with development allowed and the cloud client untouched), `LocalMiniappRuntime.auth.cloudless.test.ts` (engine: a miniapp that connects with no Core is acknowledged, gets no token, and nothing retries), `sightline-release-scanner.test.tsx` (app: what the scanner does with a release QR, a plain local address and a public address), and the developer gate in `sightlineLocal.test.ts`. Not written, with reasons: a storage round trip and a development snapshot surviving a restart (both need the real file-system registry and partition code running under native mocks that this repository's suites do not have; the user id they depend on is pinned and commented instead), and the subscription and demand calls for a `preferLocal` listener (the routing decision is pinned in `cloudless.test.ts` and upstream's `LocalMiniappRuntime.transcription.test.ts`). All three are on the on-device checklist.
- `sightline.test.mjs`: scheme is `sightline` in `scheme` and `CFBundleURLTypes`, in both Info.plist passes; a leftover Mentra scheme fails the build; no Core address in the packaged config.
- `sightline-hosts.test.mjs`: every `*.mentraglass.com`, `*.mentraglass.cn` and `mentra.glass` hostname written in the app's sources (`mobile/src`, `mobile/modules`, `mobile/plugins`, `mobile/scripts`, the three `cloud-v2` packages the app uses) is in the blocked-hosts list, so a host that upstream adds later fails the build until it is triaged. A second check fails if a Mentra domain appears as a bare suffix, which is how a hostname assembled at run time would look; none exists today.
- `sightline-jest-gate.mjs`: the app's jest suite must pass in full, except two upstream suites that read Mentra firmware sources (`asg_client/`) this repository does not contain and so cannot load.

### Static guards on the built app (workflow)

- The job builds with canary values in `EXPO_PUBLIC_CLOUD_CORE_URL`, `EXPO_PUBLIC_CLOUD_RUNTIME_URL`, `EXPO_PUBLIC_MINIAPPS_URL` and `EXPO_PUBLIC_DIRECTORY_URL`, then fails if any canary string is in `main.jsbundle` or in the packaged Expo config. This is the "packaged manifest has a non-null Core or Runtime" guard: the manifest is code, so the proof is that nothing in the bundle read those variables. The deployment id `sightline-local` must be present.
- `Info.plist`: URL schemes contain `sightline` and not `com.mentra`; the phase 1 checks stay (identity, prompts, `MentraBluetoothSdkAnalyticsDisabled`, Firebase off, no Sentry DSN).
- Source greps: the ring fix, the SDK start-up guard, `telemetry: false` in the embedded manifest, and the engine's no-cloud guard are still in place (they must survive upstream merges).

### Simulator boot with Mentra blocked (workflow)

`mobile/scripts/sightline-sim/boot.sh`, run by the `boot` job:

1. Append every hostname in `sightline-blocked-hosts.txt` to the runner's `/etc/hosts`, pointing at `127.0.0.1` and `::1`, and flush the DNS cache.
2. Start a sinkhole on ports 80 and 443 that accepts, logs (with the hostname the client asked for) and closes every connection.
3. Self-tests, so an empty log means something: a request from the Mac and one from the simulator's own browser must each show up in the sinkhole log. The log is then cleared.
4. Boot a simulator, install the built app, launch it, take screenshots at intervals for 75 seconds.
5. Pass conditions:
   - the app process is still running;
   - text recognition (Apple's Vision framework, already on the runner) finds the home screen's "Pair glasses" text and no sign-in, update or error wording;
   - iOS offers to open an `sightline://` link in Sightline, and does not accept a `com.mentra://` link;
   - no crash report;
   - the sinkhole log is empty once the app has been stopped, and the sinkhole still records a test request on both ports afterwards;
   - iOS's own network log for the app names every host it looked up, and none is Mentra's or an analytics service's. This look does not depend on the blocked list. On the first run the only hosts were `github.com` and `release-assets.githubusercontent.com` (the three speech models).
   - Links to account screens: iOS asks "Open in Sightline?" before handing over a link opened from outside the app. The script answers by pressing Return in the Simulator window, then checks that six spellings of an account link each end on Home with no sign-in wording. If the confirmation cannot be answered on the build machine, those lines are reported as NOT CHECKED rather than passed, and the route guards rest on their unit tests.
6. Screenshots, recognized text, the app's open sockets and the sinkhole log are uploaded as artifacts and summarised on the run page.

The sinkhole is used instead of an unroutable address because it proves more: an unroutable address only shows the app survives a failed call, the sinkhole shows no call was attempted.

Limits of this proof, stated plainly:

- It covers boot and the idle home screen for about a minute. It does not cover code that runs only with glasses connected, only on a screen nobody opened, or only after hours (the six-hour support-profile timer is covered by the engine gate and its unit test, not by observation).
- It counts TCP connections on ports 80 and 443 to the listed hostnames. A host that is not on the list, another port, or UDP would not show. The hosts test keeps the list complete for hostnames written out in the sources. The UDP path to Mentra is the cloud audio uplink, which needs the cloud client that is never built; the WebRTC code in `modules/glasses-media` also uses UDP, is off with the cloud features, and was not traced further.
- It counts connections from anything on the build machine, not only the app, so a stray system process touching one of the "second line" analytics hosts would fail the job. That errs on the safe side.
- The app's open sockets are recorded (`app-connections.txt`) for a person to read; nothing asserts on them.

### Cannot be verified without Paul's phone

Bluetooth does not exist in the simulator. Pairing, reconnection, the display, the microphone path, on-device transcription with real audio, the calendar and location permissions, the QR install over Wi-Fi and the share sheet are all unverified until the first TestFlight build. Section 10 is the checklist.

## 8. Phase 1 inventory, row by row

| # | Area | After phase 2a |
|---|---|---|
| 1 | Accounts and login | `LocalAuthProvider`; `accountClient.ts` is never constructed. Auth screens remain in the bundle but nothing navigates to them (the deep-link fallback goes home). Authing and Entra code is unreachable; removal is 2b |
| 2 | Version check | Not called on a cloudless deployment; the cached floor is never read. The Bluetooth SDK's start-up check is off with the SDK's analytics (PR 1) |
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

Kept in `mobile/scripts/sightline-blocked-hosts.txt`; the list there is authoritative and the hosts test keeps it complete. It includes Core and Runtime for production, staging and dev in every region found in the source, `core.mentraglass.com`, `miniapps*.mentraglass.com`, `api.apps*.mentraglass.com`, `apps.mentraglass.com`, `apps.mentra.glass`, `ota.mentraglass.com`, `mtkfirmware.mentraglass.com`, `artifactscdn.mentraglass.com`, `mentra-wallpapers.mentraglass.com`, `mentra-videos-cdn.mentraglass.com`, `asset.mentraglass.cn`, `mentraglass.com`, `docs.mentraglass.com`, `api.mentra.glass`, plus PostHog (`us.i.posthog.com`) and Sentry ingest as a second line behind the phase 1 switches.

## 10. On-device checklist for Paul (first TestFlight build)

1. Put the phone in airplane mode with Wi-Fi off. Open Sightline. It opens to the home screen with a "Pair glasses" card and never shows a sign-in screen.
2. Turn Wi-Fi back on. Tap Pair glasses, choose Even Realities G2, follow the steps. The glasses connect and show the Sightline idle screen.
3. Settings > Pair controller > R1. The ring pairs and a ring press does something on the glasses.
4. Force-quit the app, reopen it. Glasses and ring reconnect on their own.
5. On the laptop run `scripts\release.cmd` in the AD Home folder. In Sightline: Settings > Miniapp Developer > Scan, scan the QR. AD Home installs and opens.
6. Turn the laptop off. AD Home still opens and shows time, weather and calendar on the glasses.
7. Start a voice note from AD Home's "New voice note" button on the phone and speak. It is transcribed. Do not use "Hey Mentra, add a note": that needs Mentra's AI miniapp, which Sightline does not have (section 6). (The speech models start downloading from GitHub the first time the app opens, so do the first launch on Wi-Fi and give it a few minutes before this step.)
8. Add a note, force-quit, reopen: the note is still there.
9. Use the share button on a note: the iOS share sheet opens.
10. Leave it running for a day with the Mentra app deleted from the phone.
11. Optional, one minute: in Safari's address bar type `sightline://auth/start` and tap Open. Sightline comes to the front on its home screen, not on a sign-in page.

## 11. Edge cases

- **Mentra's store app on the same phone.** Different bundle id, different URL scheme, separate storage. Both will fight for the glasses' Bluetooth connection: delete the store app or keep it closed.
- **Upgrade from a phase 1 build.** None exists on any phone, so there is no stored Mentra session or deployment selection to migrate. The store still ignores a persisted workspace selection defensively.
- **A saved cloud URL override or OTA override in settings.** Ignored on a cloudless manifest. The OTA override was already inert outside super mode.
- **A package link (`apps.mentraglass.com/package/...`) scanned or opened in Sightline.** There is no directory to look it up in, so the app says so. Upstream would open Mentra's directory website in an in-app browser; this build does not.
- **A link straight to an account page inside Settings** (`sightline://miniapps/settings/change-password`). Sent to the boot route. If some spelling got past the path check, the page would show its fields and every operation on it would fail locally ("no account service"), with no request made. The pages go away with the dead account code in phase 2b.
- **Odd spellings of a link to an account screen** (`sightline:auth/start`, `sightline:///auth/start`, `sightline://./auth/start`, `//auth/start`, encoded or upper-case segments). The path check reads through them, and whatever it misses is stopped by the layout around the screens.
- **Speech models download at first launch, on any connection.** Upstream starts the on-device model downloads in the background as soon as the engine starts, with no Wi-Fi-only rule, from GitHub and Hugging Face. On a first launch over mobile data that is a few hundred megabytes (estimate; moderate confidence) without asking. Not changed here; bundling the English model or adding a Wi-Fi rule is a follow-up.
- **A voice note before the speech model has finished downloading.** The listener is accepted and waits on the model; AD Home shows "nothing heard" after 30 seconds and does not say why. Hence the checklist's "give it a few minutes" on first launch. A clearer message is AD Home's to add (it can read the model status).
- **Speech model not downloaded and no network.** Transcription reports `downloading` or `unavailable`; text to speech fails with `TTS_LOCAL_UNAVAILABLE`. Neither tries a cloud path.
- **Transcription in a language other than the one picked on the Speech page.** With no cloud to fall back to, a listener that asks for a specific other language (say `transcription:fr-FR` while the phone's model is English) is accepted but receives nothing; the model status a miniapp can subscribe to says `unavailable` and names the picked language. Upstream behaves the same whenever its cloud is unreachable. A listener that asks for no language (what AD Home does: `transcription.on(handler, {processing: "preferLocal"})`) or for the picked language is served.
- **Debug settings.** The Cloud URL switcher and, in super mode, the firmware URL switcher are hidden. Both offer Mentra addresses as presets and fetch the address on Save.
- **A miniapp that asks for `preferCloud`.** Served on-device.
- **Logout.** There is no row for it. If a stale route calls it, it does nothing: wiping local data with no account to return to would only lose Paul's settings.
- **Anything that navigates to a sign-in screen** (an unmatched deep link, an `sightline://auth/...` link, upstream code that still calls for one) lands on the boot route, which goes Home.
- **Background recovery (iOS relaunching the app after a Bluetooth event).** `backgroundRecovery.ts` needs a resolved deployment and a session token; both are satisfied locally.
- **Upstream merges.** About two dozen upstream files carry small edits (section 4). Conflicts in `officialManifest.ts` resolve as "keep ours". The guards in section 7 fail the build if a merge silently restores a cloud path.

## 12. The three most likely silent failures

1. **A cloud call that only happens on a phone.** Something that needs connected glasses (a core-token push, an OTA probe, a fleet report) reaches for a Mentra host and the simulator never sees it. Guards: the engine builds no cloud client at all in cloudless mode (unit-tested), so those paths throw locally; the native update check does not run with the SDK's analytics off (Swift-tested); the hosts test forces every Mentra hostname in the source to be triaged. Residual risk: native Swift code under `modules/*/ios` that builds its own request. Read for this change: only `BluetoothSdkUpdateCheck.swift`, PostHog (off) and the OTA manifest URLs do. The OTA constants (`OtaManifest.swift:6,183`, `otaManifestPolicy.ts:1`, `mtkDowngrade.ts`) stay compiled in. On the JavaScript side the manifest URL resolves to null here, so no check starts; on the native side they are reached only from firmware-update calls for Mentra Live glasses, which a G2 never makes. That last point is a reading of the code, not something a test checks.
2. **AD Home's data silently lands in the wrong place or nowhere.** If the storage identity did not resolve, storage calls would fail and AD Home would look fine but forget its notes. Guard: `getUserId` is supplied and unit-tested; checklist steps 8 and 6.
3. **An upstream merge quietly brings the cloud back.** For example upstream rewrites `officialManifest.ts` and the merge takes theirs. Guards: the canary check on the built bundle, the manifest unit test, the simulator sinkhole and network-log check, and the source greps in the workflow.

## 13. Blast radius

- Paul's fork: one branch, about two dozen upstream files with small edits, about twenty new files (half of them tests), one workflow.
- Paul's phone: nothing until the first TestFlight build. Then one app with its own storage.
- The glasses and ring: nothing is written to them that the Mentra app does not write. No core token is pushed any more.
- Not touched: Mentra's repository and services, AD-ERP, the AD Home repository, Android.
- Anyone else: nobody. The app is not distributed.

## 14. Rollback

| What went wrong | Rollback |
|---|---|
| The phase 2 build misbehaves on the phone | Delete Sightline, reinstall the Mentra store app, sign in. Glasses and ring pair with either. AD Home reinstalls there by the same QR |
| A commit on the branch is wrong | `git revert` it; the workflow rebuilds |
| The whole approach is wrong | Close the PR. `sightline/main` is untouched until it merges |

## 15. Phase 2b follow-ups (not in this change)

1. Remove the Mapbox, Firebase, Sentry, Azure Communication, LiveKit and WebRTC packages and the Entra (MSAL) module, and with them the dead auth screens and `accountClient.ts`.
2. Reword Mentra text and logos on the screens that survive (splash, settings, pairing copy).
3. Signed archive and TestFlight workflow (needs Paul's Apple enrolment and the four `SIGHTLINE_*` secrets).
4. AD Home on its own HTTPS address under `domingueandco.com` (option B), which gives it self-update and a publisher identity. Needs a DNS record from Paul.
5. Bundle the English speech model in the app, or make the model downloads Wi-Fi only, so a first launch does not pull models over mobile data.
6. Android.
7. Optional: build Captions or Translation from `miniapps/` if Paul wants them.
8. Make `resolvedEndpoints()` in `mobile/src/services/cloudClient.ts` say in its type that it can return nulls. Today it claims strings; the live callers cope, but the compiler would not catch a new one. It goes away with the dead account code in item 1.

## 16. Needed from Paul

Nothing for this change. For the first build on his phone: the Apple enrolment he is already doing, then the steps in `spec-phase1.md` section 9.
