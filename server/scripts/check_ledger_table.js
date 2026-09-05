import postgres from 'postgres';
import { config } from 'dotenv';
config();
const sql = postgres(process.env.DATABASE_URL);
(async () => {
  try {
    const r = await sql`select to_regclass('public.ledger_events') as reg`;
    console.log(r);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await sql.end();
  }
})();
