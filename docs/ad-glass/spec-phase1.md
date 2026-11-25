# AD Glass, phase 1 spec: our own build of the phone app

Status: draft for review, 2026-11-25. Owner: Paul. Engineering: Claude.
Branch: `ad-glass/main` on `jpaulgayjr-stack/MentraOS` (a public fork of `Mentra-Community/MentraOS`).

This file covers phase 1 in full and lists the phase 2 inventory. Everything stated about the code was read from this checkout (upstream `dev` at `323255060`) unless it is tagged with a confidence level.

## 1. Goal

Paul installs an app called **AD Glass** on his iPhone from TestFlight, built from this fork by GitHub's free macOS runners and signed by his own Apple team, and it pairs the Even G2 glasses and the R1 ring and runs the AD Home miniapp.

Phase 1 does not remove Mentra's login or cloud. It proves we can build, sign and ship the app ourselves, and it carries the ring fix. Phase 2 cuts the cord (section 10).

"Done" for phase 1:

1. Unsigned simulator build green on GitHub Actions (toolchain proof, no Apple account needed).
2. Rebrand commit merged on `ad-glass/main`: new bundle ID, name, icon, no Mentra telemetry.
3. Signed archive uploaded to TestFlight by a workflow using Paul's App Store Connect API key.
4. On Paul's iPhone: AD Glass installs, signs in, pairs G2 and R1 (the ring pairs because of the fix), AD Home runs and transcribes a voice note on the phone.

## 2. Decisions

| Topic | Decision | Why |
|---|---|---|
| App name | **AD Glass** | No Mentra brand. Apache 2.0 section 6 grants no trademark rights. |
| Bundle ID | `com.domingueandco.adglass` | Matches AD Home's `com.domingueandco.adhome`. Permanent once the App Store Connect record exists. |
| URL scheme | Stays `com.mentra` in phase 1, becomes `adglass` in phase 2 | Mentra's Google and Apple sign-in return to the app through this scheme (`accountClient.ts:558-569`). Changing it now risks breaking login while login is still required. It is a technical identifier, not branding. |
| Xcode project name | Stays `Mentra` (`ios/Mentra.xcworkspace`, scheme `Mentra`) in phase 1 | Not visible to the user. Mentra's scripts and our workflow open it by that name. `CFBundleDisplayName` and `CFBundleName` are set to AD Glass. |
| Backend in phase 1 | Mentra **production** (`core.us-west-2.mentraglass.com`, `runtime.us-west-2.mentraglass.com`, `miniapps.mentraglass.com`, `api.apps.mentraglass.com`) | Paul's existing account lives there. The repo default is Mentra's dev cloud. |
| Sentry | Removed: drop the `@sentry/react-native/expo` plugin entry, leave `EXPO_PUBLIC_SENTRY_DSN` empty | The plugin names Mentra's org (`mentra-labs`). With an empty DSN `SentrySetup.tsx` never initializes. No replacement in phase 1: a crash service is a new vendor and needs Paul's approval. |
| Firebase | Removed: variant with `includeFirebase: false`, no `GoogleService-Info.plist` | The committed plists point at Mentra's Firebase project. Mentra's own China variant already builds without Firebase, so the path exists. |
| Bluetooth SDK analytics (PostHog) | Off: plugin option `analytics: false` | It is on by default, hard-coded to `us.i.posthog.com`, and ignores the telemetry flag (`BluetoothSdkAnalytics.swift:39-40`, `analyticsProps.ts:26-37`). |
| Mapbox | **No token and no Mapbox account needed.** Navigation stays compiled in but inert in phase 1. Removal is a phase 2 item. | Verified 2026-11-25: the Mapbox iOS binaries (`MapboxCommon`, `MapboxCoreMaps`, `MapboxNavigationNative`, `MapboxNavSdk`) download from `api.mapbox.com` without credentials (HTTP 200 unauthenticated). The secret `sk.` token Mentra's CI demands is no longer required. The public `pk.` token only matters at run time for the navigation miniapp, which Paul does not use; the build uses the placeholder from `.env.example`. See section 6. |
| ONNX Runtime pod | Depend on `onnxruntime-c` directly and resolve it from `mobile/podspecs/onnxruntime-c.podspec`, which downloads Microsoft's own NuGet package `Microsoft.ML.OnnxRuntime` 1.18.0, pinned by sha256 | The host both trunk pods download from, `download.onnxruntime.ai`, stopped serving the archives around 2026-11-20 (wrong TLS certificate, 404 behind it), which breaks `pod install` for every project that uses them. The Objective-C wrapper pod upstream asks for is not used by any source file; the C library is only needed so the vendored sherpa-onnx library links. The package's SHA-512 was checked against the hash nuget.org publishes. Remove when upstream fixes it or the host returns. |
| Mentra's own workflows | Files left in the tree, untouched, but **disabled in the fork's GitHub settings** (seven of them, on 2026-11-25) | Deleting the files causes a conflict on every upstream merge. They do not trigger on pushes to `ad-glass/**`, but they do trigger on pull requests: opening the first PR inside the fork queued six of them (iOS build, Android build, ASG client build, quality checks, PR agent, PR checkout helper) plus `CI Gate`, all waiting for Mentra's runners. They were cancelled and disabled with `gh api -X PUT repos/jpaulgayjr-stack/MentraOS/actions/workflows/<id>/disable`. A workflow that upstream adds later registers itself the first time it triggers, so after each upstream merge check `gh api repos/jpaulgayjr-stack/MentraOS/actions/workflows` and disable anything that is not ours. That happened once already: the first PR commit that touched the Bluetooth SDK registered four more. One of them, `Bluetooth SDK Apple Platforms`, is worth keeping on: it runs on a GitHub-hosted runner with no secrets and runs the SDK's Swift tests, which include the fork's own. The other three (`Mobile App Android Unit Tests`, `OEM Host Boundary Gate`, `Example App Builds`) wait for runners only Mentra has; they cost nothing but sit in the queue until the owner disables them on the repository's Actions page. Our secrets use an `ADGLASS_` prefix so no upstream workflow can read them by name. |
| Fork vs standalone repo | Stay on the fork for phase 1 | Cheap upstream merges. Risk to manage: on a fork, `gh pr create` targets Mentra's repo by default. Every PR command must pass `--repo jpaulgayjr-stack/MentraOS`. The `upstream` remote in the local clone has its push URL disabled. |

