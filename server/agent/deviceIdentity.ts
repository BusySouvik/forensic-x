export type DeviceInterface = "SATA" | "USB" | "NVME" | "NETWORK" | "OTHER" | null;
export type MediaType = "HDD" | "SSD" | "NVME" | "USB" | "MOBILE" | "OPTICAL" | "OTHER" | null;

export type NormalizedDevice = {
  id: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  capacity: string | null;
  interface: DeviceInterface;
  mediaType: MediaType;
  systemPath: string | null;
  detectedAt: string;
  unsupportedFields: string[];
};
