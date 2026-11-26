import { cp, mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { dockerVerify } from "./verifier.mjs";

// Real negative integration probes; expected rejection is a successful audit outcome.
export async function runVerifierAudit({
  snapshot,
  output,
  verify = dockerVerify,
}) {
  const temporary = await mkdtemp(
    path.join(tmpdir(), "taskly-verifier-audit-"),
  );
  const probes = [];
  try {
    for (const kind of ["excluded-proposal", "setup-mutation"]) {
      const root = path.join(temporary, kind);
      await cp(snapshot, root, { recursive: true });
      const proposed = `frontend/src/audit-${kind}.test.ts`;
      const content =
        "import { it, expect } from 'vitest'; it('must execute', () => expect(false).toBe(true));\n";
      await writeFile(path.join(root, proposed), content);
      if (kind === "excluded-proposal") {
        const config = path.join(root, "frontend/vite.config.ts");
        let source = await readFile(config, "utf8");
        if (
          !source.includes("import { defineConfig } from 'vitest/config'") ||
          !source.includes("  test: {")
        )
          throw new Error("Audit fixture configuration shape changed");
        source = source
          .replace(
            "import { defineConfig }",
            "import { defineConfig, configDefaults }",
          )
          .replace(
            "  test: {",
            `  test: {\n    exclude: [...configDefaults.exclude, 'src/audit-${kind}.test.ts'],`,
          );
        await writeFile(config, source);
      } else {
        const file = path.join(root, "frontend/package.json");
        const pkg = JSON.parse(await readFile(file, "utf8"));
        pkg.scripts.postinstall = "node ./audit-mutate.cjs";
        await writeFile(file, JSON.stringify(pkg, null, 2));
        await writeFile(
          path.join(root, "frontend/audit-mutate.cjs"),
          `require('node:fs').writeFileSync('src/audit-${kind}.test.ts', '// proposal removed by setup\\n');\n`,
        );
      }
      const result = await verify(root, {
        expectedTests: [
          {
            path: proposed,
            sha256: createHash("sha256").update(content).digest("hex"),
          },
        ],
      });
      const expected =
        kind === "excluded-proposal"
          ? /Proposed test was not fully executed/
          : /Protected source\/test\/config changed during install/;
      const rejected =
        result.ok === false && expected.test(result.diagnostics ?? "");
      probes.push({
        name: kind,
        rejected,
        diagnostics: result.diagnostics,
        steps: result.steps.map(({ phase, code }) => ({ phase, code })),
      });
      if (!rejected)
        throw new Error(
          `Verifier negative probe did not reject correctly: ${kind}`,
        );
    }
    await mkdir(output, { recursive: true });
    await writeFile(
      path.join(output, "audit-probes.json"),
      JSON.stringify({ passed: true, probes }, null, 2),
    );
    return { passed: true, probes };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
