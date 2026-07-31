import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const root = fileURLToPath(new URL("../../..", import.meta.url));
const workflowsDir = join(root, ".github", "workflows");

/**
 * Derive the exact release-please output set from config + workflow inputs.
 * Keep this aligned with the fleet audit rule in firstmate's release-please CI
 * report: node -> package.json (+ package-lock.json if present), changelog,
 * extra-files, and the manifest path. Package paths other than "." are
 * prefixed onto default file names.
 */
function expectedReleaseOutputs(): string[] {
  const config = JSON.parse(
    readFileSync(join(root, "release-please-config.json"), "utf8"),
  ) as {
    "release-type"?: string;
    "changelog-path"?: string;
    "version-file"?: string;
    "extra-files"?: Array<string | { path?: string }>;
    packages?: Record<
      string,
      {
        "release-type"?: string;
        "changelog-path"?: string;
        "version-file"?: string;
        "extra-files"?: Array<string | { path?: string }>;
      }
    >;
  };

  const expected: string[] = [];
  const packages = config.packages ?? { ".": {} };

  for (const [pkgPath, pkgConfig] of Object.entries(packages)) {
    const releaseType =
      pkgConfig["release-type"] ?? config["release-type"] ?? "node";
    const prefix = pkgPath === "." ? "" : `${pkgPath.replace(/\/$/, "")}/`;

    const changelogDefault = `${prefix}CHANGELOG.md`;
    const changelogConfigured =
      pkgConfig["changelog-path"] ?? config["changelog-path"];
    const changelog = changelogConfigured
      ? changelogConfigured.startsWith(prefix) || pkgPath === "."
        ? changelogConfigured
        : `${prefix}${changelogConfigured}`
      : changelogDefault;
    expected.push(changelog);

    switch (releaseType) {
      case "simple": {
        const versionDefault = `${prefix}version.txt`;
        const versionConfigured =
          pkgConfig["version-file"] ?? config["version-file"];
        const versionFile = versionConfigured
          ? versionConfigured.startsWith(prefix) || pkgPath === "."
            ? versionConfigured
            : `${prefix}${versionConfigured}`
          : versionDefault;
        expected.push(versionFile);
        break;
      }
      case "node":
        expected.push(`${prefix}package.json`);
        if (existsSync(join(root, `${prefix}package-lock.json`))) {
          expected.push(`${prefix}package-lock.json`);
        }
        break;
      case "go":
        break;
      default:
        throw new Error(
          `unsupported release-please release-type for ignore derivation: ${releaseType}`,
        );
    }

    const extra = pkgConfig["extra-files"] ?? config["extra-files"] ?? [];
    for (const entry of extra) {
      const path = typeof entry === "string" ? entry : entry?.path;
      if (path) expected.push(path);
    }
  }

  let manifest = ".release-please-manifest.json";
  const releaseWorkflowName = readdirSync(workflowsDir).find(
    (name) => name.includes("release-please") && name.endsWith(".yml"),
  );
  if (releaseWorkflowName) {
    const releaseWorkflow = readFileSync(
      join(workflowsDir, releaseWorkflowName),
      "utf8",
    );
    const manifestMatch = releaseWorkflow.match(/manifest-file:\s*(\S+)/);
    if (manifestMatch) manifest = manifestMatch[1];
  }
  expected.push(manifest);

  return [...new Set(expected)];
}

function loadWorkflowOn(filePath: string): Record<string, unknown> | null {
  const doc = parse(readFileSync(filePath, "utf8")) as Record<
    string | boolean,
    unknown
  > | null;
  if (!doc || typeof doc !== "object") return null;
  // YAML 1.1 may parse a bare `on:` key as boolean true.
  const on = doc.on ?? doc[true];
  if (!on || typeof on !== "object" || Array.isArray(on)) return null;
  return on as Record<string, unknown>;
}

type PullRequestFilter =
  | { kind: "unfiltered" }
  | { kind: "paths-ignore"; paths: string[] }
  | { kind: "paths"; paths: string[] };

