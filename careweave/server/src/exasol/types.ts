export interface ExasolConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  schema: string;
}

export interface ExasolConnectionStatus {
  connected: boolean;
  engine: 'Exasol In-Memory Columnar (Live)' | 'Application Store (Exasol offline)';
  host?: string;
  port?: number;
  schema?: string;
  /** When this server last loaded data into Exasol. Absent until a sync has run since the server started. */
  lastSyncAt?: string;
  totalRecordsSynced?: number;
  /** Rows currently held in the Exasol analytics tables (live count), when connected. */
  rowCounts?: { visits: number; labOrders: number; prescriptions: number };
  message?: string;
}

export interface DailyVisitMetric {
  date: string;
  totalVisits: number;
  completed: number;
  inClinic: number;
  scheduled: number;
  cancelled: number;
  /** Mean of the daily totals over this day and up to six earlier days that have visits. */
  movingAvg7: number;
}

export interface DepartmentWorkloadMetric {
  department: string;
  visitCount: number;
  /** Check-in to start of consultation, over the visits where both moments were recorded. Null when none were. */
  avgWaitMinutes: number | null;
  waitSamples: number;
  activeDoctors: number;
}

export interface LabTatMetric {
  testName: string;
  department: string;
  priority: 'routine' | 'urgent';
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  /** Ordered to verified, over verified orders only. Null when no order of this test has been verified. */
  avgTatMinutes: number | null;
  p90TatMinutes: number | null;
  slaTargetMinutes: number;
  withinSlaPercent: number | null;
  criticalCount: number;
}

export interface LabStageMetric {
  orderToCollectMinutes: number | null;
  orderToCollectSamples: number;
  collectToVerifyMinutes: number | null;
  collectToVerifySamples: number;
}

export interface PharmacyConsumptionMetric {
  medicineName: string;
  genericName: string;
  form: string;
  /** Estimated units: doses per day times days of the course, summed over prescriptions where both are known. */
  totalQuantityPrescribed: number | null;
  prescriptionCount: number;
  unknownQuantityCount: number;
  avgDailyUnits: number | null;
  /** Estimate: the observed daily rate carried forward 30 days. Not a stock level. */
  projectedDemand30d: number | null;
  observationDays: number;
}

export interface ClinicalSafetyMetric {
  totalPrescriptions: number;
  allergyBlocks: number;
  allergyOverrides: number;
  duplicateTherapyBlocks: number;
  duplicateTherapyOverrides: number;
  makerCheckerBlocks: number;
  criticalLabResults: number;
}

export interface ExecutedQuery {
  id: string;
  title: string;
  sql: string;
  /** Where it ran. A query that did not run on Exasol says so. */
  engine: 'exasol' | 'application-store';
  rows: number;
  ms: number;
  note?: string;
}

export interface DataQuality {
  visitsWithoutWaitTime: number;
  labOrdersPending: number;
  prescriptionsWithoutQuantity: number;
}

export interface AnalyticsOverviewResponse {
  status: ExasolConnectionStatus;
  /** Whether these figures were computed by Exasol or by the application. Anything not live is labelled as such in the UI. */
  source: { live: boolean; engine: string; fallbackReason?: string; syntheticRecords?: number };
  summary: {
    totalPatients: number;
    totalVisits: number;
    avgLabTatMinutes: number | null;
    criticalAlertsCount: number;
    topPrescribedMedicine: string | null;
  };
  visitsTrend: DailyVisitMetric[];
  departmentWorkload: DepartmentWorkloadMetric[];
  labTat: LabTatMetric[];
  labStages: LabStageMetric;
  pharmacyConsumption: PharmacyConsumptionMetric[];
  safety: ClinicalSafetyMetric;
  dataQuality: DataQuality;
  queries: ExecutedQuery[];
  generatedAt: string;
}
