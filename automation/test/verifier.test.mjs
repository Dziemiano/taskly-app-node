import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  dockerArguments,
  dockerVerify,
  clipDiagnostics,
} from "../verifier.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "taskly-verifier-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ["frontend/src", "backend/tests"])
    await mkdir(path.join(root, directory), { recursive: true });
  const content =
    "import { it, expect } from 'vitest'; it('behavior',()=>expect(1).toBe(1));\n";
  const proposed = "frontend/src/new.test.ts";
  await writeFile(path.join(root, proposed), content);
  await writeFile(path.join(root, "backend/tests/old.test.ts"), content);
  return {
    root,
    proposed,
    expectedTests: [
      {
        path: proposed,
        sha256: createHash("sha256").update(content).digest("hex"),
      },
    ],
  };
}
function report(file) {
  return {
    success: true,
    numTotalTests: 1,
    numPassedTests: 1,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: [
      {
        name: `/work/${file}`,
        status: "passed",
        assertionResults: [{ status: "passed" }],
      },
    ],
  };
}
async function writeReports(
  root,
  frontend = report("frontend/src/new.test.ts"),
) {
  await writeFile(
    path.join(root, ".agent-results/frontend.json"),
    JSON.stringify(frontend),
  );
  await writeFile(
    path.join(root, ".agent-results/backend.json"),
    JSON.stringify(report("backend/tests/old.test.ts")),
  );
}
function fakeRunner(root, calls, { mutateInstall, frontendReport } = {}) {
  return async (file, args, options) => {
    calls.push({ file, args, options });
    if (args[0] === "run") {
      if (args.includes("--network=none"))
        await writeReports(root, frontendReport);
      else if (mutateInstall) await mutateInstall(root);
    }
    return { code: 0, stdout: "ok", stderr: "" };
  };
}

test("container test boundary is read-only with limited writable overlays and no secrets/socket/network", () => {
  const args = dockerArguments("/tmp/candidate", "test-container", "test");
  for (const required of [
    "--network=none",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--read-only",
    "--memory=3g",
    "--pids-limit=256",
    "type=bind,src=/tmp/candidate,dst=/work,readonly",
  ])
    assert.ok(args.includes(required));
  assert.ok(args.some((x) => x.includes("dst=/work/.agent-results")));
  assert.equal(
    args.some((x) =>
      /OPENAI|GITHUB_TOKEN|docker.sock|--privileged|--network=host/.test(x),
    ),
    false,
  );
  assert.equal(
    dockerArguments("/tmp/candidate", "install", "install").includes(
      "--network=none",
    ),
    false,
  );
});

test("passing phases require actual all-passed reports and every proposed test with preserved hash", async (t) => {
  const { root, expectedTests } = await fixture(t),
    calls = [];
  const result = await dockerVerify(root, {
    expectedTests,
    runner: fakeRunner(root, calls),
  });
  assert.equal(result.ok, true);
  assert.equal(result.integrity.ok, true);
  assert.deepEqual(result.executedTests, [
    { path: expectedTests[0].path, passed: 1 },
  ]);
  assert.deepEqual(
    calls.map((x) => x.args[0]),
    ["run", "rm", "run", "rm"],
  );
  for (const call of calls)
    assert.deepEqual(Object.keys(call.options.env).sort(), ["HOME", "PATH"]);
  assert.equal(calls[0].args[3], calls[1].args[2]);
  assert.equal(calls[2].args[3], calls[3].args[2]);
});

test("a successful command cannot verify an excluded, skipped or missing proposed test", async (t) => {
  for (const kind of ["excluded", "skipped", "empty"]) {
    const { root, expectedTests } = await fixture(t),
      calls = [];
    const modified = report(
      kind === "excluded"
        ? "frontend/src/other.test.ts"
        : expectedTests[0].path,
    );
    if (kind === "skipped")
      modified.testResults[0].assertionResults[0].status = "pending";
    if (kind === "empty") modified.testResults[0].assertionResults = [];
    const result = await dockerVerify(root, {
      expectedTests,
      runner: fakeRunner(root, calls, { frontendReport: modified }),
    });
    assert.equal(result.ok, false);
    assert.match(result.diagnostics, /not fully executed/);
  }
});

test("npm setup changing a proposed test or adding protected source fails before test execution", async (t) => {
  for (const mutation of ["rewrite", "newfile"]) {
    const { root, expectedTests } = await fixture(t),
      calls = [];
    const result = await dockerVerify(root, {
      expectedTests,
      runner: fakeRunner(root, calls, {
        mutateInstall: async (current) =>
          writeFile(
            path.join(
              current,
              mutation === "rewrite"
                ? expectedTests[0].path
                : "frontend/src/injected.ts",
            ),
            "changed",
          ),
      }),
    });
    assert.equal(result.ok, false);
    assert.match(result.diagnostics, /Protected.*changed during install/);
    assert.deepEqual(
      calls.map((x) => x.args[0]),
      ["run", "rm"],
    );
  }
});

test("setup cannot turn a writable overlay into a host symlink mount", async (t) => {
  const { root, expectedTests } = await fixture(t),
    calls = [];
  const result = await dockerVerify(root, {
    expectedTests,
    runner: fakeRunner(root, calls, {
      mutateInstall: async (current) => {
        await rm(path.join(current, "frontend/node_modules"), {
          recursive: true,
        });
        await symlink("/proc", path.join(current, "frontend/node_modules"));
      },
    }),
  });
  assert.equal(result.ok, false);
  assert.match(result.diagnostics, /Unsafe writable mount/);
  assert.deepEqual(
    calls.map((x) => x.args[0]),
    ["run", "rm", "rm"],
  );
});

