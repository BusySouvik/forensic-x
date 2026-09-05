import { type NormalizedDevice } from "./deviceIdentity";
import { type DeviceEnumerator, type AcquisitionAdapter } from "./agentTypes";

export class AgentService {
  constructor(
    private readonly deviceEnumerator: DeviceEnumerator,
    private readonly acquisitionAdapter: AcquisitionAdapter,
  ) {}

  async enumerateDevices(request?: { investigationId?: string; deviceIds?: string[] }): Promise<NormalizedDevice[]> {
    return this.deviceEnumerator.enumerate(request);
  }

  async acquire(sourceIdentifier: string) {
    return this.acquisitionAdapter.acquire(sourceIdentifier);
  }
}
