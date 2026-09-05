import postgres from 'postgres';
import { config } from 'dotenv';
config();
const sql = postgres(process.env.DATABASE_URL);
(async () => {
  try {
    const rows = await sql`select * from drizzle.__drizzle_migrations order by id`;
    console.log(rows);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await sql.end();
  }
})();
