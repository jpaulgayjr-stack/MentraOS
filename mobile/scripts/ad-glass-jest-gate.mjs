// AD Glass: decide whether a jest run passes.
//
//   jest --json --outputFile=jest.json ; node mobile/scripts/ad-glass-jest-gate.mjs jest.json
//
// Every test must pass. The only suites allowed to fail are the ones listed
// below, and only by failing to load: they read source files of Mentra's
// glasses firmware client (`asg_client/`). Upstream removed that directory from
// this repository (commit d4c4fd708, "Remove asg_client/: it moved to the
// private Mentra-Live-ASG-Client repo") and left these two suites behind, so
// they fail to load for upstream as well; there is nothing here to check out.
// Verified 2026-11-25: `git ls-tree upstream/dev asg_client` is empty.
// CONTRIBUTING.md still links the directory; that link is stale.
// Anything else that fails, fails the build.
// A listed suite that starts passing is reported so it can be taken off the list.
import {readFileSync} from "node:fs"
import {relative, resolve, sep} from "node:path"
import {fileURLToPath} from "node:url"

/** Suites that cannot load in this repository, with why. Paths are relative to `mobile/`. */
export const CANNOT_RUN_HERE = new Map([
  ["src/utils/__tests__/otaErrorMapping.test.ts", "reads asg_client/.../OtaHelper.java, which is not in this repository"],
  [
    "modules/bluetooth-sdk/src/__tests__/cameraFovContract.test.ts",
    "reads asg_client/.../AsgConstants.java, which is not in this repository",
  ],
])

/**
 * @param {{numFailedTests: number, numTotalTests: number, testResults: Array<{name: string, status: string,
 *   message?: string, assertionResults?: Array<{status: string}>}>}} report jest's --json output
 * @param {string} root the directory jest ran in (`mobile/`)
 */
export function judge(report, root) {
  const problems = []
  const notes = []
  if (!report || !Array.isArray(report.testResults) || report.testResults.length === 0) {
    return {ok: false, problems: ["the jest report lists no test suites: the run did not happen"], notes}
  }
  if (!(report.numTotalTests > 0)) problems.push("no tests ran")
  if (report.numFailedTests > 0) problems.push(`${report.numFailedTests} test(s) failed`)
  const seen = new Set()
  for (const suite of report.testResults) {
    const name = relative(root, resolve(root, suite.name)).split(sep).join("/")
    seen.add(name)
    const failedTests = (suite.assertionResults ?? []).filter((test) => test.status === "failed").length
    const allowed = CANNOT_RUN_HERE.get(name)
    if (suite.status === "passed") {
      if (allowed) notes.push(`${name} now passes: take it off the CANNOT_RUN_HERE list`)
      continue
    }
    // A suite whose tests are all skipped in the source (upstream has one) is reported, not failed.
    if (suite.status !== "failed") {
      notes.push(`${name}: ${suite.status}`)
      continue
    }
    if (!allowed) {
      problems.push(`${name}: ${failedTests > 0 ? `${failedTests} failing test(s)` : "the suite failed to run"}`)
    } else if (failedTests > 0) {
      problems.push(`${name}: listed as unable to load, but it loaded and ${failedTests} test(s) failed`)
    } else if (!/ENOENT[^\n]*asg_client/.test(suite.message ?? "")) {
      problems.push(`${name}: listed as unable to load for a missing asg_client file, but it failed another way`)
    } else {
      notes.push(`${name} did not run: ${allowed}`)
    }
  }
  return {ok: problems.length === 0, problems, notes}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2]
  if (!file) {
    console.error("usage: node ad-glass-jest-gate.mjs <jest --json output file> [directory jest ran in]")
    process.exit(2)
  }
  let report
  try {
    report = JSON.parse(readFileSync(file, "utf8"))
  } catch (error) {
    console.error(`::error::Could not read the jest report at ${file}: ${error.message}`)
    process.exit(1)
  }
  const {ok, problems, notes} = judge(report, resolve(process.argv[3] ?? process.cwd()))
  console.log(`jest: ${report.numPassedTests} passed, ${report.numFailedTests} failed, ${report.numTotalTests} total`)
  for (const note of notes) console.log(`note: ${note}`)
  for (const problem of problems) console.log(`::error::${problem}`)
  process.exit(ok ? 0 : 1)
}
