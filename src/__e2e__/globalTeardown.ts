// Tear down the dedicated e2e postgres container started by globalSetup.
// Skip via DB_KEEP_E2E=1 to inspect state after a failure.

/* eslint-disable @typescript-eslint/no-require-imports */
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);
const CONTAINER = 'findly-postgres-e2e';

export default async function globalTeardown(): Promise<void> {
  if (process.env.DB_KEEP_E2E === '1') return;
  await execFileP('docker', ['rm', '-f', CONTAINER], { windowsHide: true }).catch(
    () => undefined,
  );
}
