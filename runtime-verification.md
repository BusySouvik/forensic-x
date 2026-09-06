# Runtime verification

- Local Vite preview opened successfully at `http://localhost:3001/`.
- Secure access gateway rendered with separate Administrator and Investigator access points.
- Administrator access opened a role-specific email/password form.
- The form uses the backend-compatible login shape (`email`, `password`) and submits to the API client’s `POST /api/auth/login` path.
- No real credentials were available in this environment, so no successful authenticated session was fabricated.
The deliberately invalid login submission did not create a local/demo session. Browser console inspection showed only the normal React DevTools informational message and no runtime exception. The backend API was not running behind the Vite-only preview, so a real 401 response could not be observed in this preview process.
Final verification: the backend was started on `localhost:3001`, and the Vite frontend was restarted on `localhost:3000`. `GET http://localhost:3000/api/health` returned backend JSON with HTTP 200 through the Vite proxy. The Admin login form on localhost:3000 now renders with empty required username/password fields; no demo credentials or local authenticated session are created.

The attempted real login could not complete successfully because the backend database connection was refused on localhost:3306. The backend returned HTTP 500 while querying the users table, and `/api/auth/me` remained HTTP 401. This is an environment/database availability issue, not a frontend fallback.
