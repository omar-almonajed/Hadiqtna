import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/routes/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { RealtimeProvider } from './contexts/RealtimeContext';
import { AlertsPage } from './pages/AlertsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { BinDetailsPage } from './pages/BinDetailsPage';
import { BinsPage } from './pages/BinsPage';
import { CitizenPortalPage } from './pages/CitizenPortalPage';
import { CitizenReportDetailsPage } from './pages/CitizenReportDetailsPage';
import { DashboardPage } from './pages/DashboardPage';
import { DevicesPage } from './pages/DevicesPage';
import { GuidePage } from './pages/GuidePage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { MaintenancePage } from './pages/MaintenancePage';
import { MonitoringPage } from './pages/MonitoringPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ParksPage } from './pages/ParksPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { StaffWorkspacePage } from './pages/StaffWorkspacePage';

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <RealtimeProvider>
          <BrowserRouter>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/guide" element={<GuidePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/citizen" element={<CitizenPortalPage />} />
              <Route path="/citizen/reports/:reportId" element={<CitizenReportDetailsPage />} />

              {/* Authenticated Staff Routes */}
              <Route
                path="/staff"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER']}>
                    <StaffWorkspacePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER']}>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/bins"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER']}>
                    <BinsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/bins/:binId"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER']}>
                    <BinDetailsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/devices"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'SUPERVISOR', 'OPERATOR']}>
                    <DevicesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/monitoring"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'SUPERVISOR', 'OPERATOR']}>
                    <MonitoringPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/alerts"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'SUPERVISOR', 'OPERATOR']}>
                    <AlertsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'SUPERVISOR']}>
                    <ReportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/maintenance"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER']}>
                    <MaintenancePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/notifications"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER']}>
                    <NotificationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/parks"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER']}>
                    <ParksPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/analytics"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'SUPERVISOR', 'OPERATOR']}>
                    <AnalyticsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER']}>
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </RealtimeProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
