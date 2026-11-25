// Run with: node --test mobile/scripts/sightline-workflows.test.mjs
//
// The TestFlight workflow builds the app the same way the simulator workflow
// does, and ships it. The simulator workflow is the one that carries the guards
// (identity, telemetry, backend). If the two ever prepared the build
// differently, the guards would be checking one app and Apple would receive
// another. These tests fail the TestFlight job when that happens: copy the
// changed step from sightline-ios-simulator.yml into sightline-ios-testflight.yml.
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {test} from "node:test"
import {fileURLToPath} from "node:url"

const workflows = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.github/workflows")
const read = (name) => readFileSync(path.join(workflows, name), "utf8").replaceAll("\r\n", "\n")
const simulator = read("sightline-ios-simulator.yml")
const testflight = read("sightline-ios-testflight.yml")

// Steps that turn the source into the Xcode project that gets compiled.
const SHARED_STEPS = [
  "Checkout",
  "Select Xcode",
  "Setup Bun",
  "Setup Node.js",
  "Environment file",
  "Install JavaScript dependencies",
  "Expo prebuild (generate the Xcode project)",
  "Sherpa on-device speech framework",
  "CocoaPods",
]

/** One step's text: from its `- name:` line to the next step, without the comments that lead into that next step. */
function step(workflow, name) {
  const start = workflow.indexOf(`      - name: ${name}\n`)
  assert.notEqual(start, -1, `step "${name}" not found`)
  const rest = workflow.slice(start + 1)
  const next = rest.search(/^ {6}- name: /m)
  const lines = (next === -1 ? rest : rest.slice(0, next)).trimEnd().split("\n")
  while (lines.at(-1).trim() === "" || lines.at(-1).trimStart().startsWith("#")) lines.pop()
  return lines.join("\n")
}

const jobEnvironment = (workflow) => workflow.split("\n").filter((line) => /^ {6}[A-Z][A-Z0-9_]*: /.test(line))

for (const name of SHARED_STEPS) {
  test(`both workflows run the same "${name}" step`, () => {
    assert.equal(step(testflight, name), step(simulator, name))
  })
}

test("the TestFlight job has every job-level setting the simulator job has, with the same value", () => {
  const shipped = new Set(jobEnvironment(testflight))
  const missing = jobEnvironment(simulator).filter((line) => !shipped.has(line))
  assert.deepEqual(missing, [])
})

test("the only job-level setting the TestFlight job adds is the signing team", () => {
  const guarded = new Set(jobEnvironment(simulator))
  const added = jobEnvironment(testflight).filter((line) => !guarded.has(line))
  assert.deepEqual(added, ["      SIGHTLINE_APPLE_TEAM_ID: ${{ secrets.SIGHTLINE_APPLE_TEAM_ID }}"])
})

test("the simulator workflow still names the steps this comparison relies on", () => {
  for (const name of SHARED_STEPS) assert.ok(simulator.includes(`      - name: ${name}\n`), name)
})
