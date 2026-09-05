import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL);
(async()=>{
  try{
    console.log('\n-- pg_indexes');
    console.dir(await sql`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='ledger_events'`, {depth:null});

    console.log('\n-- pg_index defs');
    console.dir(await sql`SELECT i.relname as indexname, ix.indisunique, pg_get_indexdef(ix.indexrelid) as def FROM pg_index ix JOIN pg_class t ON t.oid=ix.indrelid JOIN pg_class i ON i.oid=ix.indexrelid WHERE t.relname='ledger_events'`, {depth:null});

    console.log('\n-- constraints');
    console.dir(await sql`SELECT conname, contype, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'ledger_events'::regclass`, {depth:null});

    console.log('\n-- duplicate acquisition_job_id groups');
    console.dir(await sql`SELECT acquisition_job_id, count(*) FROM ledger_events GROUP BY acquisition_job_id HAVING count(*)>1`, {depth:null});

    console.log('\n-- rows for job bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb');
    console.dir(await sql`SELECT id, acquisition_job_id, event_hash, created_at FROM ledger_events WHERE acquisition_job_id = ${'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'}`, {depth:null});

    console.log('\n-- rows for job deadbeef-bbbb-4222-8222-deadbeef0002');
    console.dir(await sql`SELECT id, acquisition_job_id, event_hash, created_at FROM ledger_events WHERE acquisition_job_id = ${'deadbeef-bbbb-4222-8222-deadbeef0002'}`, {depth:null});

  }catch(e){console.error(e);}finally{await sql.end();}
})();