## 3. Inputs

- Source: upstream `dev` plus the ring fix branch `fix/ios-r1-pair-connect-by-name` (merged as `22b649c29`). The fix adds `initController` to `DeviceManager.connectByName` on iOS (upstream PR 4981).
- Toolchain on the runner (`macos-15`): Xcode 26.2 (what Mentra uses), Bun 1.4.0, Node 20, CocoaPods from the image, Ruby from the image.
- From Paul, after Apple enrolment (section 9): Team ID, App Store Connect API key (Key ID, Issuer ID, `.p8` file contents), stored as GitHub Actions secrets that he pastes himself.
- No Mapbox token, no Sentry DSN, no Doppler, no fastlane match repository.

## 4. Outputs

1. `.github/workflows/ad-glass-ios-simulator.yml`: unsigned Release build for the iOS Simulator on every push to `ad-glass/**` that touches the app. Exists now.
2. `.github/workflows/ad-glass-ios-testflight.yml`: signed archive and upload. Written after the secrets exist (section 7).
3. Rebrand commit(s) on `ad-glass/main` (section 5).
4. An App Store Connect app record and TestFlight builds, visible only to Paul as an internal tester.

Nothing is written to Mentra's repo. No upstream PRs come from this work.

## 5. The rebrand change

Kept deliberately small so upstream merges stay easy. One seam: a new variant in `mobile/app.config.ts`.

