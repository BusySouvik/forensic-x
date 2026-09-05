# Recovery architecture

This project follows a strict control-plane / execution-plane split for forensic recovery:

- The REST API and job service create and track recovery jobs.
- A worker process claims queued recovery jobs and runs the engine adapter.
- Recovery operates only on a derived working copy, never on the protected master image.
- Candidate artifacts are treated as provisional results. They are not validated evidence and must not be represented as certified outputs.

## Lifecycle

1. A master forensic image is acquired once and stored with a protected deletion policy.
2. An investigator requests a working copy from the master evidence.
3. The working copy is created and verified against the master hash.
4. Recovery jobs reference the working copy, not the master evidence.
5. The recovery worker resolves the working copy object, stages a temporary recovery area, and executes a recovery engine.
6. Candidate artifacts are collected under the staging area and returned as job output metadata.

## Worker contract

The worker resolves queued jobs in the order they were created and moves them through the canonical status flow:

- QUEUED
- VALIDATING
- RECOVERING
- COLLECTING
- COMPLETED
- FAILED | CANCELLED

The execution engine is intentionally isolated from the API layer. The worker must not mutate the original master image or create a new copy of the master binary. It reads the working-copy object in a read-only manner and writes only to a controlled staging directory.

### Meaning of each state

- VALIDATING: pre-recovery input validation only. This checks that the working copy exists and is usable, the working copy object exists, the investigation relationship is correct, the authorization is valid and approved, the recovery input resolves from workingCopyId, and the master image is not being used as the recovery input.
- RECOVERING: the selected engine is actively processing the working-copy input.
- COLLECTING: recovery generated output and the worker is collecting candidate artifacts and metadata from the controlled staging area.
- COMPLETED: recovery and candidate collection succeeded. The results remain candidate artifacts pending validation and are not authoritative evidence.

The worker does not validate recovered artifacts during this phase. Actual validation is a separate future phase.

## Engine adapters

The current adapter foundation includes:

- TSK adapter: resolves the configured `FORENSIC_TSK_EXECUTABLE` or the `fls` binary.
- Foremost adapter: resolves the configured `FORENSIC_FOREMOST_EXECUTABLE` or the `foremost` binary.

The recovery worker selects the adapter from the persisted job engine: `TSK` selects the TSK adapter and `FOREMOST` selects the Foremost adapter. Other persisted engine values are rejected by the worker and the job is marked `FAILED`.

If the executable is missing or not executable, the adapter fails deterministically with a 503-style error and the recovery job is marked as FAILED. This keeps the system honest in a workstation where the actual forensic binaries are not installed.

## Safe execution rules

- Reject unsafe source paths containing shell metacharacters.
- Use a fixed executable and argument array via the command runner.
- keep staging under a controlled root inside the application runtime.
- Never allow client-supplied executable or object storage paths in the config.
- Only accept a minimal allowlist of recovery config keys.

## Candidate output rules

Recovered files produced by the worker are candidate artifacts only. They are useful for triage and review, but they are not evidence until later validation and release workflows are implemented. The system must preserve the separation between recovery and certification.

## Engine invocation details (integration testing)

TSK (Windows native):

- Expected installed binaries: `fls`, `icat`, `fsstat`, `istat`, `mmls` (TSK toolset). On Windows the worker resolves the configured `FORENSIC_TSK_EXECUTABLE` environment variable or falls back to `fls`/`icat` names found on `PATH`.
- Worker flow: `fls -r -f raw <staged-image>` is executed to enumerate files and directories; the listing is recorded under the job staging area as `fls-listing.txt`. If `icat` is available, the worker will attempt bounded extraction of a limited number of inodes (bounded by `config.maxFiles`) by executing `icat -f raw <staged-image> <inode>` and writing the extracted bytes as candidate artifacts.
- Evidence recorded in job output: executable used, args, start/finish timestamps, exit codes, stdout/stderr snippets, staged input path, output staging path, and provisional hashes of listed/extracted files. These are candidate metadata only.

Foremost (WSL Ubuntu):

- Foremost is expected to be installed inside WSL2 Ubuntu and invoked using `wsl.exe --distribution Ubuntu --exec foremost`. The worker will not accept arbitrary Foremost executable paths; instead it uses a fixed safe invocation model to run Foremost inside WSL and translate Windows staging paths into WSL `/mnt/<drive>/...` paths so that Foremost writes its carved output to the same Windows staging directory.
- Worker flow: the worker stages the working-copy to a controlled Windows temp directory, converts the paths to WSL form, and executes the WSL Foremost invocation with `-i <wsl-staged-input> -o <wsl-output-dir>`. Job output includes the same execution provenance metadata as TSK.

Foremost input compatibility: the adapter receives the exact staged working-copy bytes; it does not convert E01/EWF to RAW. Foremost is a byte-carver and the current invocation has no EWF-container support. A RAW working copy is the supported integration input. An E01 working copy remains an integration blocker until an explicitly designed, validated E01-to-RAW staging workflow is added.

Safety and limitations:

- The worker never executes recovery against the protected master image — only the staged working copy is used.
- The worker uses `child_process.spawn` with `shell: false` and fixed argument arrays; no shell interpolation is performed.
- The worker will fail the job deterministically if the configured engine or WSL is not available.
- These integration steps must be run against a disposable forensic fixture image (E01 or RAW). Do NOT run against any production or host physical disk paths.

How to run a safe integration test locally (manual):

1. Place a disposable forensic image in a safe folder, e.g. `C:\forensic-fixtures\sample.E01`.
2. Ensure `fls.exe`, `icat.exe` (TSK) are installed and in `PATH`, and Foremost is installed under WSL Ubuntu.
3. Start the worker in a safe test mode: `node server/agent/worker/recoveryWorker.ts` or use the workspace `worker:acquisition` script with environment variables set to point at test binaries.
4. Create a recovery job via the API referencing a working copy that resolves to the staged image object (do not point to raw host devices).
5. Monitor the worker logs and the staging directory under the application temp area (`.forensic-x/recovery-*`) for `fls-listing.txt` and carved output.

Do not treat candidate SHA-256 values produced here as authoritative evidence hashes; definitive evidence hashing and validation happen in a later phase.
