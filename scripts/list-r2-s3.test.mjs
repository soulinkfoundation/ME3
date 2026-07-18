import assert from "node:assert/strict";
import test from "node:test";
import { listR2Objects } from "./list-r2-s3.mjs";

const BASE = {
  endpoint: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`,
  bucket: "me3-mi-1234567890abcdef-r2",
};

test("materializes every explicit page into one complete stable listing", () => {
  const calls = [];
  const pages = [
    {
      IsTruncated: true,
      NextContinuationToken: "next-token",
      Contents: [{ Key: "z.txt", Size: 1, ETag: '"z"' }],
    },
    {
      IsTruncated: false,
      Contents: [{ Key: "a.txt", Size: 2, ETag: '"a"' }],
    },
  ];
  const result = listR2Objects(BASE, {
    run: (args) => {
      calls.push(args);
      return { ok: true, stdout: JSON.stringify(pages.shift()), output: "" };
    },
  });
  assert.deepEqual(result.Contents.map((object) => object.Key), ["a.txt", "z.txt"]);
  assert.equal(result.IsTruncated, false);
  assert.equal(result.Missing, false);
  assert.equal(calls[0].includes("--no-paginate"), true);
  assert.equal(calls[1][calls[1].indexOf("--continuation-token") + 1], "next-token");
});

test("allows only an authoritative first-page NoSuchBucket during destructive retry", () => {
  const missing = listR2Objects(
    { ...BASE, allowMissing: true },
    {
      run: () => ({
        ok: false,
        stdout: "",
        output: "An error occurred (NoSuchBucket): The specified bucket does not exist",
      }),
    },
  );
  assert.deepEqual(missing, {
    Missing: true,
    IsTruncated: false,
    KeyCount: 0,
    Contents: [],
  });
  assert.throws(
    () =>
      listR2Objects(
        { ...BASE, allowMissing: true },
        {
          run: () => ({
            ok: false,
            stdout: "",
            output: "An error occurred (AccessDenied): status code: 403",
          }),
        },
      ),
    /listing failed/,
  );
});

test("rejects unsafe or normalization-colliding keys before materialization", () => {
  for (const keys of [
    ["../escape"],
    ["/absolute"],
    ["safe\\windows-alias"],
    ["nested//empty"],
    ["line\nbreak"],
    ["nul\u0000byte"],
    ["cafe\u0301.txt", "caf\u00e9.txt"],
  ]) {
    assert.throws(
      () =>
        listR2Objects(BASE, {
          run: () => ({
            ok: true,
            stdout: JSON.stringify({
              IsTruncated: false,
              Contents: keys.map((Key) => ({ Key, Size: 1, ETag: '"etag"' })),
            }),
            output: "",
          }),
        }),
      /duplicate or invalid keys/,
    );
  }
});
