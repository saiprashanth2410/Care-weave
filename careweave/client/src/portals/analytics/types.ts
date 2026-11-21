export interface AnalyticsData {
  status: {
    connected: boolean;
    engine: string;
    host?: string;
    port?: number;
    schema?: string;
    lastSyncAt?: string;
    totalRecordsSynced?: number;
    rowCounts?: { visits: number; labOrders: number; prescriptions: number };
    message?: string;
  };
  source: { live: boolean; engine: string; fallbackReason?: string; syntheticRecords?: number };
  summary: {
    totalPatients: number;
    totalVisits: number;
    avgLabTatMinutes: number | null;
    criticalAlertsCount: number;
    topPrescribedMedicine: string | null;
  };
  visitsTrend: Array<{ date: string; totalVisits: number; completed: number; inClinic: number; scheduled: number; cancelled: number; movingAvg7: number }>;
  departmentWorkload: Array<{ department: string; visitCount: number; avgWaitMinutes: number | null; waitSamples: number; activeDoctors: number }>;
  labTat: Array<{
    testName: string; department: string; priority: string; totalOrders: number; completedOrders: number; pendingOrders: number;
    avgTatMinutes: number | null; p90TatMinutes: number | null; slaTargetMinutes: number; withinSlaPercent: number | null; criticalCount: number;
  }>;
  labStages: { orderToCollectMinutes: number | null; orderToCollectSamples: number; collectToVerifyMinutes: number | null; collectToVerifySamples: number };
  pharmacyConsumption: Array<{
    medicineName: string; genericName: string; form: string; totalQuantityPrescribed: number | null; prescriptionCount: number;
    unknownQuantityCount: number; avgDailyUnits: number | null; projectedDemand30d: number | null; observationDays: number;
  }>;
  safety: {
    totalPrescriptions: number; allergyBlocks: number; allergyOverrides: number; duplicateTherapyBlocks: number;
    duplicateTherapyOverrides: number; makerCheckerBlocks: number; criticalLabResults: number;
  };
  predictions?: Array<{
    department: string; historicalDailyAvg: number; dayOfWeek: string;
    predictedVisitsTomorrow: number; recommendedStaffingDoctors: number; expectedWaitMinutes: number;
    riskLevel: 'Low' | 'Moderate' | 'High Capacity Surge';
  }>;
  dataQuality: { visitsWithoutWaitTime: number; labOrdersPending: number; prescriptionsWithoutQuantity: number };
  queries: Array<{ id: string; title: string; sql: string; engine: 'exasol' | 'application-store'; rows: number; ms: number; note?: string }>;
  generatedAt: string;
}

export const fmt = (v: number | null | undefined, unit = '') => (v === null || v === undefined ? '—' : `${v}${unit}`);

export const DEPT_COLORS = ['#0c6b6d', '#56655f', '#7d5200', '#a3341f', '#3a4a44'];