| File | Change |
|---|---|
| `mobile/app.config.ts` | Add a `VARIANTS.adglass` entry (`appName: "AD Glass"`, `appLinks: false`, `includeFirebase: false`, no Google plist, our icon) and select it. Read `appleTeamId` from `process.env.ADGLASS_APPLE_TEAM_ID` instead of the literal `T5XXXL6N36` (line 228). Pass `analytics: false` to the bluetooth-sdk plugin (lines 329-340). Remove the Sentry plugin entry (lines 458-475). Rewrite the word "Mentra" in the permission prompts (`NS*UsageDescription`, lines 247-288, and the `expo-media-library` and `expo-location` strings) by one small function over the generated `infoPlist`, not by editing each string. Set `CFBundleName`. |
| `mobile/scripts/android-package-name.cjs` | Return `com.domingueandco.adglass` as the base. iOS takes its bundle ID from here (`app.config.ts:102-103`). |
| `mobile/scripts/ad-glass.cjs` (new, with `ad-glass.d.cts` and `ad-glass.test.mjs`) | As built, the changes in the first row live here, not in `app.config.ts`: `app.config.ts` only adds the `adglass` variant and passes its finished config through `applyAdGlass`. The script drops Mentra's team id, removes the Sentry plugin, sets `analytics: false`, rewrites the permission prompts (including the `$(PRODUCT_NAME)` placeholder, which Xcode would show as "Mentra") and sets `CFBundleName`. It also registers a step that repeats the prompt rewrite while the native project is generated, because library plugins write their default prompts at that point. |
| `mobile/src/services/deployment/officialManifest.ts` | `telemetry: false` (upstream `true`). This one flag gates Sentry and Firebase start-up in the app. `configuration.test.ts` in the same folder asserts the new value. |
| `mobile/modules/bluetooth-sdk/ios/Source/internal/BluetoothSdkUpdateCheck.swift` | One early return: the SDK's start-up "is there a newer SDK" call is skipped when the app has turned the SDK's analytics off. Upstream sends it regardless, to `core.mentraglass.com`, with a per-install id, the bundle ID and the OS version, and Mentra's Core forwards that to their PostHog project (`cloud-v2/packages/core/src/services/bluetooth-sdk-update.service.ts`). The only thing lost is a console banner for developers. Two tests in `ios/Tests/BluetoothSdkUpdateCheckTests.swift` (also an edited upstream file) prove it by running it. iOS only: the Android twin (`BluetoothSdkUpdateCheck.kt`) is untouched because no Android build is planned, and the module's `README.md` still describes upstream's behaviour. |
| `mobile/modules/bluetooth-sdk/ios/Source/DeviceManager.swift` | The ring fix (section 3), marked with an "AD Glass" comment. |
| `mobile/podspecs/onnxruntime-c.podspec`, one `extraPods` entry in `app.config.ts`, one line in `mobile/modules/bluetooth-sdk/ios/MentraBluetoothSDK.podspec` | Already done (commit `2b9c007b4`): ONNX Runtime from NuGet. Not a rebrand change; listed here so this table names every upstream file the fork edits. |
| `mobile/assets/app-icons/ad_glass_icon.png`, `ad_glass_icon_foreground.png`, `mobile/assets/logo/ad_glass_logo_light.png`, `ad_glass_logo_dark.png` (new) | Neutral AD Glass art for the home-screen icon and splash. Upstream's own art files are left untouched and unused. |
| `mobile/.env` (written by CI, never committed) | Production endpoints, empty Sentry DSN, placeholder Mapbox token. |
| `LICENSE` (root and per module), `mobile/modules/acs-meeting/NOTICE` | Kept (upstream has no root `NOTICE` file). A short `docs/ad-glass/NOTICE-fork.md` states this is a modified fork of MentraOS under Apache 2.0 and that it is not affiliated with Mentra. |

Left for phase 2 on purpose: Mentra wording and logos inside the app's own screens (login, onboarding, settings). Most of those screens are deleted or bypassed in phase 2, so rewording them now is wasted work. Internal identifiers such as dispatch-queue labels (`com.mentra.bluetoothsdk...`), miniapp package names (`com.mentra.camera`), the Bonjour service `_mentra-live._tcp` and the background task id `com.mentra.background-timer` are protocol or code identifiers, not branding, and stay.

### Every hardcoded team ID and signing path

Only the first row is on our build path. The rest belong to Mentra's release machinery, which we do not run and do not edit.

| Location | What it is | Action |
|---|---|---|
| `mobile/app.config.ts:228` | `appleTeamId` baked into the Xcode project at prebuild | Read from env |
| `mobile/ci/ios-export/ExportOptions.plist:8` | Team for Mentra's export | Not used. Our workflow writes its own export options at run time |
| `mobile/scripts/release-ios.mjs:295` and `mobile/.env.example:3` (`APPLE_TEAM_ID`) | Mentra's local release script | Not used |
| `mobile/scripts/ios.mjs:184` | Error text only | None |
| `mobile/fastlane/Matchfile` | fastlane match against the private repo `Mentra-Community/match-certs`, app id `com.mentra.mentra` | Not used. We sign with Xcode cloud-managed certificates |
| `mobile/ci/pr-ios/*` (`mac_installer.py:17`, `mac-installer/InstallerCore.swift:49`, `configure-signing.rb`) | Mentra's PR ad hoc signing and Mac installer | Not used |
| `.github/workflows/reusable-coordinated-mobile.yml:898`, `reusable-coordinated-example-testflight.yml:47`, `mentra-app-ios-build.yml` | Mentra CI, self-hosted Mac `[self-hosted, macOS, ARM64, shared]`, secrets `MATCH_PASSWORD`, `MATCH_GIT_BASIC_AUTHORIZATION`, `IOS_PR_PROFILE_BASE64`, `ASC_API_KEY_*`, `DOPPLER_TOKEN_MOBILE_PRD` | Disabled on the fork |
| `.github/scripts/pr-ios-artifacts.mjs:62`, `examples/oem-app/app.json:27` | Mentra tooling and example app | Not used |