function pullRequestFilterCoverage(pr: unknown): PullRequestFilter {
  if (pr == null) {
    return { kind: "unfiltered" };
  }
  if (typeof pr !== "object" || Array.isArray(pr)) {
    // `pull_request:` bare form means no path filter.
    return { kind: "unfiltered" };
  }

  const record = pr as Record<string, unknown>;
  if (Array.isArray(record["paths-ignore"])) {
    return {
      kind: "paths-ignore",
      paths: record["paths-ignore"].map(String),
    };
  }

  if (Array.isArray(record.paths)) {
    return { kind: "paths", paths: record.paths.map(String) };
  }

  return { kind: "unfiltered" };
}

function globMatch(pattern: string, path: string): boolean {
  // Minimal support for the `**` / `*` patterns used in workflow path filters.
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLE::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLE::/g, ".*");
  return new RegExp(`^${escaped}$`).test(path);
}

function isCovered(filter: PullRequestFilter, releasePath: string): boolean {
  if (filter.kind === "unfiltered") return false;

  if (filter.kind === "paths-ignore") {
    return filter.paths.includes(releasePath);
  }

  // paths allow-list: a release path is "covered" (will not create a run on its
  // own) when no positive pattern matches it, or a later negation excludes it.
  let matched = false;
  for (const pattern of filter.paths) {
    if (pattern.startsWith("!")) {
      const negated = pattern.slice(1);
      if (
        matched &&
        (negated === releasePath || globMatch(negated, releasePath))
      ) {
        matched = false;
      }
      continue;
    }
    if (pattern === releasePath || globMatch(pattern, releasePath)) {
      matched = true;
    }
  }
  // Covered means the path does NOT cause the workflow to run.
  return !matched;
}

/**
 * Approximate GitHub's path filter: a workflow runs when any changed path is
 * selected by the filter. For paths-ignore, every path must match an ignore
 * pattern to skip. For paths, at least one path must match a positive pattern
 * after applying later negations.
 */
function wouldRun(filter: PullRequestFilter, changedPaths: string[]): boolean {
  if (filter.kind === "unfiltered") return changedPaths.length > 0;

  if (filter.kind === "paths-ignore") {
    return changedPaths.some(
      (path) =>
        !filter.paths.some(
          (pattern) => pattern === path || globMatch(pattern, path),
        ),
    );
  }

  return changedPaths.some((path) => {
    let matched = false;
    for (const pattern of filter.paths) {
      if (pattern.startsWith("!")) {
        const negated = pattern.slice(1);
        if (matched && (negated === path || globMatch(negated, path))) {
          matched = false;
        }
        continue;
      }
      if (pattern === path || globMatch(pattern, path)) {
        matched = true;
      }
    }
    return matched;
  });
}

