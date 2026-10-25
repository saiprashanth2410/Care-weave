export interface ExasolConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  schema: string;
}

export interface ExasolConnectionStatus {
  connected: boolean;
  engine: 'Exasol In-Memory Columnar (Live)' | 'MongoDB Analytics Pipeline (Fallback)';
  host?: string;
  port?: number;
  schema?: string;
  lastSyncAt?: string;
  totalRecordsSynced?: number;
  message?: string;
}

export interface DailyVisitMetric {
  date: string;
  totalVisits: number;
  completed: number;
  checkedIn: number;
  scheduled: number;
  cancelled: number;
}

export interface DepartmentWorkloadMetric {
  department: string;
  visitCount: number;
  avgWaitMinutes: number;
  activeDoctors: number;
}

export interface LabTatMetric {
  testName: string;
  department: string;
  priority: 'routine' | 'urgent';
  totalOrders: number;
  avgTatMinutes: number;
  slaTargetMinutes: number;
  withinSlaPercent: number;
  criticalCount: number;
}

export interface PharmacyConsumptionMetric {
  medicineName: string;
  genericName: string;
  form: string;
  totalQuantityPrescribed: number;
  prescriptionCount: number;
  estimatedDaysRemaining: number;
  stockStatus: 'adequate' | 'reorder-soon' | 'critical-low';
}

export interface ClinicalSafetyMetric {
  totalPrescriptions: number;
  allergyInterceptCount: number;
  criticalLabFlagCount: number;
  unverifiedReleaseAttemptsBlocked: number;
}

export interface AnalyticsOverviewResponse {
  status: ExasolConnectionStatus;
  summary: {
    totalPatients: number;
    totalVisits: number;
    avgLabTatMinutes: number;
    criticalAlertsCount: number;
    topPrescribedMedicine: string;
  };
  visitsTrend: DailyVisitMetric[];
  departmentWorkload: DepartmentWorkloadMetric[];
  labTat: LabTatMetric[];
  pharmacyConsumption: PharmacyConsumptionMetric[];
  safety: ClinicalSafetyMetric;
}
