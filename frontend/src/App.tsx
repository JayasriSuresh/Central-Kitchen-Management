import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import CentralKitchenHome from './pages/CentralKitchenHome';
import RestaurantHome from './pages/RestaurantHome';
import RestaurantRegister from './pages/RestaurantRegister';
import SystemAdminHome from './pages/SystemAdminHome';
import './index.css';

// Role-based guard: redirects after login based on role_type
function RoleRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role_type === 'system') return <Navigate to="/system" replace />;
  if (user.role_type === 'restaurant') return <Navigate to="/restaurant" replace />;
  return <Navigate to="/central-kitchen" replace />;
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/onboarding/register" element={<RestaurantRegister />} />

          {/* Role-based redirect from /dashboard and / */}
          <Route path="/dashboard" element={<RoleRedirect />} />
          <Route path="/" element={<RoleRedirect />} />

          {/* Master Admin / System pages */}
          <Route path="/system" element={<PrivateRoute><SystemAdminHome /></PrivateRoute>} />

          {/* Central Kitchen pages */}
          <Route path="/central-kitchen" element={<PrivateRoute><CentralKitchenHome /></PrivateRoute>} />

          {/* Restaurant pages */}
          <Route path="/restaurant" element={<PrivateRoute><RestaurantHome /></PrivateRoute>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
