import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Login from '@/auth/Login'
import RequireRole from '@/auth/RequireRole'

// Only the sign-in page is loaded up front. Each portal (and each lab page) is fetched when someone opens it, so a
// receptionist never downloads the doctor, lab, admin or analytics code.
const DoctorApp = lazy(() => import('@/portals/doctor/DoctorApp'))
const ReceptionistApp = lazy(() => import('@/portals/receptionist/ReceptionistApp'))
const AdminApp = lazy(() => import('@/portals/admin/AdminApp'))
const AnalyticsApp = lazy(() => import('@/portals/analytics/AnalyticsApp'))
const LabLayout = lazy(() => import('@/portals/lab/LabLayout'))
const Orders = lazy(() => import('@/portals/lab/pages/Orders'))
const Overview = lazy(() => import('@/portals/lab/pages/Overview'))
const Results = lazy(() => import('@/portals/lab/pages/Results'))
const Samples = lazy(() => import('@/portals/lab/pages/Samples'))
const Verification = lazy(() => import('@/portals/lab/pages/Verification'))
const Terms = lazy(() => import('@/portals/lab/pages/Legal').then((m) => ({ default: m.Terms })))
const Privacy = lazy(() => import('@/portals/lab/pages/Legal').then((m) => ({ default: m.Privacy })))

function PageLoading() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-sm text-ink-3">
      <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-rule border-t-accent" aria-hidden="true" />
      Loading…
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageLoading />}>
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Front desk portal */}
      <Route
        path="/doctor/*"
        element={<RequireRole role="doctor">{(user) => <DoctorApp user={user} />}</RequireRole>}
      />
      <Route
        path="/admin/*"
        element={<RequireRole role="admin">{(user) => <AdminApp user={user} />}</RequireRole>}
      />
      <Route
        path="/receptionist/*"
        element={<RequireRole role="receptionist">{(user) => <ReceptionistApp user={user} />}</RequireRole>}
      />

      {/* Laboratory portal */}
      <Route
        path="/lab"
        element={<RequireRole role="lab">{(user) => <LabLayout user={user} />}</RequireRole>}
      >
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<Overview />} />
        <Route path="orders" element={<Orders />} />
        <Route path="samples" element={<Samples />} />
        <Route path="results" element={<Results />} />
        <Route path="verification" element={<Verification />} />
      </Route>

      {/* Exasol Healthcare Analytics Hub */}
      <Route path="/analytics" element={<AnalyticsApp />} />

      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </Suspense>
  )
}
