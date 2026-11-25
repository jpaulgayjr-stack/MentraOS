// Run with: node --test mobile/scripts/ad-glass-jest-gate.test.mjs
import assert from "node:assert/strict"
import {test} from "node:test"

import {CANNOT_RUN_HERE, judge} from "./ad-glass-jest-gate.mjs"

const ROOT = "/repo/mobile"
const [KNOWN] = [...CANNOT_RUN_HERE.keys()]
const passed = (name) => ({name: `${ROOT}/${name}`, status: "passed", assertionResults: [{status: "passed"}]})
const failedTests = (name, count = 1) => ({
  name: `${ROOT}/${name}`,
  status: "failed",
  message: "",
  assertionResults: Array.from({length: count}, () => ({status: "failed"})),
})
const cannotLoad = (name, message = "ENOENT: no such file or directory, open '/repo/asg_client/app/X.java'") => ({
  name: `${ROOT}/${name}`,
  status: "failed",
  message,
  assertionResults: [],
})
const report = (testResults, numFailedTests = 0) => ({numFailedTests, numTotalTests: 10, numPassedTests: 10, testResults})

test("a clean run passes", () => {
  assert.deepEqual(judge(report([passed("src/a.test.ts")]), ROOT), {ok: true, problems: [], notes: []})
})

test("a listed suite that cannot load for the missing firmware sources is allowed, and said so", () => {
  const verdict = judge(report([passed("src/a.test.ts"), cannotLoad(KNOWN)]), ROOT)
  assert.equal(verdict.ok, true)
  assert.match(verdict.notes[0], /did not run/)
})

test("any failing test fails the gate", () => {
  const verdict = judge(report([failedTests("src/a.test.ts", 2)], 2), ROOT)
  assert.equal(verdict.ok, false)
  assert.match(verdict.problems.join("\n"), /2 test\(s\) failed/)
  assert.match(verdict.problems.join("\n"), /src\/a\.test\.ts: 2 failing test/)
})

test("a suite that fails to run and is not on the list fails the gate", () => {
  const verdict = judge(report([cannotLoad("src/b.test.ts")]), ROOT)
  assert.equal(verdict.ok, false)
  assert.match(verdict.problems[0], /src\/b\.test\.ts: the suite failed to run/)
})

test("a listed suite is not excused for failing some other way", () => {
  assert.equal(judge(report([cannotLoad(KNOWN, "SyntaxError: Unexpected token")]), ROOT).ok, false)
  assert.equal(judge(report([failedTests(KNOWN)], 1), ROOT).ok, false)
})

test("a listed suite that passes is reported for removal from the list", () => {
  const verdict = judge(report([passed(KNOWN)]), ROOT)
  assert.equal(verdict.ok, true)
  assert.match(verdict.notes[0], /take it off/)
})

test("a suite whose tests are all skipped is noted, not failed", () => {
  const skipped = {name: `${ROOT}/src/c.test.ts`, status: "skipped", assertionResults: [{status: "pending"}]}
  const verdict = judge(report([passed("src/a.test.ts"), skipped]), ROOT)
  assert.equal(verdict.ok, true)
  assert.deepEqual(verdict.notes, ["src/c.test.ts: skipped"])
})

test("an empty or missing report fails the gate", () => {
  assert.equal(judge(report([]), ROOT).ok, false)
  assert.equal(judge(null, ROOT).ok, false)
  assert.equal(judge({numFailedTests: 0, numTotalTests: 0, testResults: [passed("src/a.test.ts")]}, ROOT).ok, false)
})
