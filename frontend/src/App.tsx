import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DriveLayout } from '@/layouts/DriveLayout'
import { AllFilesPage } from '@/pages/AllFilesPage'
import { GoogleConnectedPage } from '@/pages/GoogleConnectedPage'
import { QuotaTrackerPage } from '@/pages/QuotaTrackerPage'
import { RecentPage } from '@/pages/RecentPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SharedPage } from '@/pages/SharedPage'
import { PublicFilePage } from '@/pages/PublicFilePage'
import { ApiManagementPage } from '@/pages/ApiManagementPage'
import { TrashPage } from '@/pages/TrashPage'
import { ActivityLogPage } from '@/pages/ActivityLogPage'
import { UploadProvider } from '@/context/UploadContext'


function App() {
  return (
    <BrowserRouter>
      <UploadProvider>
        <Routes>
          <Route path="google-connected" element={<GoogleConnectedPage />} />
          <Route path="public/files/:token" element={<PublicFilePage />} />
          <Route path="public/files/:token/embed" element={<PublicFilePage embed />} />
        <Route element={<DriveLayout />}>
          <Route index element={<Navigate to="/all-files" replace />} />
          <Route path="all-files" element={<AllFilesPage />} />
          <Route path="quota" element={<QuotaTrackerPage />} />
          <Route path="shared" element={<SharedPage />} />
          <Route path="recent" element={<RecentPage />} />
          <Route path="trash" element={<TrashPage />} />
          <Route path="activity" element={<ActivityLogPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="api" element={<ApiManagementPage />} />
        </Route>
          <Route path="*" element={<Navigate to="/all-files" replace />} />
        </Routes>
      </UploadProvider>
    </BrowserRouter>
  )
}


export default App
