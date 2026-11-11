import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {workspaceRoot,dataRoot,dataPreprocessingRoot,dataStorageRoot,defaultDatabaseDir,backupRoot,importReportsRoot,caseExportsRoot,crawlDataRoot,assertNoLegacyDatabase,assertDataStoragePath} from '../shared/data-paths.ts';

test('all authoritative data defaults stay within root data, independent of process cwd',()=>{
 assert.equal(dataRoot,path.join(workspaceRoot,'data'));
 assert.equal(dataPreprocessingRoot,path.join(dataRoot,'data_preprocessing'));
 assert.equal(dataStorageRoot,path.join(dataRoot,'data_storage'));
 assert.equal(defaultDatabaseDir,path.join(dataStorageRoot,'database'));
 assert.equal(backupRoot,path.join(dataStorageRoot,'backups','database'));
 assert.equal(importReportsRoot,path.join(dataStorageRoot,'reports','imports'));
 assert.equal(caseExportsRoot,path.join(dataStorageRoot,'research','exports'));
 assert.equal(crawlDataRoot,path.join(dataStorageRoot,'crawl'));
 for(const dir of [defaultDatabaseDir,backupRoot,importReportsRoot,caseExportsRoot])assert.ok(dir.startsWith(dataRoot+path.sep));
 for(const dir of [defaultDatabaseDir,backupRoot,crawlDataRoot])assert.doesNotThrow(()=>assertDataStoragePath(dir));
 for(const dir of [path.join(workspaceRoot,'business/.runtime/data'),dataStorageRoot,path.join(dataStorageRoot,'../escape')])assert.throws(()=>assertDataStoragePath(dir));
});
test('a leftover legacy DB prevents silent creation of a parallel database',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'lydia-legacy-db-'));
 assert.throws(()=>assertNoLegacyDatabase(dir),/旧数据库|另一份数据库/);
 assert.doesNotThrow(()=>assertNoLegacyDatabase(path.join(dir,'absent')));
});
