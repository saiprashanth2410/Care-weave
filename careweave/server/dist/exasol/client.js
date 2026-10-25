import { ExasolDriver } from '@exasol/exasol-driver-ts';
import WebSocket from 'ws';
let activeDriver = null;
let lastSyncTimestamp = null;
let lastSyncedCount = 0;
export function getExasolConfig() {
    return {
        host: process.env.EXASOL_HOST || 'localhost',
        port: Number(process.env.EXASOL_PORT || 8563),
        user: process.env.EXASOL_USER || 'sys',
        password: process.env.EXASOL_PASSWORD || 'exasol',
        schema: process.env.EXASOL_SCHEMA || 'CAREWEAVE_ANALYTICS',
    };
}
export function isExasolConfigured() {
    return Boolean(process.env.EXASOL_HOST || process.env.EXASOL_PORT);
}
/**
 * Creates or retrieves a singleton Exasol driver instance.
 */
export function getExasolDriver() {
    if (activeDriver)
        return activeDriver;
    const cfg = getExasolConfig();
    const wsFactory = (url) => new WebSocket(url, {
        rejectUnauthorized: false,
        handshakeTimeout: 5000,
    });
    activeDriver = new ExasolDriver(wsFactory, {
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
let connectingDriver = null;
/**
 * The driver only talks to Exasol after connect(); do it once per driver instance.
 */
export async function getConnectedExasolDriver() {
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
export async function pingExasol() {
    try {
        const driver = await Promise.race([
            getConnectedExasolDriver(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Exasol connection timed out (3000ms)')), 3000)),
        ]);
        const result = await Promise.race([
            driver.query('SELECT 1 AS HEALTH_CHECK;'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Exasol connection timed out (3000ms)')), 3000)),
        ]);
        return Boolean(result);
    }
    catch (err) {
        activeDriver = null;
        return false;
    }
}
/**
 * Executes a SQL query against Exasol with safe error handling and timeout.
 */
export async function queryExasol(sql, timeoutMs = 8000) {
    try {
        const driver = await getConnectedExasolDriver();
        // DDL and DML (CREATE, MERGE, OPEN SCHEMA...) return no result set, so the driver wants execute() for them.
        if (!/^\s*(select|with)\b/i.test(sql)) {
            await Promise.race([
                driver.execute(sql),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`Exasol statement timed out (${timeoutMs}ms)`)), timeoutMs)),
            ]);
            return [];
        }
        const res = await Promise.race([
            driver.query(sql),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Exasol query timed out (${timeoutMs}ms)`)), timeoutMs)),
        ]);
        // The driver returns a QueryResult object; its rows are keyed by column name. Keys are lower-cased for the mappers.
        const rows = res?.getRows?.() ?? [];
        return rows.map((row) => {
            const obj = {};
            for (const [k, v] of Object.entries(row))
                obj[k.toLowerCase()] = v;
            return obj;
        });
    }
    catch (err) {
        console.warn(`[Exasol Query Error]: ${err?.message || err}`);
        throw err;
    }
}
/**
 * Reports current connection state and active analytics engine.
 */
export async function getAnalyticsEngineStatus() {
    const cfg = getExasolConfig();
    const isAlive = await pingExasol();
    if (isAlive) {
        let rowCounts;
        try {
            const r = (await queryExasol(`SELECT (SELECT COUNT(*) FROM ${cfg.schema}.FACT_PATIENT_VISITS) AS "visits", (SELECT COUNT(*) FROM ${cfg.schema}.FACT_LAB_ORDERS_TAT) AS "labOrders", (SELECT COUNT(*) FROM ${cfg.schema}.FACT_PHARMACY_PRESCRIPTIONS) AS "prescriptions" FROM DUAL`))[0];
            rowCounts = { visits: Number(r.visits), labOrders: Number(r.laborders), prescriptions: Number(r.prescriptions) };
        }
        catch {
            // The tables do not exist until the first sync.
        }
        return {
            connected: true,
            engine: 'Exasol In-Memory Columnar (Live)',
            host: cfg.host,
            port: cfg.port,
            schema: cfg.schema,
            lastSyncAt: lastSyncTimestamp || undefined,
            totalRecordsSynced: lastSyncedCount,
            rowCounts,
            message: rowCounts ? 'Connected to Exasol. Figures below are computed by Exasol.' : 'Connected to Exasol, but no data has been synced yet. Press Sync to Exasol.',
        };
    }
    return {
        connected: false,
        engine: 'Application Store (Exasol offline)',
        host: cfg.host,
        port: cfg.port,
        schema: cfg.schema,
        lastSyncAt: lastSyncTimestamp || undefined,
        totalRecordsSynced: lastSyncedCount,
        message: `Exasol is not reachable at ${cfg.host}:${cfg.port}. The figures below are computed by the application from its own records, not by Exasol.`,
    };
}
export function updateSyncTelemetry(count) {
    lastSyncTimestamp = new Date().toISOString();
    lastSyncedCount = count;
}
