# Foreensic-X working copies

## Why the master is immutable

The master forensic image is the protected, verified artifact created once from a physical source. It represents the canonical evidence record for a seized device or source and must not be modified in place. Investigators work on copies rather than the original protected master because the master is the forensic trace of the device at acquisition time.

## Master → working-copy provenance

Physical Source
      ↓
Forensic Agent (privileged acquisition worker)
      ↓
Verified Master E01
      ↓
Protected MinIO Object
      ↓
Authorized Working Copy
      ↓
Investigator Analysis / Recovery Workspace

The working copy is derived from the master, not re-created from the physical source. This preserves the forensic chain of custody and avoids reacquisition.

## Storage architecture

- Master images are stored in the forensic-images bucket.
- Working copies are stored in the working-copies bucket.
- PostgreSQL keeps metadata such as the master evidence ID, source hashes, working-copy hash, owner, authorization ID, status, and timestamps.
- MinIO stores the binary object itself.
- The backend generates the object key and does not accept arbitrary client-provided bucket or key values.

## Authorization model

Working copy creation requires:

- authenticated investigator or admin
- valid investigation
- valid master evidence record
- approved authorization for the investigation
- ownership or admin permission for the resulting working copy

The backend enforces authorization instead of trusting frontend state.

## Hashing and verification

The working-copy service verifies the master before copying:

1. Retrieve master metadata from the evidence record.
2. Confirm the storage object still exists.
3. Compare the recorded master SHA-256 with the stored object metadata.
4. Copy the bytes to a new working-copy object.
5. Calculate the working-copy SHA-256 from the actual bytes.
6. Persist both hashes in metadata.

This ensures that the working copy is a real derivative and not a placeholder or metadata-only object.

## Failure handling

A failed working-copy operation does not alter the master object or its metadata. The service records the failure reason, preserves the provenance trail, and leaves the master protected. If a destination object was created during a failed workflow, the cleanup path attempts to remove it without touching the master.

## No reacquisition rule

Working copies are never created by re-running acquisition on the physical source. If a master exists, the system reuses it to create a copy. This is the key guarantee for forensic safety in FORENSIC-X.

## Working-copy lifecycle

The persisted working-copy states are:

- QUEUED
- CREATING
- VERIFYING
- COMPLETED
- FAILED

The master continues to be protected while investigators use their working copy for analysis.
