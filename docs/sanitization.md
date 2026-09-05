# Sanitization (Phase 5A)

Deletion removes a reference; sanitization attempts erasure; physical destruction is a separate process. Jobs require an approved `SANITIZATION` authorization and use server-side target resolution. Master forensic evidence is always protected.

The successful lifecycle is:

`AUTHORIZED` → `QUEUED` → `SANITIZING` → `VERIFYING` → `CERTIFICATE_READY` → `COMPLETED`

`VERIFYING` begins only after sanitization execution succeeds. The worker performs independent post-sanitization verification and persists its structured result. Certificate generation occurs only after that verification succeeds. Certificate generation and the transition to `CERTIFICATE_READY` are transactional; final completion requires the persisted certificate reference.

Failure states are `SANITIZATION_FAILED`, `VERIFICATION_FAILED`, `CERTIFICATE_FAILED`, `UNSUPPORTED_METHOD`, and `TARGET_MISMATCH`. A failed verification creates no certificate and can never complete. A certificate failure preserves the successful sanitization and verification results, records its reason, and prevents false completion.

The only executable adapter is opt-in `TEST_TRUNCATE`, confined to `.forensic-x/test-sanitization`. It is not a physical-device sanitizer. DEVICE, EVIDENCE, and DATABASE_RECORD requests are validated against case records, but physical/device and database-record erasure remain disabled. HDD overwrite and SSD secure erase are not enabled.

The certificate records authoritative job metadata, structured verification details, the integrity hash, and signing metadata. A certificate does not itself prove physical unrecoverability. The current HMAC signing mechanism is development-only and is not a production digital signature; production deployment requires appropriate asymmetric signing and managed keys (for example, a KMS/HSM-backed PKI).
