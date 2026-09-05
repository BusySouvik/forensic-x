import { describe, expect, it } from "vitest";
import { createSafeCommandArgs, resolveEwfExecutable, SafeArgumentError } from "./commandRunner";
import { resolveWindowsDevicePath, validateDeviceIdentityRecord } from "./deviceAccess";

describe("resolveEwfExecutable", () => {
  it("rejects a missing configured executable", () => {
    expect(() => resolveEwfExecutable("C:/does/not/exist/ewfacquire.exe")).toThrow();
  });
});

describe("createSafeCommandArgs", () => {
  it("constructs a safe argument array for ewfacquire", () => {
    const args = createSafeCommandArgs({
      sourcePath: "\\\\.\\PhysicalDrive0",
      outputPrefix: "C:/tmp/forensic/job-123",
      imageFormat: "E01",
      caseName: "case-001",
      evidenceName: "evidence-001",
    });

    expect(args.includes("-d")).toBe(true);
    expect(args.includes("\\\\.\\PhysicalDrive0")).toBe(true);
    expect(args.includes("-f")).toBe(true);
  });

  it("rejects a user-supplied arbitrary executable path", () => {
    expect(() =>
      createSafeCommandArgs({
        sourcePath: "\\\\.\\PhysicalDrive0",
        outputPrefix: "C:/tmp/job",
        imageFormat: "E01",
        caseName: "case-001",
        evidenceName: "evidence-001",
        executable: "C:/temp/evil.exe",
      }),
    ).toThrow(SafeArgumentError);
  });
});

describe("validateDeviceIdentityRecord", () => {
  it("accepts a well-formed device identity record", () => {
    const record = {
      id: "11111111-1111-4111-8111-111111111111",
      deviceIdentifier: "\\\\.\\PhysicalDrive0",
      manufacturer: "Samsung",
      model: "SSD 980",
      serialNumber: "ABC123",
      capacity: "512 GB",
      connectionType: "SATA",
      deviceType: "SSD",
    } as const;

    expect(() => validateDeviceIdentityRecord(record)).not.toThrow();
  });

  it("rejects an invalid physical path for a real device acquisition", () => {
    expect(() =>
      resolveWindowsDevicePath({
        deviceIdentifier: "../../evil.exe",
        connectionType: "USB",
      }),
    ).toThrow();
  });
});
