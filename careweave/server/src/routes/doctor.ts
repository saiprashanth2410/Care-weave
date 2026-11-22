import { Router } from 'express';
import type { AppCtx } from '../context.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import { doctorAccess } from './doctorAccess.js';
import { doctorChartRoutes } from './doctorChart.js';
import { doctorOrderRoutes } from './doctorOrders.js';
import { doctorPrescribingRoutes } from './doctorPrescribing.js';
import { doctorReconciliationRoutes } from './doctorReconciliation.js';

// Doctor portal API. Every route checks the role here on the server, and patient data is only
// reachable for a patient the doctor is linked to (an appointment assigned to them, or their own encounter).
export function doctorRoutes(ctx: AppCtx) {
  const router = Router();
  catchAsyncRoutes(router);
  const access = doctorAccess(ctx);
  router.use(doctorChartRoutes(ctx, access));
  router.use(doctorOrderRoutes(ctx, access));
  router.use(doctorPrescribingRoutes(ctx, access));
  router.use(doctorReconciliationRoutes(ctx, access));
  return router;
}
