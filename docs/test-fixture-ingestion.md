# Test-fixture master ingestion

The pnpm fixture:ingest command is a development/test-only CLI for a disposable RAW fixture. It is not an HTTP endpoint and does not invoke a forensic acquisition executable.

It requires NODE_ENV=development or NODE_ENV=test and FORENSIC_X_ENABLE_TEST_FIXTURE_INGESTION=true. It accepts only an absolute local regular file with .raw, .img, or .dd extension; physical-drive, raw-device, UNC/network, missing, directory, and relative paths are rejected.

The CLI reads ordinary file bytes, hashes them, stores them through EvidenceStorageService as a protected FORENSIC_IMAGE, and writes a completed TEST_FILE acquisition record, AVAILABLE master evidence record, and TEST_FIXTURE audit record. The acquisition source identifier and audit details contain TEST_FIXTURE; no physical provenance is claimed.

Run it only after creating an approved ACQUISITION authorization for the named actor and investigation:

    $env:FORENSIC_X_ENABLE_TEST_FIXTURE_INGESTION = 'true'
    pnpm fixture:ingest -- --fixture 'C:\forensic-fixtures\disposable.raw' --investigation-id '<investigation-uuid>' --actor-id '<user-uuid>' --authorization-id '<approved-acquisition-authorization-uuid>'

The JSON output includes investigationId, masterEvidenceId, acquisitionJobId, the protected storage object, and SHA-256. Use masterEvidenceId unchanged with the existing working-copy API; recovery still requires a separate approved RECOVERY authorization.
