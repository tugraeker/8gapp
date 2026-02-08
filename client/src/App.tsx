import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import TeacherDashboard from './pages/TeacherDashboard';
import StudentDashboard from './pages/StudentDashboard';
import Chat from './pages/Chat';
import Screensaver from './pages/Screensaver';
import Shop from './pages/Shop';
import Leaderboard from './pages/Leaderboard';
import AdminLogs from './pages/AdminLogs';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Yükleniyor...</div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
};

const Dashboard: React.FC = () => {
    const { user } = useAuth();
    if (user?.role === 'teacher') return <TeacherDashboard />;
    return <StudentDashboard />;
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          } />
          <Route path="/chat" element={
            <PrivateRoute>
              <Chat />
            </PrivateRoute>
          } />
          <Route path="/screensaver" element={
            <PrivateRoute>
              <Screensaver />
            </PrivateRoute>
          } />
          <Route path="/shop" element={
            <PrivateRoute>
              <Shop />
            </PrivateRoute>
          } />
          <Route path="/leaderboard" element={
            <PrivateRoute>
              <Leaderboard />
            </PrivateRoute>
          } />
          <Route path="/admin/logs" element={
            <PrivateRoute>
              <AdminLogs />
            </PrivateRoute>
          } />
          <Route path="/student-dashboard" element={
             <PrivateRoute>
                 <StudentDashboard />
             </PrivateRoute>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
