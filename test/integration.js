import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CLI = join(ROOT, "dist/cli.js");

function run(args, env = {}) {
  return new Promise((resolve) => {
    const proc = spawn("node", [CLI, ...args], {
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

// --- CLI arg validation ---

test("CLI: no command prints help and exits 0", async () => {
  const { code, stdout } = await run(["--help"]);
  assert.equal(code, 0);
  assert.ok(stdout.includes("satoric"));
});

test("CLI search: missing index name exits 1 with message", async () => {
  const { code, stderr } = await run(["search", "hello"]);
  assert.equal(code, 1);
  assert.ok(stderr.includes("name"));
});

test("CLI search: empty query exits 1", async () => {
  const { code, stderr } = await run(["search", ""], {
    SATORIC_INDEX: "test",
  });
  assert.equal(code, 1);
  assert.ok(stderr.length > 0);
});

test("CLI index doc upsert: missing api key exits 1 with message", async () => {
  const { code, stderr } = await run(["index", "doc", "upsert", "-n", "test"], {
    SATORIC_API_KEY: "",
  });
  assert.equal(code, 1);
  assert.ok(stderr.includes("api-key") || stderr.includes("SATORIC_API_KEY"));
});

test("CLI index doc upsert: missing index name exits 1 with message", async () => {
  const { code, stderr } = await run(["index", "doc", "upsert"], {
    SATORIC_API_KEY: "test-key",
    SATORIC_INDEX: "",
  });
  assert.equal(code, 1);
  assert.ok(stderr.includes("name") || stderr.includes("SATORIC_INDEX"));
});

test("CLI index doc delete: missing id and query exits 1", async () => {
  const { code, stderr } = await run(["index", "doc", "delete", "-n", "test", "-k", "key"]);
  assert.equal(code, 1);
  assert.ok(stderr.includes("id") || stderr.includes("query"));
});

// --- boost expression parser ---

const { toPainless } = await import(join(ROOT, "dist/math.js"));

test("toPainless: constant expression", () => {
  assert.equal(toPainless("1"), "1");
});

test("toPainless: field reference", () => {
  const out = toPainless("rank");
  assert.ok(out.includes("rank"));
});

test("toPainless: arithmetic expression", () => {
  const out = toPainless("1 - rank / 1000000");
  assert.ok(out.includes("rank"));
  assert.ok(out.includes("1000000"));
});

test("toPainless: function call", () => {
  const out = toPainless("log(rank + 1)");
  assert.ok(out.includes("Math.log"));
});

test("toPainless: invalid expression throws", () => {
  assert.throws(() => toPainless("rank ??? 1"), /invalid boost expression/);
});

// --- SDK exports ---

const sdk = await import(join(ROOT, "dist/sdk.js"));

test("SDK exports expected functions", () => {
  assert.equal(typeof sdk.search, "function");
  assert.equal(typeof sdk.authority, "function");
});
