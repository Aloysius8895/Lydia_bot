import path from 'node:path';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const workspaceRoot=fileURLToPath(new URL('../../',import.meta.url));
export const dataRoot=path.join(workspaceRoot,'data');
export const dataPreprocessingRoot=path.join(dataRoot,'data_preprocessing');
export const dataStorageRoot=path.join(dataRoot,'data_storage');
export const defaultDatabaseDir=path.join(dataStorageRoot,'database');
export const backupRoot=path.join(dataStorageRoot,'backups','database');
export const importReportsRoot=path.join(dataStorageRoot,'reports','imports');
export const relocationReportsRoot=path.join(dataStorageRoot,'reports','relocations');
export const retentionReportsRoot=path.join(dataStorageRoot,'reports','retention');
export const caseExportsRoot=path.join(dataStorageRoot,'research','exports');
export const crawlDataRoot=path.join(dataStorageRoot,'crawl');
export const dataLibraryRoot=path.join(dataStorageRoot,'library');
export const rawImportsRoot=path.join(dataStorageRoot,'raw_imports');
export const legacyDatabaseDir=path.join(workspaceRoot,'business','.runtime','data');

export function assertNoLegacyDatabase(legacy=legacyDatabaseDir){
 if(existsSync(legacy))throw new Error('发现旧数据库目录 business/.runtime/data；请先完成数据迁移，禁止自动创建或启用另一份数据库。');
}

export function assertDataStoragePath(value:string){
 const rel=path.relative(path.resolve(dataStorageRoot),path.resolve(value));
 if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw new Error('实际资料必须存放在根 data/data_storage 的职责子目录中；请修正旧环境路径，禁止在 business 中创建新数据库。');
}