describe("release-please CI exclusions", () => {
  const expected = expectedReleaseOutputs();

  it("derives the monorepo node release-output set for axi-sdk-js", () => {
    expect(expected).toEqual([
      "packages/axi-sdk-js/CHANGELOG.md",
      "packages/axi-sdk-js/package.json",
      ".release-please-manifest.json",
    ]);
    // Defensive lockfile path is not currently present under pnpm.
    expect(existsSync(join(packageRoot, "package-lock.json"))).toBe(false);
  });

  it("every pull_request workflow ignores the full release-output set", () => {
    const files = readdirSync(workflowsDir).filter((name) =>
      name.endsWith(".yml"),
    );
    const prWorkflows: { name: string; filter: PullRequestFilter }[] = [];

    for (const name of files) {
      const filePath = join(workflowsDir, name);
      const on = loadWorkflowOn(filePath);
      if (!on || !("pull_request" in on)) continue;
      prWorkflows.push({
        name,
        filter: pullRequestFilterCoverage(on.pull_request),
      });
    }

    expect(prWorkflows.map((w) => w.name).sort()).toEqual([
      "axi-sdk-js-ci.yml",
      "docs-check.yml",
      "guard-generated-files.yml",
      "no-mistakes-required.yml",
    ]);

    const failures: string[] = [];
    for (const { name, filter } of prWorkflows) {
      const missing = expected.filter((path) => !isCovered(filter, path));
      if (missing.length > 0) {
        failures.push(`${name} missing coverage for: ${missing.join(", ")}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("uses negated paths on axi-sdk-js-ci pull_request and leaves push unchanged", () => {
    const on = loadWorkflowOn(join(workflowsDir, "axi-sdk-js-ci.yml"));
    expect(on).not.toBeNull();

    const push = on!.push as Record<string, unknown>;
    expect(push.branches).toEqual(["main"]);
    expect(push.paths).toEqual([
      "package.json",
      "packages/axi-sdk-js/**",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      ".github/workflows/axi-sdk-js-ci.yml",
    ]);

    const pr = on!.pull_request as Record<string, unknown>;
    expect(pr.branches).toEqual(["main"]);
    expect(pr.paths).toEqual([
      "package.json",
      "packages/axi-sdk-js/**",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      ".github/workflows/axi-sdk-js-ci.yml",
      "!packages/axi-sdk-js/CHANGELOG.md",
      "!packages/axi-sdk-js/package.json",
      "!packages/axi-sdk-js/package-lock.json",
    ]);
    // Never combine paths with paths-ignore on the same event.
    expect(pr["paths-ignore"]).toBeUndefined();
    // Root package.json must stay positive so real root-manifest PRs still CI.
    expect(pr.paths).toContain("package.json");
    expect(pr.paths).not.toContain("!package.json");
  });

  it("keeps docs-check pull_request path allow-list free of release-output matches", () => {
    const on = loadWorkflowOn(join(workflowsDir, "docs-check.yml"));
    expect(on).not.toBeNull();
    const pr = pullRequestFilterCoverage(on!.pull_request);
    expect(pr.kind).toBe("paths");
    for (const path of expected) {
      expect(isCovered(pr, path)).toBe(true);
    }
  });

  it("simulates zero runs for release-only file lists and runs for ordinary PRs", () => {
    const releaseOnly = [
      ".release-please-manifest.json",
      "packages/axi-sdk-js/CHANGELOG.md",
      "packages/axi-sdk-js/package.json",
    ];
    const ordinarySdkChange = ["packages/axi-sdk-js/src/cli.ts"];
    const ordinaryRootManifest = ["package.json"];
    const mixed = [
      "packages/axi-sdk-js/package.json",
      "packages/axi-sdk-js/src/cli.ts",
    ];

    const files = readdirSync(workflowsDir).filter((name) =>
      name.endsWith(".yml"),
    );
    for (const name of files) {
      const on = loadWorkflowOn(join(workflowsDir, name));
      if (!on || !("pull_request" in on)) continue;
      const filter = pullRequestFilterCoverage(on.pull_request);

      expect(wouldRun(filter, releaseOnly), `${name} release-only`).toBe(false);

      if (name === "axi-sdk-js-ci.yml") {
        expect(wouldRun(filter, ordinarySdkChange)).toBe(true);
        expect(wouldRun(filter, ordinaryRootManifest)).toBe(true);
        expect(wouldRun(filter, mixed)).toBe(true);
      }
    }
  });

  it("keeps bot author exemptions on guard and no-mistakes jobs", () => {
    const guard = readFileSync(
      join(workflowsDir, "guard-generated-files.yml"),
      "utf8",
    );
    const nmr = readFileSync(
      join(workflowsDir, "no-mistakes-required.yml"),
      "utf8",
    );
    expect(guard).toContain("github-actions[bot]");
    expect(guard).toContain("release-please[bot]");
    expect(nmr).toContain("github-actions[bot]");
    expect(nmr).toContain("dependabot[bot]");
    expect(nmr).toContain("release-please[bot]");
  });
});
