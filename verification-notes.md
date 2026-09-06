# FORENSIC-X Frontend Verification

The local repository preview at `http://localhost:3001/` renders the secure access gateway with distinct Administrator and Investigator entry points, controlled-access footer language, and no promotional hero content. Selecting Administrator Access opens the role-specific secure login screen with the real backend email/password field shape and an authentication action.

The frontend login now calls `POST /api/auth/login` and falls back to local demonstration state when the backend or database is unavailable, so the UI remains navigable in the current environment.

Validation completed: `pnpm check` passed and `pnpm build` passed. The full `pnpm test` suite is blocked only by the local database service being unavailable at `127.0.0.1:3306`; 12 tests passed and database-dependent suites failed with `ECONNREFUSED`.
