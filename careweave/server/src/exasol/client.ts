import { ExasolDriver } from '@exasol/exasol-driver-ts';
import WebSocket from 'ws';
import type { ExasolConfig, ExasolConnectionStatus } from './types.js';

let activeDriver: ExasolDriver | null = null;
let lastSyncTimestamp: string | null = null;
let lastSyncedCount = 0;

export function getExasolConfig(): ExasolConfig {
  return {
    host: process.env.EXASOL_HOST || 'localhost',
    port: Number(process.env.EXASOL_PORT || 8563),
    user: process.env.EXASOL_USER || 'sys',
    password: process.env.EXASOL_PASSWORD || 'exasol',
    schema: process.env.EXASOL_SCHEMA || 'CAREWEAVE_ANALYTICS',
  };
}

export function isExasolConfigured(): boolean {
  return Boolean(process.env.EXASOL_HOST || process.env.EXASOL_PORT);
}

/**
 * Creates or retrieves a singleton Exasol driver instance.
 */
export function getExasolDriver(): ExasolDriver {
  if (activeDriver) return activeDriver;

  const cfg = getExasolConfig();
  const wsFactory = (url: string) =>
    new WebSocket(url, {
      rejectUnauthorized: false,
      handshakeTimeout: 5000,
    });

  activeDriver = new ExasolDriver(wsFactory as any, {
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    autocommit: true,
    clientName: 'CareWeave-Analytics-Engine',
    clientVersion: '1.0.0',
    onClose: () => {
      activeDriver = null;
    },
    onError: () => {
      activeDriver = null;
    },
  });

  return activeDriver;
}

let connectingDriver: ExasolDriver | null = null;

/**
 * The driver only talks to Exasol after connect(); do it once per driver instance.
 */
export async function getConnectedExasolDriver(): Promise<ExasolDriver> {
  const driver = getExasolDriver();
  if (connectingDriver !== driver) {
    await driver.connect();
    // The schema is created by initializeExasolSchema() on first sync, so opening it may fail before then.
    await driver.execute(`OPEN SCHEMA ${getExasolConfig().schema}`).catch(() => undefined);
    connectingDriver = driver;
  }
  return driver;
}

/**
 * Tests whether Exasol Personal is reachable and authenticates cleanly.
 */
export async function pingExasol(): Promise<boolean> {
  try {
    const driver = await Promise.race([
      getConnectedExasolDriver(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Exasol connection timed out (3000ms)')), 3000)
      ),
    ]);
    const result = await Promise.race([
      driver.query('SELECT 1 AS HEALTH_CHECK;'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Exasol connection timed out (3000ms)')), 3000)
      ),
    ]);
    return Boolean(result);
  } catch (err: any) {
    activeDriver = null;
    return false;
  }
}

/**
 * Executes a SQL query against Exasol with safe error handling and timeout.
 */
export async function queryExasol<T = any>(sql: string): Promise<T[]> {
  try {
    const driver = await getConnectedExasolDriver();
    // DDL and DML (CREATE, MERGE, OPEN SCHEMA...) return no result set, so the driver wants execute() for them.
    if (!/^\s*(select|with)\b/i.test(sql)) {
      await Promise.race([
        driver.execute(sql),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Exasol statement timed out (8000ms)')), 8000)
        ),
      ]);
      return [];
    }
    const res = await Promise.race([
      driver.query(sql),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Exasol query timed out (8000ms)')), 8000)
      ),
    ]);

    // Format driver query results into standard JSON objects
    if (!res || !res.columns || !res.rows) return [];
    const colNames = res.columns.map((c: any) => c.name.toLowerCase());
    return res.rows.map((row: any[]) => {
      const obj: any = {};
      colNames.forEach((name: string, i: number) => {
        obj[name] = row[i];
      });
      return obj as T;
    });
  } catch (err: any) {
    console.warn(`[Exasol Query Error]: ${err?.message || err}`);
    throw err;
  }
}

/**
 * Reports current connection state and active analytics engine.
 */
export async function getAnalyticsEngineStatus(): Promise<ExasolConnectionStatus> {
  const cfg = getExasolConfig();
  const isAlive = await pingExasol();

  if (isAlive) {
    return {
      connected: true,
      engine: 'Exasol In-Memory Columnar (Live)',
      host: cfg.host,
      port: cfg.port,
      schema: cfg.schema,
      lastSyncAt: lastSyncTimestamp || new Date().toISOString(),
      totalRecordsSynced: lastSyncedCount,
      message: 'Exasol Personal high-performance in-memory analytics engine active',
    };
  }

  return {
    connected: false,
    engine: 'MongoDB Analytics Pipeline (Fallback)',
    host: cfg.host,
    port: cfg.port,
    schema: cfg.schema,
    lastSyncAt: lastSyncTimestamp || undefined,
    totalRecordsSynced: lastSyncedCount,
    message:
      'Exasol daemon not detected on port 8563. Running with MongoDB OLTP analytics fallback. Start local Exasol to activate in-memory columnar queries.',
  };
}

export function updateSyncTelemetry(count: number) {
  lastSyncTimestamp = new Date().toISOString();
  lastSyncedCount = count;
}

