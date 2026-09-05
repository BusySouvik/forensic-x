import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { devices } from "../db/schema";
import type { DeviceEnumerationRequest, DeviceEnumerator } from "./agentTypes";
import type { NormalizedDevice } from "./deviceIdentity";

export class SafeWindowsDeviceEnumerator implements DeviceEnumerator {
  async enumerate(request: DeviceEnumerationRequest = {}): Promise<NormalizedDevice[]> {
    const db = getDb();
    const rows = await db.select().from(devices);
    const filtered = rows.filter((row) => {
      if (request.investigationId && row.investigationId !== request.investigationId) {
        return false;
      }
      if (request.deviceIds && request.deviceIds.length > 0 && !request.deviceIds.includes(row.id)) {
        return false;
      }
      return true;
    });

    return filtered.map((row) => ({
      id: row.id,
      manufacturer: row.manufacturer ?? null,
      model: row.model ?? null,
      serialNumber: row.serialNumber ?? null,
      capacity: row.capacity ?? null,
      interface: row.connectionType ?? null,
      mediaType: row.deviceType ?? null,
      systemPath: null,
      detectedAt: row.createdAt.toISOString(),
      unsupportedFields: ["systemPath", "physicalEnumeration"],
    }));
  }
}

export async function enumerateSafeDevices(request?: DeviceEnumerationRequest): Promise<NormalizedDevice[]> {
  const enumerator = new SafeWindowsDeviceEnumerator();
  return enumerator.enumerate(request);
}
