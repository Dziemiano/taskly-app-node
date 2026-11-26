import { spawn } from "node:child_process";
export function command(
  file,
  args,
  {
    cwd,
    timeout = 120_000,
    maxBytes = 1_000_000,
    env = process.env,
    encoding = "utf8",
  } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [],
      stderr = [];
    let size = 0,
      ended = false;
    const finish = (fn, value) => {
      if (!ended) {
        ended = true;
        clearTimeout(timer);
        fn(value);
      }
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(reject, new Error(`Command timed out: ${file}`));
    }, timeout);
    const collect = (target, chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        child.kill("SIGKILL");
        finish(reject, new Error(`Command output exceeds budget: ${file}`));
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", (chunk) => collect(stdout, chunk));
    child.stderr.on("data", (chunk) => collect(stderr, chunk));
    child.on("error", (error) => finish(reject, error));
    child.on("close", (code) => {
      const decode = (chunks) =>
        encoding === null
          ? Buffer.concat(chunks)
          : Buffer.concat(chunks).toString(encoding);
      finish(resolve, { code, stdout: decode(stdout), stderr: decode(stderr) });
    });
  });
}
export async function checked(file, args, options) {
  const result = await command(file, args, options);
  if (result.code !== 0)
    throw new Error(
      `${file} failed (${result.code}): ${String(result.stderr).slice(-2000)}`,
    );
  return result.stdout;
}
