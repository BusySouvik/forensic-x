import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { devices } from "../db/schema";
import { HttpError } from "../middleware/httpError";
import { getInvestigation } from "./investigations";
import type { ConnectionType, DeviceStatus, DeviceType } from "../../shared/types";

export async function listDevicesForInvestigation(investigationId: string) {
  await getInvestigation(investigationId);
  const db = getDb();
  return db
    .select()
    .from(devices)
    .where(eq(devices.investigationId, investigationId))
    .orderBy(desc(devices.createdAt));
}

export async function getDevice(id: string) {
  const db = getDb();
  const [row] = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
  if (!row) {
    throw new HttpError(404, "Device not found");
  }
  return row;
}

export async function createDevice(
  investigationId: string,
  input: {
    deviceIdentifier: string;
    deviceType: DeviceType;
    manufacturer?: string | null;
    model?: string | null;
    serialNumber?: string | null;
    capacity?: string | null;
    connectionType?: ConnectionType | null;
    status: DeviceStatus;
  },
) {
  await getInvestigation(investigationId);
  const db = getDb();
  try {
    const [created] = await db
      .insert(devices)
      .values({
        investigationId,
        deviceIdentifier: input.deviceIdentifier,
        deviceType: input.deviceType,
        manufacturer: input.manufacturer ?? null,
        model: input.model ?? null,
        serialNumber: input.serialNumber ?? null,
        capacity: input.capacity ?? null,
        connectionType: input.connectionType ?? null,
        status: input.status,
      })
      .returning();
    if (!created) {
      throw new HttpError(500, "Failed to create device");
    }
    return created;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      throw new HttpError(409, "Device identifier already exists for this investigation");
    }
    throw error;
  }
}

export async function assertDeviceInInvestigation(deviceId: string, investigationId: string) {
  const device = await getDevice(deviceId);
  if (device.investigationId !== investigationId) {
    throw new HttpError(400, "Device does not belong to this investigation");
  }
  return device;
}
