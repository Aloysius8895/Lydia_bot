import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {Store} from './store.ts';

export async function migrate(store:Store) {
  await store.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  const dir=new URL('./migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>/^\d+.*\.sql$/.test(f)).sort()) {
    const sql=await readFile(new URL(file,dir),'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
    await store.db.transaction(async tx=>{
      const old=(await tx.query<{checksum:string}>('SELECT checksum FROM schema_migrations WHERE version=$1',[file])).rows[0];
      if(old){if(old.checksum!==checksum)throw new Error(`Migration checksum mismatch: ${file}`);return;}
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[file,checksum]);
    });
  }
}