Entitlements that the signed build needs on the new App ID (`app.config.ts:305-315`): Access WiFi Information, Hotspot Configuration, and keychain groups for the bundle ID and `com.microsoft.adalcache`. All are standard capabilities on a paid individual account. No push notifications and no Associated Domains (the `appLinks: false` variant drops `applinks:apps.mentraglass.com`, which only Mentra's team could claim).

## 6. Mapbox in detail

- Where it lives: only in `mobile/modules/crust` (`ios/navigation/NavigationManager.swift`, `NavPayloads.swift`, five functions in `CrustModule.swift:135-220`), the two config plugins `withMapboxNavIos.ts` and `withMapboxNavCrustLink.ts`, the engine navigation services, and the separate navigation miniapp. No app screen imports it.
- Is it cleanly separable: yes. Wrap the three Swift files in `#if canImport(MapboxNavigationCore)` with stubs that return "navigation not available", and skip the two plugins. Roughly 5 files.
- Why it is not removed in phase 1: it is not needed to build (see the decision table), phase 1 is meant to be the upstream app with the smallest possible diff, and the crust build-order plugin is fragile enough that touching it belongs in its own reviewed change.
- Why it should be removed in phase 2: the SDK is third-party code that can contact `api.mapbox.com` and Mapbox telemetry once started (inferred, moderate confidence; not observed).
- If Paul ever wants navigation on the glasses: a free Mapbox account and a public `pk.` token in `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`. Not planned.

## 7. Build pipeline

Runners: GitHub-hosted `macos-15`, free and unmetered for public repositories. Limits that matter: 6 hours per job, 5 concurrent macOS jobs.

### 7.1 Simulator build (exists)

`ad-glass-ios-simulator.yml` steps: checkout, select Xcode 26.2, Bun 1.4.0, Node 20, `cp .env.example .env`, `bun install` (which builds the workspace modules through Mentra's pre and post install scripts), `bun expo prebuild --platform ios`, the Sherpa framework script, `pod install`, then

```
xcodebuild build -workspace Mentra.xcworkspace -scheme Mentra -configuration Release \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  ARCHS=arm64 CODE_SIGNING_ALLOWED=NO
```

Release configuration is used so the JavaScript bundling step is proven too. The full `xcodebuild` log is uploaded as an artifact on every run. A cold run takes about 41 minutes, 33 of them compiling.

The environment step writes `mobile/.env` from `.env.example`: production endpoints, an empty Sentry DSN, and `EXPO_PUBLIC_MENTRAOS_VERSION` taken from the root `package.json`. Upstream sets that version in `scripts/set-build-env.mjs`, which CI does not run; without it the app opens on an "App Version Missing" screen at every start and never runs the minimum-version check. The signed workflow must write the same file. One trap for it: `.env.example` carries `APPLE_TEAM_ID=T5XXXL6N36`, Mentra's team, which `mobile/scripts/release-ios.mjs` reads. Our signed workflow does not use that script; if it ever does, it must override the value. The step also writes the build's commit, branch and time (`EXPO_PUBLIC_BUILD_*`), which the app shows on its version screen and attaches to any report it sends.

Guards in the workflow (each fails the build):

- Before anything is installed: the `ad-glass.cjs` unit tests, the ring fix, the update-check early return, `telemetry: false`, and the `applyAdGlass` call in `app.config.ts`. Then the Bluetooth SDK's own update-check tests are run with `swift test` (about two minutes), which includes the two that prove the early return works.
- On `.env`: every pinned value is set exactly once, to exactly the value the job pins.
- On the generated Xcode project, a few minutes in: display name, `CFBundleName`, bundle ID, `MentraBluetoothSdkAnalyticsDisabled = true`, `FIREBASE_ANALYTICS_COLLECTION_ENABLED = false`, no permission prompt naming Mentra (other than the "Mentra Live" glasses) or `$(PRODUCT_NAME)`, no `GoogleService-Info` plist, no Sentry build step.
- On the built app: the same Info.plist checks, the native version equal to the JavaScript version, all four production URLs present in `main.jsbundle`, and no Sentry DSN in `main.jsbundle`.

### 7.2 Signed archive and TestFlight (to write once secrets exist)

Trigger: manual (`workflow_dispatch`) and tags `ad-glass-v*`. Same steps as 7.1 up to `pod install`, then:

1. Write the API key from `ADGLASS_ASC_KEY_P8` to a file in the runner's temp folder (deleted at the end, never echoed).
2. `xcodebuild archive ... -destination generic/platform=iOS -allowProvisioningUpdates -authenticationKeyPath ... -authenticationKeyID ... -authenticationKeyIssuerID ... DEVELOPMENT_TEAM=$ADGLASS_APPLE_TEAM_ID CODE_SIGN_STYLE=Automatic`. Xcode creates the cloud-managed distribution certificate, registers the App ID with its capabilities and makes the profile. No certificate is stored in GitHub.
3. `xcodebuild -exportArchive` with export options written at run time: `method app-store-connect`, `destination upload`, `signingStyle automatic`, the team ID. This uploads straight to App Store Connect.
4. Paul opens TestFlight on the phone and installs.

Confidence that steps 2 and 3 work on the first attempt with this project: moderate. Known risk is CocoaPods resource-bundle targets rejecting a team passed on the command line. The fallback is the boring one: fastlane (`cert`, `sigh`, `gym`, `pilot`) with the same API key; `mobile/Gemfile` already pins fastlane.

Secrets (repository secrets, names chosen so no upstream workflow references them):

| Secret | Content |
|---|---|
| `ADGLASS_APPLE_TEAM_ID` | 10-character Team ID |
| `ADGLASS_ASC_KEY_ID` | API key ID |
| `ADGLASS_ASC_ISSUER_ID` | Issuer ID (a UUID) |
| `ADGLASS_ASC_KEY_P8` | Full text of the `AuthKey_XXXXXXXXXX.p8` file |

The API key needs the **Admin** role: cloud-managed distribution signing is refused to lower roles unless a separate permission is granted. GitHub does not give secrets to workflows triggered from other people's forks, and nobody else can push to this repository.

Build numbers come from Mentra's scheme in `mobile/scripts/build-number.mjs` (derived from the commit time), so every new commit gets a higher number. Uploading the same commit twice is rejected by Apple as a duplicate; the workflow will pin `MENTRAOS_PINNED_BUILD_NUMBER` from the run number if that becomes a nuisance.

## 8. Edge cases, failure modes, rollback

### Edge cases

- **Mentra's store app and AD Glass on the same phone.** Different bundle IDs, so both install. Both claim the `com.mentra` URL scheme in phase 1 and both will try to hold the glasses' Bluetooth connection. Rule: sign in to AD Glass with email and password, or remove the store app first; do not run both against the glasses at once.
- **Sign in with Apple or Google.** Mentra's Core may refuse an OAuth return for a client it does not know (unknown; cannot be checked without a signed build). Email and password does not depend on the redirect. If Paul's account has no password, he sets one in the store app first.
- **Forced update.** The app asks Runtime for a minimum version at boot (`src/utils/cloudVersion.ts`, `src/app/index.tsx:197-235`) and blocks below it, pointing at Mentra's App Store page. Our build reports upstream's version (3.5.0 today, written into `.env` by the workflow, section 7.1), so it tracks upstream as long as we merge upstream regularly. If the check cannot reach the server there is a "Continue Anyway" button.
- **TestFlight builds expire after 90 days.** Rebuild at least every 80 days until phase 2 is done; after that the same rule still applies to any TestFlight install.
- **Apple membership lapses or a new agreement is unsigned.** Uploads fail with a clear error; Paul accepts the agreement at https://developer.apple.com/account and the workflow is re-run.
- **Upstream moves.** Merge `upstream/dev` into `ad-glass/main` through a PR inside the fork (never squash), simulator build green before merge.

### Third-party download hosts

A clean build downloads binaries from hosts we do not control: CocoaPods trunk, `nuget.org` (ONNX Runtime), `github.com` (Sherpa framework, Mapbox package, Azure Communication framework), `api.mapbox.com` (Mapbox binaries), npm. Mentra's own CI hides outages because its self-hosted Mac keeps a warm cache; a hosted runner starts cold every time. The ONNX host outage hit the first run of this workflow. Mitigation, in the workflow: the CocoaPods downloads, `mobile/ios/Pods` and `Podfile.lock` are cached in GitHub Actions, keyed on the lockfiles, the podspecs and the config files that decide the pod list, so a host outage does not stop a rebuild of unchanged dependencies. If `pod install` fails on a restored cache it is retried from a clean state. Limits, so nobody relies on it for more than it gives: GitHub deletes a cache that nothing has read for 7 days, a cache saved on one branch is not visible to another, and the Mapbox Swift packages (fetched by Xcode during the compile) and npm packages are not covered. It protects rebuilds in a busy week, not the rebuild 80 days later.

### The three most likely silent failures

1. **Telemetry still leaving the phone.** A later upstream merge re-adds the Sentry plugin, a Firebase plist, the PostHog default or the SDK's start-up call. Guards: section 7.1.
2. **The app builds but talks to Mentra's dev cloud.** The repo default is dev. Guard: the workflow writes the production URLs and asserts all four literals are present in `main.jsbundle` (Mentra's `assertBundleEnvironment` in `mobile/scripts/release-bundle-config.mjs` does the same).
3. **The ring fix quietly disappears** in an upstream merge conflict. Guard: a one-line grep in the workflow for `initController` inside `connectByName` in `DeviceManager.swift`, until upstream merges PR 4981.

### What still reaches Mentra in phase 1 (accepted, removed in phase 2)

Phase 1 keeps Mentra's login and cloud, so the app still talks to Mentra's Core and Runtime as the store app does. Beyond sign-in and the realtime session, two automatic uploads are worth knowing about (section 10, rows 3 and 7):

- **Miniapp crash-loop reports.** If a miniapp crashes repeatedly, the engine sends its last log lines to Core `/api/client/reports` (`MentraJSCrashloopReportService.ts`). The `telemetry` flag does not gate this. Rule until phase 2: AD Home must not write business data (names, amounts, job details) to its console log.
- **Support profile.** Phone and glasses model details go to Core at start and every 6 hours (`SupportProfileSync.ts`).
- Any report the app sends carries the build's commit and branch name (`diagnosticContext.ts`). Not personal data, but it names this fork's branch.

The Firebase, Google App Measurement and Sentry native libraries are still linked into the app because their packages are still installed; they are never configured or started (no Firebase project file, collection flag off, no DSN, `telemetry: false`). Confidence that an unconfigured Google App Measurement library sends nothing: moderate, not observed on a device. Phase 2 removes the packages.

### Blast radius

- Paul's fork only: one long-lived branch, two workflow files, one docs folder, about six app files.
- Paul's Apple account: one App ID, one cloud-managed certificate, one app record, one API key.
- Paul's iPhone: one extra app.
- Not touched: Mentra's repository, Mentra's App Store app, AD-ERP, the AD Home repository (it keeps working unchanged because the miniapp engine is not modified).

### Rollback

| What went wrong | Rollback |
|---|---|
| AD Glass misbehaves on the phone | Delete AD Glass, reopen the Mentra store app. The glasses and ring pair with either. Nothing on the glasses is changed by phase 1. |
| A new build is worse than the last | In the TestFlight app choose the previous build (kept 90 days). In git, `git revert` the commit on `ad-glass/main` and rebuild. |
| The API key may be exposed | Revoke it at https://appstoreconnect.apple.com/access/integrations/api and delete the four GitHub secrets. The key cannot spend money; it can upload builds and manage the app record. |
| The whole idea is abandoned | Delete the app record's builds, revoke the key, delete the `ad-glass/main` branch. Nothing else depends on it. |

## 9. Paul's Apple-side steps (after enrolment is approved)

1. **Find the Team ID.** Open https://developer.apple.com/account and scroll to "Membership details". Copy the 10-character Team ID.
2. **Create the API key.** Open https://appstoreconnect.apple.com/access/integrations/api . If the page shows "Request Access", click it and accept. Click the "+" next to "Active", name it `ad-glass-ci`, choose access **Admin**, click Generate. Copy the **Issuer ID** (top of the page) and the **Key ID** (in the table). Click "Download" once; the `AuthKey_XXXXXXXXXX.p8` file cannot be downloaded a second time.
3. **Add four GitHub secrets.** Open https://github.com/jpaulgayjr-stack/MentraOS/settings/secrets/actions/new four times, once per row in the table in 7.2. For `ADGLASS_ASC_KEY_P8`, open the `.p8` file in Notepad, select all, copy, paste. Do not paste any of these into a chat.
4. **Install TestFlight** on the iPhone: https://apps.apple.com/app/testflight/id899247664 and sign in with the same Apple ID.

Later, once the rebrand is merged and before the first upload: Paul creates the app record at https://appstoreconnect.apple.com/apps ("+", New App, iOS, bundle ID `com.domingueandco.adglass`). Exact steps come with the signed workflow.

## 10. Phase 2 inventory: every Mentra host and cloud call in `mobile/`

Phase 2 is done when the app passes a full test with all `*.mentraglass.com`, `*.mentraglass.cn` and `mentra.glass` hosts blocked.

The app talks to two Mentra services through the workspace package `cloud-v2/packages/cloud-client`: **Core** (`EXPO_PUBLIC_CLOUD_CORE_URL`) and **Runtime** (`EXPO_PUBLIC_CLOUD_RUNTIME_URL`). Nearly every host the consumer app uses is declared in one file, `mobile/src/services/deployment/officialManifest.ts`, and the manifest type already allows `coreUrl` and `runtimeUrl` to be null and has feature flags (`cloudSpeech`, `runtimeRealtimeSession`, `navigation`, `telemetry`). That file is the main seam for phase 2.

There is no existing switch that skips login. The built-in "organization" mode can repoint every host, but it only accepts Microsoft Entra sign-in (`src/services/deployment/resolver.ts:213-218`).

| # | Area | Hosts and calls | Where | Phase 2 plan |
|---|---|---|---|---|
| 1 | Accounts and login | Core `/api/account/*` (login, signup, me, subject-token, oauth google and apple, password, delete), Core `/api/client/auth/{exchange,refresh,runtime-token,miniapp-token,revoke}` | `src/utils/auth/provider/accountClient.ts:165-691`, `cloud-client/src/modules/auth/auth.ts:118-122` | Local single-user auth provider; no network |
| | Login gate | `navigateToDestination`, `checkLoggedIn`, `handleTokenExchange` send a user with no session to `/auth/start`; the engine refuses to start without a subject token | `src/app/index.tsx:113-170`, `src/contexts/AuthContext.tsx:61-161`, `src/services/MantleManager.ts:447-520` | Boot straight to home with the local user |
| | Other identity providers | Authing (China), Microsoft Entra and MSAL (`modules/entra-auth`, `msauth.<bundle>` scheme, ADAL keychain group) | `authingClient.ts:63-64`, `MicrosoftEntraDeploymentAuthProvider.ts`, `app.config.ts:242-246, 309-312` | Remove |
| 2 | Version check | Runtime `GET /api/client/min-version`; cached floor that blocks even offline; store links `apps.apple.com/app/id6747363193`, `play.google.com` | `src/utils/cloudVersion.ts:3,21`, `src/app/index.tsx:197-265`, `src/constants/appConfig.ts:6-18` | Remove the check and the cached floor |
| | Bluetooth SDK update check | `https://core.mentraglass.com/api/client/bluetooth-sdk/update-check`, hard-coded; upstream runs it on every SDK start regardless of analytics setting, and Core forwards the install id to PostHog | `modules/bluetooth-sdk/ios/Source/internal/BluetoothSdkUpdateCheck.swift:83` | Already off in phase 1 (section 5): skipped while the SDK's analytics are disabled. Phase 2 removes the code |
| 3 | Settings and user-data sync | App settings are already local (MMKV). Still syncing: support profile to Core `/api/client/support-profile` every 6 hours, fleet `/api/client/fleet/{report,desired-state}`, workspaces `/api/client/workspaces*`, declared age `/api/account/declared-age`, Core token pushed to the glasses | `modules/engine/src/services/SupportProfileSync.ts`, `modules/engine/src/engine.ts:121-134`, `cloud-client/src/modules/core/*` | Do not start these services when Core is null |
| 4 | Miniapp directory and install | Default list from Core `GET /api/client/deployment`; first-party miniapps (camera, gallery, settings, ai, navigation, call) installed from `miniapps.mentraglass.com/<package>/`; directory API `api.apps.mentraglass.com/api/directory/miniapps/<pkg>`; link hosts `apps.mentraglass.com`, `apps.mentra.glass`; Core registry `/api/client/registry/{register,status}` (non-blocking: install continues when unreachable) | `src/services/miniapps/defaultMiniapps.ts:30-66`, `officialManifest.ts:27-28`, `modules/engine/src/miniapp-links/index.ts:22-25,107-108`, `modules/engine/src/services/installMiniapp.ts:251,625-651` | Bundle the system miniapps we keep into the app; install AD Home from its own URL or a local ZIP; drop registry and directory |
| | Launch | Local only (WebView or JS runtime). No cloud call | `MiniappLauncher.ts`, `LocalMiniappRuntime.ts` | Keep as is |
| 5 | Glasses firmware and OTA | Manifest pin `MENTRA_OTA_MANIFEST_URL` or `EXPO_PUBLIC_ASG_OTA_VERSION_URL`; `ota.mentraglass.com/prod_live_version.json`; `mtkfirmware.mentraglass.com`; `artifactscdn.mentraglass.com/test-manifests`; vendor OTA for AR99 glasses at `ai.xyaiglasses.com`, `ai.smartxy.com.cn` | `modules/engine/src/services/otaManifestUrl.ts`, `otaManifestPolicy.ts:1`, `mtkDowngrade.ts:13`, `modules/bluetooth-sdk/ios/Source/OtaManifest.swift:6,183`, `src/services/ar99Ota.ts` | These are for Mentra Live and AR99 hardware, not the Even G2. Set the manifest URL to null and disable the fallbacks. No ring firmware code exists in the app. |
| 6 | Wallpapers and media | `mentra-wallpapers.mentraglass.com/*.jpeg`; onboarding videos from `mentra-videos-cdn.mentraglass.com` (`asset.mentraglass.cn` in China) | `officialManifest.ts:36-43`, `src/constants/appConfig.ts:10-29`, `src/app/onboarding/live.tsx` | Empty wallpaper list or bundled images; remove onboarding videos |
| 7 | Telemetry | Sentry (DSN from env, `sendDefaultPii: true`); Firebase Analytics (project `mentraos`); PostHog in the Bluetooth SDK; Core `/api/client/reports` (bug, feedback, OTA failure, crash reports, log upload); miniapp telemetry into fleet reports | `src/effects/SentrySetup.tsx`, `src/utils/analytics.ts`, `BluetoothSdkAnalytics.swift:39-40`, `cloud-client/src/modules/core/reports.ts:12`, `modules/engine/src/services/*ReportService.ts` | Sentry, Firebase and PostHog are already off after phase 1. Phase 2 removes the packages and the report services |
| 8 | Cloud speech to text | Glasses audio over the Runtime session (UDP or WebSocket), `/api/audio/subscriptions`. Starts only if `runtimeRealtimeSession` and `cloudSpeech` are not false | `modules/engine/src/engine.ts:116-118`, `cloud-client/src/modules/runtime/audio-udp.ts:45-91` | Set `cloudSpeech: false`; default routing to `localOnly` |
| | Cloud text to speech | Runtime `/api/tts/speak` | `cloud-client/src/modules/runtime/tts.ts:11`, `LocalMiniappRuntime.ts:2975-3026` | On-device only |
| | On-device speech (kept) | Sherpa models download from `github.com/k2-fsa/sherpa-onnx/releases` and `huggingface.co/alphacep` (third parties, not Mentra); the Sherpa iOS framework is vendored in the repo | `modules/engine/src/services/STTModelManager.ts:52-186`, `TTSModelManager.ts:160`, `WakeWordModelManager.ts:18` | Keep. Optionally bundle the English model in the app so first run needs no download |
| | Routing | `preferCloud` (default), `preferLocal` (what AD Home asks for), `localOnly` | `modules/engine/src/services/TranscriptionRouting.ts:1-29` | With cloud removed, `preferLocal` must never fall through to cloud |
| 9 | Realtime session | `wss://<runtime>/ws/session`; camera `/api/camera/*` (Cloudflare Stream); managed photo upload to a pre-signed URL; `/api/maps/*`; Teams meetings `/api/meetings/*` with Azure Communication Services (`modules/acs-meeting`); LiveKit is linked but unused | `cloud-client/src/client.ts:98-103`, `cloud-client/src/modules/runtime/*` | No session when Runtime is null. Remove `acs-meeting`, LiveKit and WebRTC plugins if nothing else needs them |
| 10 | Maps | Mapbox Navigation SDK in `modules/crust`; live path goes through Runtime `/api/maps/*`; deprecated direct calls to `api.mapbox.com` | Section 6; `modules/engine/src/services/NavigationHandlers.ts:350-434` | Remove (section 6) |
| 11 | Everything else | Universal links for `apps.mentraglass.com` (already dropped in phase 1); legal and docs links `mentraglass.com/privacy-policy`, `/terms-of-service`, `docs.mentraglass.com`; store review links; no push notifications and no support email found | `modules/engine/app.plugin.js:22-62`, `officialManifest.ts:46-48`, `appConfig.ts:6-17` | Null the links, hide the screens that show them |

What AD Home needs from the engine, read from the AD Home repository: display rendering, phone calendar, location, storage, on-phone transcription with `preferLocal`, UI messages, actions and the system share sheet. It uses no Mentra account token and no cloud API, so none of the rows above is a dependency for it. Its package name `com.domingueandco.adhome` installs from its own URL.

Expected behaviour today with Core and Runtime unreachable (inferred from the code, not tested): first login is impossible; a user who logged in before can still boot offline from cached tokens; installed local miniapps, Bluetooth control of the glasses and the local display keep working; cloud speech stops and on-device speech works if the models are already downloaded.

## 11. Open questions for Paul

1. How do you sign in to Mentra today: email and password, Google, or Apple? It decides whether the phase 1 login risk in section 8 applies.
2. Is `com.domingueandco.adglass` acceptable as the permanent bundle ID? It can change freely until the App Store Connect record is created.
