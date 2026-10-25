import { Navigate, Route, Routes } from 'react-router-dom'
import Login from '@/auth/Login'
import RequireRole from '@/auth/RequireRole'
import DoctorApp from '@/portals/doctor/DoctorApp'
import ReceptionistApp from '@/portals/receptionist/ReceptionistApp'
import LabLayout from '@/portals/lab/LabLayout'
import { Privacy, Terms } from '@/portals/lab/pages/Legal'
import Orders from '@/portals/lab/pages/Orders'
import Overview from '@/portals/lab/pages/Overview'
import Results from '@/portals/lab/pages/Results'
import Samples from '@/portals/lab/pages/Samples'
import Verification from '@/portals/lab/pages/Verification'
import AnalyticsApp from '@/portals/analytics/AnalyticsApp'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Front desk portal */}
      <Route
        path="/doctor/*"
        element={<RequireRole role="doctor">{(user) => <DoctorApp user={user} />}</RequireRole>}
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
  )
}
