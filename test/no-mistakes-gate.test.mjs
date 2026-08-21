import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parse } from "yaml";

const root = fileURLToPath(new URL("..", import.meta.url));
const workflowPath = join(
  root,
  ".github",
  "workflows",
  "no-mistakes-required.yml",
);

/**
 * The gate lives as an inline `run:` block so the whole file can be mirrored
 * into sibling repositories as one unit. Extract that exact block and execute
 * it, so these tests exercise what CI runs rather than a copy of it.
 */
function extractGateScript() {
  const doc = parse(readFileSync(workflowPath, "utf8"));
  const script = doc.jobs.check.steps[0]?.run;
  if (!script) throw new Error("no-mistakes gate step has no run block");
  return script;
}

const scriptPath = join(mkdtempSync(join(tmpdir(), "nm-gate-")), "gate.sh");
writeFileSync(scriptPath, extractGateScript());

function hasCommand(command) {
  return spawnSync("sh", ["-c", `command -v ${command}`]).status === 0;
}

// The gate is a bash script that parses JSON with jq, exactly as the
// ubuntu-latest runner does. Never skip on CI: a silently skipped gate test is
// worse than no test. Locally, skip when jq is absent rather than failing a
// contributor's test run over an unrelated missing tool.
const runnable = hasCommand("bash") && hasCommand("jq");
if (process.env.CI && !runnable) {
  throw new Error(
    "CI must provide bash and jq to exercise the no-mistakes gate",
  );
}

function runGate(body) {
  const result = spawnSync("bash", [scriptPath], {
    env: {
      ...process.env,
      PR_BODY: body,
      PR_AUTHOR: "somedev",
      PR_NUMBER: "42",
    },
    encoding: "utf8",
  });
  return {
    code: result.status ?? -1,
    output: `${result.stdout}${result.stderr}`,
  };
}

const SIGNATURE =
  "Updates from [git push no-mistakes](https://github.com/kunchenguid/no-mistakes)";
const ATTESTATION_PREFIX = "<!-- no-mistakes-pipeline-attestation:v1 ";
const ATTESTATION_SUFFIX = " -->";
const HEAD_SHA = "12df13109c6ad8d64646b85ac7170b23afe6e9bf";

/** A PR body shaped like the one no-mistakes writes. */
function prBody(attestationPayload) {
  const attestation =
    attestationPayload === undefined
      ? ""
      : `${ATTESTATION_PREFIX}${attestationPayload}${ATTESTATION_SUFFIX}\n\n`;
  return [
    "## What Changed\n\n- something\n",
    `## Pipeline\n\n${SIGNATURE}\n\n${attestation}`,
    "<details>\n<summary>Review</summary>\n\nok\n\n</details>\n",
  ].join("\n");
}

function attestation(steps) {
  return JSON.stringify({
    head_sha: HEAD_SHA,
    steps: steps.map(([step, status]) => ({ step, status })),
  });
}

/** The step snapshot a healthy run produces when the PR body is written. */
const HEALTHY_STEPS = [
  ["intent", "completed"],
  ["rebase", "completed"],
  ["review", "completed"],
  ["test", "completed"],
  ["document", "completed"],
  ["lint", "completed"],
  ["push", "completed"],
  ["pr", "running"],
  ["ci", "pending"],
];

function withStatus(step, status) {
  return HEALTHY_STEPS.map(([name, current]) =>
    name === step ? [name, status] : [name, current],
  );
}

describe("no-mistakes PR gate", { skip: !runnable }, () => {
  it("accepts a body whose attestation completes review, test, and document", () => {
    const { code, output } = runGate(prBody(attestation(HEALTHY_STEPS)));
    assert.equal(code, 0);
    assert.match(output, /review, test, and document all completed/);
  });

  it("still rejects a body with no no-mistakes signature", () => {
    const { code, output } = runGate("## Intent\n\nhand-written body\n");
    assert.equal(code, 1);
    assert.match(output, /was not raised through no-mistakes/);
    assert.match(output, /git push no-mistakes/);
  });

  it("rejects a signed body with no attestation and names the required version", () => {
    const { code, output } = runGate(prBody());
    assert.equal(code, 1);
    assert.match(output, /no pipeline attestation/);
    assert.ok(output.includes("no-mistakes >= 1.46.0 is required (PR 670)"));
  });

  // Every skip route no-mistakes has - `--skip`, a user skip at a gate, an
  // automatic pipeline skip, or a run that ran out of agent quota - lands on
  // the raw `skipped` status, and an unavailable agent surfaces as `failed`.
  for (const status of ["skipped", "failed", "running", "pending"]) {
    it(`rejects an attestation whose test step is ${status}`, () => {
      const { code, output } = runGate(
        prBody(attestation(withStatus("test", status))),
      );
      assert.equal(code, 1);
      assert.ok(output.includes(`records 'test' as '${status}'`));
    });
  }

  it("rejects an attestation that omits a required step entirely", () => {
    const steps = HEALTHY_STEPS.filter(([name]) => name !== "document");
    const { code, output } = runGate(prBody(attestation(steps)));
    assert.equal(code, 1);
    assert.ok(output.includes("no 'document' step record"));
  });

  it("rejects a required step recorded twice unless every record completed", () => {
    const steps = [...HEALTHY_STEPS, ["review", "skipped"]];
    const { code, output } = runGate(prBody(attestation(steps)));
    assert.equal(code, 1);
    assert.ok(output.includes("records 'review' as 'completed,skipped'"));
  });

  // v1 carries no skip sibling field, so `status` is the only skip channel
  // today. Fail closed if a later schema ever hangs a skip reason off an
  // otherwise-completed step instead of widening the gate silently.
  for (const marker of [
    { skip_reason: "quota exhausted" },
    { skipped: true },
    { agent_unavailable: true },
    { quota_exhausted: true },
  ]) {
    const key = Object.keys(marker)[0];
    it(`rejects a completed step carrying a ${key} marker`, () => {
      const payload = JSON.stringify({
        head_sha: HEAD_SHA,
        steps: HEALTHY_STEPS.map(([step, status]) =>
          step === "review" ? { step, status, ...marker } : { step, status },
        ),
      });
      const { code, output } = runGate(prBody(payload));
      assert.equal(code, 1);
      assert.ok(output.includes(`skip indicator(s) [${key}]`));
    });
  }

  it("fails closed on an attestation payload that is not valid JSON", () => {
    const { code, output } = runGate(
      prBody('{"head_sha":"abc","steps":[{"step":"review",'),
    );
    assert.equal(code, 1);
    assert.match(output, /could not be parsed as JSON/);
  });

  it("fails closed when the payload has no steps array", () => {
    const { code, output } = runGate(prBody('{"head_sha":"abc"}'));
    assert.equal(code, 1);
    assert.match(output, /could not be parsed as JSON/);
  });

  it("fails closed when the attestation comment is never closed", () => {
    const body = `## Pipeline\n\n${SIGNATURE}\n\n${ATTESTATION_PREFIX}{"head_sha":"abc","steps":[]}\n`;
    const { code, output } = runGate(body);
    assert.equal(code, 1);
    assert.match(output, /no JSON payload could be extracted/);
  });

  it("accepts a CRLF body", () => {
    const body = prBody(attestation(HEALTHY_STEPS)).replace(/\n/g, "\r\n");
    const { code } = runGate(body);
    assert.equal(code, 0);
  });
});