test("missing reports and report symlinks fail closed even when command exits zero", async (t) => {
  for (const kind of ["missing", "symlink"]) {
    const { root, expectedTests } = await fixture(t);
    const result = await dockerVerify(root, {
      expectedTests,
      runner: async (_file, args) => {
        if (
          args[0] === "run" &&
          args.includes("--network=none") &&
          kind === "symlink"
        )
          await symlink(
            "/proc/self/environ",
            path.join(root, ".agent-results/frontend.json"),
          );
        return { code: 0, stdout: "", stderr: "" };
      },
    });
    assert.equal(result.ok, false);
    assert.match(
      result.diagnostics,
      kind === "missing" ? /ENOENT/ : /Unsafe frontend test report/,
    );
  }
});

test("install failure and timeout stop execution and still clean up", async (t) => {
  for (const throws of [false, true]) {
    const { root } = await fixture(t),
      calls = [];
    const result = await dockerVerify(root, {
      runner: async (_file, args) => {
        calls.push(args);
        if (args[0] === "rm") return { code: 0, stdout: "", stderr: "" };
        if (throws) throw new Error("Command timed out");
        return { code: 1, stdout: "", stderr: "install failed" };
      },
    });
    assert.equal(result.ok, false);
    assert.equal(calls.length, 2);
    assert.equal(calls[1][0], "rm");
  }
});

test("diagnostics budget applies to serialized UTF-8 bytes including control escaping", () => {
  const text = "\x1b[31m" + '€\n\t"'.repeat(20000) + "TAIL";
  const clipped = clipDiagnostics(text);
  assert.ok(Buffer.byteLength(JSON.stringify(clipped)) <= 12000);
  assert.ok(clipped.endsWith("TAIL"));
  assert.equal(clipped.includes("\x1b"), false);
});

test("CI audit probes require the specific real-verifier rejection and persist concise evidence", async (t) => {
  const { root } = await fixture(t);
  const { runVerifierAudit } = await import("../verifier-audit.mjs");
  await writeFile(
    path.join(root, "frontend/vite.config.ts"),
    "import { defineConfig } from 'vitest/config'\nexport default defineConfig({\n  test: {\n  }\n})\n",
  );
  await writeFile(
    path.join(root, "frontend/package.json"),
    JSON.stringify({ scripts: {} }),
  );
  const inspected = [];
  const result = await runVerifierAudit({
    snapshot: root,
    output: path.join(root, "audit-output"),
    verify: async (candidate, { expectedTests }) => {
      const expected = expectedTests[0];
      inspected.push(expected.path);
      assert.equal(
        createHash("sha256")
          .update(await readFile(path.join(candidate, expected.path)))
          .digest("hex"),
        expected.sha256,
      );
      if (expected.path.includes("excluded")) {
        assert.match(
          await readFile(
            path.join(candidate, "frontend/vite.config.ts"),
            "utf8",
          ),
          /configDefaults.exclude/,
        );
        return {
          ok: false,
          steps: [
            { phase: "install", code: 0 },
            { phase: "test", code: 0 },
          ],
          diagnostics: "Proposed test was not fully executed: excluded",
        };
      }
      assert.equal(
        JSON.parse(
          await readFile(path.join(candidate, "frontend/package.json"), "utf8"),
        ).scripts.postinstall,
        "node ./audit-mutate.cjs",
      );
      return {
        ok: false,
        steps: [{ phase: "install", code: 0 }],
        diagnostics: "Protected source/test/config changed during install",
      };
    },
  });
  assert.equal(result.passed, true);
  assert.equal(inspected.length, 2);
  assert.equal(
    JSON.parse(
      await readFile(path.join(root, "audit-output/audit-probes.json"), "utf8"),
    ).probes.length,
    2,
  );
  await assert.rejects(
    () =>
      runVerifierAudit({
        snapshot: root,
        output: path.join(root, "unaccepted-output"),
        verify: async () => ({ ok: true, steps: [] }),
      }),
    /did not reject correctly/,
  );
});

test("tracked generated artifacts are rejected but Prisma files created by setup remain permitted", async (t) => {
  const first = await fixture(t),
    calls = [];
  await mkdir(path.join(first.root, "backend/src/generated/prisma"), {
    recursive: true,
  });
  await writeFile(
    path.join(first.root, "backend/src/generated/prisma/client.ts"),
    "tracked",
  );
  const rejected = await dockerVerify(first.root, {
    runner: fakeRunner(first.root, calls),
  });
  assert.equal(rejected.ok, false);
  assert.match(
    rejected.diagnostics,
    /Snapshot must not include generated Prisma artifacts/,
  );
  assert.equal(calls.length, 0);
  const second = await fixture(t);
  const accepted = await dockerVerify(second.root, {
    expectedTests: second.expectedTests,
    runner: fakeRunner(second.root, [], {
      mutateInstall: async (root) => {
        await mkdir(path.join(root, "backend/src/generated/prisma"), {
          recursive: true,
        });
        await writeFile(
          path.join(root, "backend/src/generated/prisma/client.ts"),
          "generated",
        );
      },
    }),
  });
  assert.equal(accepted.ok, true);
});

test("oversized protected input is rejected before file allocation or container execution", async (t) => {
  const { root } = await fixture(t),
    calls = [];
  const { open } = await import("node:fs/promises");
  const file = await open(path.join(root, "frontend/src/huge.bin"), "w");
  await file.truncate(4_000_001);
  await file.close();
  const result = await dockerVerify(root, { runner: fakeRunner(root, calls) });
  assert.equal(result.ok, false);
  assert.match(result.diagnostics, /manifest byte\/file budget exceeded/);
  assert.equal(calls.length, 0);
});
