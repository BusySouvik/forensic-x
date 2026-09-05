import type { AcquisitionAdapter, DeviceEnumerationRequest } from "./agentTypes";
import type { NormalizedDevice } from "./deviceIdentity";

export class AcquisitionManager {
  constructor(private readonly adapter: AcquisitionAdapter) {}

  async acquire(sourceIdentifier: string) {
    return this.adapter.acquire(sourceIdentifier);
  }

  async listNormalizedDevices(enumerator: { enumerate: (request?: DeviceEnumerationRequest) => Promise<NormalizedDevice[]> }, request?: DeviceEnumerationRequest) {
    return enumerator.enumerate(request);
  }
}
