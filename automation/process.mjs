import { spawn } from "node:child_process";
export function command(
  file,
  args,
  { cwd, timeout = 120_000, maxBytes = 1_000_000, env = process.env } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "",
      size = 0,
      ended = false;
    const finish = (fn, v) => {
      if (!ended) {
        ended = true;
        clearTimeout(timer);
        fn(v);
      }
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(reject, new Error(`Command timed out: ${file}`));
    }, timeout);
    const collect = (which, chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        child.kill("SIGKILL");
        finish(reject, new Error(`Command output exceeds budget: ${file}`));
        return;
      }
      if (which === "out") stdout += chunk;
      else stderr += chunk;
    };
    child.stdout.on("data", (x) => collect("out", x));
    child.stderr.on("data", (x) => collect("err", x));
    child.on("error", (x) => finish(reject, x));
    child.on("close", (code) => finish(resolve, { code, stdout, stderr }));
  });
}
export async function checked(file, args, options) {
  const result = await command(file, args, options);
  if (result.code !== 0)
    throw new Error(
      `${file} failed (${result.code}): ${result.stderr.slice(-2000)}`,
    );
  return result.stdout;
}
