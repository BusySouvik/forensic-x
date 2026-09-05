import type { DeviceType, ConnectionType } from "../../../shared/types";

export type DeviceIdentityRecord = {
  id: string;
  deviceIdentifier: string;
  deviceType?: DeviceType | null;
  connectionType?: ConnectionType | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  capacity?: string | null;
};

export type LiveWindowsDeviceRecord = {
  physicalDrive: string;
  deviceIdentifier: string;
  model: string | null;
  serialNumber: string | null;
  capacity: string | null;
  deviceType?: DeviceType | null;
  connectionType?: ConnectionType | null;
};

export interface WindowsDeviceInspector {
  inspect(deviceIdentifier: string): Promise<LiveWindowsDeviceRecord>;
}

const WINDOWS_DEVICE_PATH_RE = /^\\\\.\\PhysicalDrive\d+$/i;

export function resolveWindowsDevicePath(input: { deviceIdentifier: string; connectionType?: ConnectionType | null }): string {
  const raw = (input.deviceIdentifier ?? "").trim();
  if (!raw) {
    throw new Error("Device identifier is required for physical acquisition");
  }

  if (WINDOWS_DEVICE_PATH_RE.test(raw)) {
    return raw;
  }

  if (/^PhysicalDrive\d+$/i.test(raw)) {
    return `\\.\\${raw}`;
  }

  if (/^\\\\\?\\PhysicalDrive\d+$/i.test(raw)) {
    return raw.replace(/^\\\\\?\\/, "\\\\.\\");
  }

  throw new Error(`Unsupported physical device path: ${raw}`);
}

export function validateDeviceIdentityRecord(record: DeviceIdentityRecord) {
  if (!record.id) {
    throw new Error("Device identity is missing the ID");
  }
  if (!record.deviceIdentifier) {
    throw new Error("Device identity is missing the physical device identifier");
  }

  const resolvedPath = resolveWindowsDevicePath({
    deviceIdentifier: record.deviceIdentifier,
    connectionType: record.connectionType,
  });

  if (record.connectionType && !["SATA", "USB", "NVME", "NETWORK", "OTHER"].includes(record.connectionType)) {
    throw new Error(`Unsupported device connection type: ${record.connectionType}`);
  }

  return {
    ...record,
    resolvedPhysicalPath: resolvedPath,
  };
}

export function validateLiveDeviceIdentity(record: DeviceIdentityRecord, live: Partial<LiveWindowsDeviceRecord>) {
  if (!live || !live.physicalDrive) {
    throw new Error("The live Windows device cannot be resolved");
  }

  const normalizedLive = resolveWindowsDevicePath({ deviceIdentifier: live.physicalDrive });
  const normalizedRecord = resolveWindowsDevicePath({ deviceIdentifier: record.deviceIdentifier });

  if (normalizedLive.toLowerCase() !== normalizedRecord.toLowerCase()) {
    throw new Error(`Live device identity mismatch: ${normalizedLive} !== ${normalizedRecord}`);
  }

  if (live.model && record.model && live.model.trim() !== record.model.trim()) {
    throw new Error(`Live model mismatch for ${record.id}: ${live.model} !== ${record.model}`);
  }

  if (live.serialNumber && record.serialNumber && live.serialNumber.trim() !== record.serialNumber.trim()) {
    throw new Error(`Live serial mismatch for ${record.id}: ${live.serialNumber} !== ${record.serialNumber}`);
  }

  if (live.capacity && record.capacity && live.capacity.trim() !== record.capacity.trim()) {
    throw new Error(`Live capacity mismatch for ${record.id}: ${live.capacity} !== ${record.capacity}`);
  }

  return {
    physicalDrive: normalizedLive,
    deviceIdentifier: live.deviceIdentifier ?? normalizedLive,
    model: live.model ?? record.model ?? null,
    serialNumber: live.serialNumber ?? record.serialNumber ?? null,
    capacity: live.capacity ?? record.capacity ?? null,
    deviceType: record.deviceType ?? live.deviceType ?? null,
    connectionType: record.connectionType ?? live.connectionType ?? null,
  } satisfies LiveWindowsDeviceRecord;
}

export function createWindowsDeviceInspector(): WindowsDeviceInspector {
  return {
    async inspect(deviceIdentifier: string): Promise<LiveWindowsDeviceRecord> {
      if (process.platform !== "win32") {
        throw new Error("Windows live device inspection is only available on Windows");
      }

      const physicalDrive = resolveWindowsDevicePath({ deviceIdentifier });
      const match = physicalDrive.match(/PhysicalDrive(\d+)/i);
      if (!match) {
        throw new Error(`Unsupported physical device path: ${physicalDrive}`);
      }

      const index = match[1];
      const powerShellCommand = [
        "Get-CimInstance -ClassName Win32_DiskDrive |",
        `Where-Object { $_.Index -eq ${index} } |`,
        "Select-Object -Property Index,Model,SerialNumber,Size,InterfaceType |",
        "ConvertTo-Json -Compress",
      ].join(" ");

      const { spawn } = await import("node:child_process");
      return await new Promise((resolve, reject) => {
        const child = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", powerShellCommand], {
          shell: false,
          windowsHide: true,
        });

        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (chunk) => {
          stdout += String(chunk);
        });
        child.stderr?.on("data", (chunk) => {
          stderr += String(chunk);
        });
        child.on("error", (error) => reject(error));
        child.on("close", (code) => {
          if (code !== 0) {
            reject(new Error(`Windows disk inspection failed: ${stderr || stdout || "Unknown error"}`));
            return;
          }

          try {
            const parsed = stdout.trim();
            if (!parsed) {
              throw new Error(`No live metadata found for ${physicalDrive}`);
            }
            const data = JSON.parse(parsed);
            resolve({
              physicalDrive,
              deviceIdentifier: physicalDrive,
              model: typeof data.Model === "string" ? data.Model : null,
              serialNumber: typeof data.SerialNumber === "string" ? data.SerialNumber : null,
              capacity: typeof data.Size === "number" ? `${data.Size}` : null,
              deviceType: null,
              connectionType: typeof data.InterfaceType === "string" ? (data.InterfaceType as ConnectionType) : null,
            });
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      });
    },
  };
}

export function deviceIdentityMatches(record: DeviceIdentityRecord, expected: Partial<DeviceIdentityRecord>) {
  if (expected.serialNumber && record.serialNumber && expected.serialNumber !== record.serialNumber) {
    return false;
  }
  if (expected.model && record.model && expected.model !== record.model) {
    return false;
  }
  if (expected.capacity && record.capacity && expected.capacity !== record.capacity) {
    return false;
  }
  if (expected.deviceIdentifier && record.deviceIdentifier && expected.deviceIdentifier !== record.deviceIdentifier) {
    return false;
  }
  return true;
}
