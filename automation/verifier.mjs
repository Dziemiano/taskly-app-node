import { randomUUID } from "node:crypto";
import { command } from "./process.mjs";
import { LIMITS } from "./contracts.mjs";
const IMAGE = "node:22.16.0-bookworm-slim";
export function dockerArguments(root, name, phase) {
  const script =
    phase === "install"
      ? "for d in frontend backend; do cd /work/$d && npm ci --no-audit --no-fund || exit $?; done"
      : "for d in frontend backend; do cd /work/$d && ./node_modules/.bin/vitest run --coverage && ./node_modules/.bin/tsc --noEmit || exit $?; done";
  return [
    "run",
    "--rm",
    "--name",
    name,
    "--user",
    `${process.getuid()}:${process.getgid()}`,
    "--init",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--pids-limit=256",
    "--memory=3g",
    "--cpus=2",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=256m",
    ...(phase === "test" ? ["--network=none"] : []),
    "--mount",
    `type=bind,src=${root},dst=/work`,
    "--workdir=/work",
    "--env",
    "CI=true",
    "--env",
    "HOME=/tmp",
    "--env",
    "DATABASE_URL=postgresql://test:test@localhost:5432/test",
    IMAGE,
    "sh",
    "-c",
    script,
  ];
}
export async function dockerVerify(root, { runner = command } = {}) {
  const steps = [];
  for (const phase of ["install", "test"]) {
    const name = `taskly-agent-${randomUUID()}`;
    try {
      const value = await runner("docker", dockerArguments(root, name, phase), {
        timeout: phase === "install" ? 240_000 : 180_000,
        maxBytes: 2_000_000,
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
      });
      steps.push({
        phase,
        code: value.code,
        diagnostics: (value.stdout + "\n" + value.stderr).slice(
          -LIMITS.logBytes,
        ),
      });
      if (value.code !== 0) return { ok: false, steps };
    } catch (error) {
      steps.push({ phase, code: -1, diagnostics: error.message });
      return { ok: false, steps };
    } finally {
      await runner("docker", ["rm", "-f", name], {
        timeout: 10_000,
        maxBytes: 1000,
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
      }).catch(() => {});
    }
  }
  return { ok: true, steps };
}
