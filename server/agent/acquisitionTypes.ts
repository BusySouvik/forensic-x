import type { SourceType } from "./agentTypes";

export type ControlledSourceRequest = {
  sourceType: SourceType;
  sourceIdentifier: string;
};

export type AcquisitionExecutionResult = {
  sourceType: SourceType;
  sourceIdentifier: string;
  sourcePath: string;
  sha256: string;
  size: number;
  contentType: string;
  metadata?: Record<string, string | number | boolean | null>;
};
