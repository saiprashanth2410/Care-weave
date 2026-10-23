import { Navigate, Route, Routes } from 'react-router-dom'
import LabLayout from '@/portals/lab/LabLayout'
import { Privacy, Terms } from '@/portals/lab/pages/Legal'
import Orders from '@/portals/lab/pages/Orders'
import Overview from '@/portals/lab/pages/Overview'
import Results from '@/portals/lab/pages/Results'
import Samples from '@/portals/lab/pages/Samples'
import Verification from '@/portals/lab/pages/Verification'

export default function App() {
  return (
    <Routes>
      <Route path="/lab" element={<LabLayout />}>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<Overview />} />
        <Route path="orders" element={<Orders />} />
        <Route path="samples" element={<Samples />} />
        <Route path="results" element={<Results />} />
        <Route path="verification" element={<Verification />} />
      </Route>
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="*" element={<Navigate to="/lab/overview" replace />} />
    </Routes>
  )
}
