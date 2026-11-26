import test from "node:test";
import assert from "node:assert/strict";
import { command, checked } from "../process.mjs";

test("binary subprocess output preserves bytes and text decodes after chunk aggregation", async () => {
  const binary = await checked(
    "sh",
    ["-c", "printf '\\000\\377\\303\\050\\200'"],
    { encoding: null },
  );
  assert.deepEqual(binary, Buffer.from([0, 255, 195, 40, 128]));
  const text = await checked("sh", [
    "-c",
    "printf '\\342'; sleep 0.03; printf '\\202\\254'",
  ]);
  assert.equal(text, "€");
});

test("subprocess exit errors, output budget and timeout fail explicitly", async () => {
  await assert.rejects(
    () => checked("sh", ["-c", "printf failure >&2; exit 2"]),
    /failed \(2\): failure/,
  );
  await assert.rejects(
    () => command("printf", ["%s", "x".repeat(10000)], { maxBytes: 100 }),
    /output exceeds budget/,
  );
  await assert.rejects(
    () => command("sh", ["-c", "exec sleep 10"], { timeout: 50 }),
    /timed out/,
  );
});
