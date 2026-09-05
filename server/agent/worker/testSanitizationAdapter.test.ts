import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TestSanitizationAdapter } from "./testSanitizationAdapter";

const root = path.resolve(process.cwd(), ".forensic-x", "test-sanitization", "adapter-test");
const externalRoot = path.resolve(process.cwd(), ".forensic-x", "external-test-sanitization");
const previous = process.env.FORENSIC_X_ALLOW_TEST_SANITIZATION;

afterEach(async () => {
  if (previous === undefined) delete process.env.FORENSIC_X_ALLOW_TEST_SANITIZATION;
  else process.env.FORENSIC_X_ALLOW_TEST_SANITIZATION = previous;
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(externalRoot, { recursive: true, force: true });
});

describe("TestSanitizationAdapter safety boundary", () => {
  it("is opt-in", () => {
    delete process.env.FORENSIC_X_ALLOW_TEST_SANITIZATION;
    expect(() => new TestSanitizationAdapter(root)).toThrow(/disabled/);
  });

  it("only sanitizes files under its configured test root", async () => {
    process.env.FORENSIC_X_ALLOW_TEST_SANITIZATION = "1";
    const adapter = new TestSanitizationAdapter(root);
    const target = await adapter.prepareFixture("case-a", Buffer.from("test data"));
    const execution = await adapter.sanitize(target, "TEST_TRUNCATE");
    expect(execution).toMatchObject({ status: "SUCCEEDED" });
    await expect(adapter.verify(target, "TEST_TRUNCATE", execution)).resolves.toMatchObject({ status: "VERIFIED", details: { expectedState: "removed", actualState: "missing", before: { size: 9 }, after: { exists: false } } });
    await expect(fs.stat(target)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(adapter.sanitize(path.resolve(process.cwd(), "package.json"), "TEST_TRUNCATE")).rejects.toThrow(/outside test-sanitization/);
  });

  it("reports a structured failure when the authoritative fixture remains", async () => {
    process.env.FORENSIC_X_ALLOW_TEST_SANITIZATION = "1";
    const adapter = new TestSanitizationAdapter(root);
    const target = await adapter.prepareFixture("case-b", Buffer.from("test data"));
    await expect(adapter.verify(target, "TEST_TRUNCATE", { status: "SUCCEEDED", executionDetails: { before: { size: 9 } } })).resolves.toMatchObject({
      status: "FAILED",
      details: { status: "FAILED", targetReference: target, expectedState: "removed", actualState: "present", before: { size: 9 }, after: { size: 9 }, failureReason: "Target still exists after TEST_TRUNCATE" },
    });
  });

  it("rejects adapter roots and symlink targets outside the test fixture area", async () => {
    process.env.FORENSIC_X_ALLOW_TEST_SANITIZATION = "1";
    expect(() => new TestSanitizationAdapter(path.resolve(process.cwd(), "outside-test-sanitization"))).toThrow(/must remain within/);
    const adapter = new TestSanitizationAdapter(root);
    const outside = path.resolve(process.cwd(), "package.json");
    const link = path.join(root, "link.bin");
    await fs.mkdir(root, { recursive: true });
    await fs.symlink(outside, link);
    await expect(adapter.sanitize(link, "TEST_TRUNCATE")).resolves.toMatchObject({ status: "FAILED" });

    const linkedDirectory = path.join(root, "linked-directory");
    await fs.mkdir(externalRoot, { recursive: true });
    await fs.writeFile(path.join(externalRoot, "target.bin"), "outside");
    await fs.symlink(externalRoot, linkedDirectory, "junction");
    await expect(adapter.sanitize(path.join(linkedDirectory, "target.bin"), "TEST_TRUNCATE")).rejects.toThrow(/resolved outside test-sanitization/);
  });
});
