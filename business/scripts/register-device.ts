import path from 'node:path';
import { runtimeRoot } from '../shared/config.ts';
import { registerDevice } from '../executor/register.ts';

const relayUrl = process.env.LYDIA_RELAY_URL?.trim() || '';
const bootstrapToken = process.env.LYDIA_RELAY_BOOTSTRAP_TOKEN?.trim() || '';
const password = process.env.LYDIA_OWNER_PASSWORD?.trim() || '';
if (!relayUrl || !bootstrapToken || !password) {
  console.error('需要 LYDIA_RELAY_URL、LYDIA_RELAY_BOOTSTRAP_TOKEN 和 LYDIA_OWNER_PASSWORD。未写入凭据。');
  process.exitCode = 1;
} else {
  await registerDevice({ relayUrl, bootstrapToken, password, directory: path.join(runtimeRoot, '.') }).catch(error => {
    console.error(error instanceof Error ? error.message : 'REGISTRATION_FAILED');
    process.exitCode = 1;
  });
}
