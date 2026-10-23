import { Route, Routes } from 'react-router-dom'
import ReceptionistApp from '@/portals/receptionist/ReceptionistApp'
import LabLayout from '@/portals/lab/LabLayout'
import { Privacy, Terms } from '@/portals/lab/pages/Legal'
import Orders from '@/portals/lab/pages/Orders'
import Overview from '@/portals/lab/pages/Overview'
import Results from '@/portals/lab/pages/Results'
import Samples from '@/portals/lab/pages/Samples'
import Verification from '@/portals/lab/pages/Verification'
import { Navigate } from 'react-router-dom'

export default function App() {
  return (
    <Routes>
      {/* Front Desk & Reception Portal (Default for feat/re) */}
      <Route path="/" element={<ReceptionistApp />} />
      <Route path="/receptionist/*" element={<ReceptionistApp />} />

      {/* Laboratory Portal */}
      <Route path="/lab" element={<LabLayout />}>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<Overview />} />
        <Route path="orders" element={<Orders />} />
        <Route path="samples" element={<Samples />} />
        <Route path="results" element={<Results />} />
        <Route path="verification" element={<Verification />} />
      </Route>

      {/* Legal & Static */}
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
