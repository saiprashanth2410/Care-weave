// Shows what Exasol adds: the same analytical SQL the dashboard uses, run over millions of rows.
// The rows are SYNTHETIC and generated inside Exasol into a separate schema (CAREWEAVE_SCALE_DEMO). They never touch the app's data
// or the dashboard tables, and the schema is dropped at the end.
// Run: npm run demo:scale [rows]     (needs Exasol running; set EXASOL_HOST/PORT/USER/PASSWORD if not the defaults)
import 'dotenv/config';
import { queryExasol } from '../src/exasol/client.js';

const ROWS = Math.max(1000, Number(process.argv[2]) || 5_000_000);
const SCHEMA = 'CAREWEAVE_SCALE_DEMO';
const time = async <T>(label: string, f: () => Promise<T>) => {
  const t = Date.now();
  const out = await f();
  console.log(`${label.padEnd(58)} ${String(Date.now() - t).padStart(6)} ms`);
  return out;
};

try {
  await queryExasol(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await queryExasol(`CREATE SCHEMA ${SCHEMA}`);
  await queryExasol(`OPEN SCHEMA ${SCHEMA}`);
  console.log(`Synthetic data, generated inside Exasol (${ROWS.toLocaleString()} visit rows, 3 years)\n`);
  await queryExasol(`CREATE TABLE FACT_PATIENT_VISITS (VISIT_ID DECIMAL(18,0), VISIT_DATE DATE, DEPARTMENT VARCHAR(32), DOCTOR_NAME VARCHAR(32), STATUS VARCHAR(16), WAIT_TIME_MINUTES DECIMAL(10,1))`);
  await time('Generate and load rows', () => queryExasol(
    `INSERT INTO FACT_PATIENT_VISITS
     SELECT LEVEL, ADD_DAYS(DATE '2023-01-01', MOD(LEVEL * 7919, 1095)),
            CASE MOD(LEVEL, 4) WHEN 0 THEN 'Cardiology' WHEN 1 THEN 'Endocrinology' ELSE 'General Medicine' END,
            'Dr ' || TO_CHAR(MOD(LEVEL, 40)),
            CASE MOD(LEVEL, 10) WHEN 0 THEN 'cancelled' WHEN 1 THEN 'scheduled' ELSE 'completed' END,
            5 + MOD(LEVEL * 31, 55)
     FROM DUAL CONNECT BY LEVEL <= ${ROWS}`, 120_000));
  const count = await queryExasol<any>('SELECT COUNT(*) AS "n" FROM FACT_PATIENT_VISITS');
  console.log(`Rows in table: ${Number(count[0].n).toLocaleString()}\n`);

  // Each query runs once cold, then five more times. "client" is wall-clock time seen by Node: it includes the websocket round trip
  // (localhost here), Exasol's execution, and parsing the result into objects. "server" is Exasol's own execution time from its
  // statistics (EXA_SQL_LAST_DAY), which excludes all of that. The result sets are small, so the two should be close.
  const QUERIES: [string, string][] = [
    ['Department workload (GROUP BY, AVG, COUNT DISTINCT)', `SELECT DEPARTMENT, COUNT(*) AS V, ROUND(AVG(WAIT_TIME_MINUTES),1) AS W, COUNT(DISTINCT DOCTOR_NAME) AS D FROM FACT_PATIENT_VISITS GROUP BY DEPARTMENT`],
    ['Daily volume + 7-day moving average (window function)', `SELECT D, T, ROUND(AVG(T) OVER (ORDER BY D ROWS BETWEEN 6 PRECEDING AND CURRENT ROW),1) AS MA FROM (SELECT VISIT_DATE AS D, COUNT(*) AS T FROM FACT_PATIENT_VISITS GROUP BY VISIT_DATE)`],
    ['90th percentile wait per department (PERCENTILE_CONT)', `SELECT DEPARTMENT, ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY WAIT_TIME_MINUTES),1) AS P90 FROM FACT_PATIENT_VISITS GROUP BY DEPARTMENT`],
    ['Top 3 doctors per month (GROUP BY + RANK)', `SELECT * FROM (SELECT M, DOCTOR_NAME, N, RANK() OVER (PARTITION BY M ORDER BY N DESC) AS R FROM (SELECT TO_CHAR(VISIT_DATE,'YYYY-MM') AS M, DOCTOR_NAME, COUNT(*) AS N FROM FACT_PATIENT_VISITS GROUP BY 1, 2)) WHERE R <= 3`],
  ];
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  console.log(`${'query'.padEnd(58)} ${'rows'.padStart(5)} ${'cold'.padStart(7)} ${'client'.padStart(8)} ${'server'.padStart(8)}   (ms; client and server are medians of 5 warm runs)`);
  for (const [i, [label, sql]] of QUERIES.entries()) {
    await queryExasol('FLUSH STATISTICS');
    const before = Number((await queryExasol<any>('SELECT MAX(STMT_ID) AS "m" FROM EXA_STATISTICS.EXA_SQL_LAST_DAY WHERE SESSION_ID = CURRENT_SESSION'))[0].m);
    const runs: number[] = [];
    let rows = 0;
    for (let k = 0; k < 6; k++) {
      const t = performance.now();
      rows = (await queryExasol(sql)).length;
      runs.push(performance.now() - t);
    }
    await queryExasol('FLUSH STATISTICS');
    // Exasol's own duration for exactly those six statements (this session, after the marker).
    const stats = await queryExasol<any>(`SELECT DURATION AS "d" FROM EXA_STATISTICS.EXA_SQL_LAST_DAY WHERE SESSION_ID = CURRENT_SESSION AND STMT_ID > ${before} AND COMMAND_NAME = 'SELECT' ORDER BY STMT_ID LIMIT 6`);
    const server = stats.slice(1).map((r) => Number(r.d) * 1000);
    console.log(`${label.padEnd(58)} ${String(rows).padStart(5)} ${runs[0].toFixed(0).padStart(7)} ${median(runs.slice(1)).toFixed(0).padStart(8)} ${(server.length ? median(server).toFixed(0) : 'n/a').padStart(8)}`);
  }
  console.log('\nThe load step above is data generation inside Exasol and is not part of any query timing.');
} catch (err: any) {
  console.error('Demo failed:', err?.message || err);
  process.exitCode = 1;
} finally {
  await queryExasol(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => undefined);
  process.exit(process.exitCode ?? 0);
}
