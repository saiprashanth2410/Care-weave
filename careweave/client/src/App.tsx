import { Navigate, Route, Routes } from 'react-router-dom'
import LabLayout from '@/portals/lab/LabLayout'
import ComingNext from '@/portals/lab/pages/ComingNext'
import { Privacy, Terms } from '@/portals/lab/pages/Legal'
import Overview from '@/portals/lab/pages/Overview'

export default function App() {
  return (
    <Routes>
      <Route path="/lab" element={<LabLayout />}>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<Overview />} />
        <Route path="orders" element={<ComingNext title="Test Orders" />} />
        <Route path="samples" element={<ComingNext title="Sample Tracking" />} />
        <Route path="results" element={<ComingNext title="Result Entry" />} />
        <Route path="verification" element={<ComingNext title="Verification Queue" />} />
      </Route>
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="*" element={<Navigate to="/lab/overview" replace />} />
    </Routes>
  )
}
