// Run with: node --test mobile/scripts/ad-glass-hosts.test.mjs
//
// AD Glass must never contact a server Mentra owns. The simulator job proves
// that for the hostnames in ad-glass-blocked-hosts.txt; this test keeps that
// list complete: every Mentra hostname written anywhere in the app's sources
// has to be in it. See docs/ad-glass/spec-phase2.md.
import assert from "node:assert/strict"
import {readdirSync, readFileSync, statSync} from "node:fs"
import {dirname, extname, join, relative, resolve, sep} from "node:path"
import {test} from "node:test"
import {fileURLToPath} from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, "..", "..")

/** Where source that ends up in the app (or configures its build) lives. */
const ROOTS = [
  "mobile/src",
  "mobile/modules",
  "mobile/plugins",
  "mobile/scripts",
  "mobile/app.config.ts",
  "mobile/.env.example",
  "cloud-v2/packages/cloud-client/src",
  "cloud-v2/packages/protocol/src",
  "cloud-v2/packages/workspace-contract/src",
]
const SKIP_DIRS = new Set(["node_modules", "build", "Pods", ".gradle", "dist", ".expo", "android", "DerivedData"])
const EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs", ".json", ".swift", ".m", ".mm", ".h", ".plist", ".example", ".rb",
])
const MENTRA_HOST = /(?<![A-Za-z0-9%.-])((?:[a-z0-9-]+\.)*(?:mentraglass\.com|mentraglass\.cn|mentra\.glass))(?![A-Za-z0-9-])/gi
/**
 * A Mentra domain written as a bare suffix, which is how a hostname assembled at run time looks in the source
 * (`${region}.mentraglass.com`, `"core." + env + ".mentraglass.com"`): the literal scan above cannot name the host.
 * A leading dot directly after a quote, backtick, `}` or `+` is the tell.
 */
const BUILT_AT_RUN_TIME = /(?:[`'"}]|\+\s*["'`])\.(?:[a-z0-9-]+\.)*(?:mentraglass\.com|mentraglass\.cn|mentra\.glass)(?![A-Za-z0-9-])/gi
/** Matches that are not hostnames: an Android-style package name written in the sources. */
const NOT_HOSTS = new Set(["com.mentra.glass"])
/** Files whose job is to name these hosts. */
const SELF = new Set(["mobile/scripts/ad-glass-hosts.test.mjs"])

export function readBlockedHosts(file = join(here, "ad-glass-blocked-hosts.txt")) {
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean)
}

function* files(path) {
  const stat = statSync(path, {throwIfNoEntry: false})
  if (!stat) return
  if (stat.isFile()) {
    if (EXTENSIONS.has(extname(path)) || path.endsWith(".env.example")) yield path
    return
  }
  for (const entry of readdirSync(path, {withFileTypes: true})) {
    // "android" is skipped: the Android app is not built from this fork yet (phase 2b).
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
    yield* files(join(path, entry.name))
  }
}

function scanSources() {
  const found = new Map()
  const assembled = []
  for (const root of ROOTS) {
    for (const file of files(join(repo, root))) {
      const name = relative(repo, file).split(sep).join("/")
      if (SELF.has(name)) continue
      const text = readFileSync(file, "utf8")
      for (const match of text.matchAll(MENTRA_HOST)) {
        const host = match[1].toLowerCase()
        if (NOT_HOSTS.has(host)) continue
        if (!found.has(host)) found.set(host, name)
      }
      for (const match of text.matchAll(BUILT_AT_RUN_TIME)) assembled.push(`${match[0]} (${name})`)
    }
  }
  return {found, assembled}
}

function mentraHostsInSources() {
  return scanSources().found
}

test("the blocked-hosts list is well formed", () => {
  const hosts = readBlockedHosts()
  assert.ok(hosts.length > 20, "the list looks truncated")
  assert.deepEqual(hosts, [...new Set(hosts)], "a hostname is listed twice")
  for (const host of hosts) {
    assert.match(host, /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, `not a hostname: ${host}`)
  }
})

test("every Mentra hostname in the app's sources is blocked in the simulator job", () => {
  const blocked = new Set(readBlockedHosts())
  const found = mentraHostsInSources()
  assert.ok(found.size > 10, "the scan found too few hosts: it is probably not reading the sources")
  const missing = [...found].filter(([host]) => !blocked.has(host)).map(([host, file]) => `${host} (${file})`)
  assert.deepEqual(
    missing,
    [],
    "Mentra hostnames that are in the sources but not in mobile/scripts/ad-glass-blocked-hosts.txt. " +
      "Check what uses each one, make sure AD Glass cannot reach it, then add it to the list.",
  )
})

test("no Mentra hostname is assembled at run time, where this list could not name it", () => {
  assert.deepEqual(
    scanSources().assembled,
    [],
    "A Mentra domain appears as a bare suffix, so some code builds a hostname from parts. Work out every host it can " +
      "produce, make sure AD Glass cannot reach them, add them to the blocked-hosts list, and only then teach this " +
      "test about the pattern.",
  )
})

test("the run-time pattern recognises the usual ways of building a hostname", () => {
  for (const sample of ["`https://${region}.mentraglass.com`", '"core." + env + ".mentraglass.com"', "'.mentra.glass'"]) {
    assert.equal([...sample.matchAll(BUILT_AT_RUN_TIME)].length, 1, sample)
  }
  for (const sample of ['"https://core.mentraglass.com"', "apps.mentra.glass", "com.mentraglass"]) {
    assert.equal([...sample.matchAll(BUILT_AT_RUN_TIME)].length, 0, sample)
  }
})

test("the hosts the phase 1 build talked to are on the list", () => {
  const blocked = new Set(readBlockedHosts())
  for (const host of [
    "core.us-west-2.mentraglass.com",
    "runtime.us-west-2.mentraglass.com",
    "miniapps.mentraglass.com",
    "api.apps.mentraglass.com",
    "core.mentraglass.com",
    "us.i.posthog.com",
  ]) {
    assert.ok(blocked.has(host), `${host} is missing`)
  }
})
