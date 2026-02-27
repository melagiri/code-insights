import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import LandingPage from '@/pages/LandingPage';
import DashboardPage from '@/pages/DashboardPage';
import SessionsPage from '@/pages/SessionsPage';
import SessionDetailPage from '@/pages/SessionDetailPage';
import InsightsPage from '@/pages/InsightsPage';
import AnalyticsPage from '@/pages/AnalyticsPage';
import SettingsPage from '@/pages/SettingsPage';
import ExportPage from '@/pages/ExportPage';
import JournalPage from '@/pages/JournalPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/sessions/:id" element={<SessionDetailPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/export" element={<ExportPage />} />
        <Route path="/journal" element={<JournalPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
