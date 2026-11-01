import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Imported first, so every module that reads process.env sees the values from server/.env.
// Everything the server reads or writes lives next to the server code, whichever folder it was started from.
export const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: path.join(SERVER_DIR, '.env') });
