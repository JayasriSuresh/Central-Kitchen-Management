import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import CentralKitchenHome from './pages/CentralKitchenHome';
import RestaurantHome from './pages/RestaurantHome';
import RestaurantRegister from './pages/RestaurantRegister';
import SystemAdminHome from './pages/SystemAdminHome';
import './index.css';

import ChooseWorkspace from './pages/ChooseWorkspace';
import AdminLogin from './pages/AdminLogin';
import './index.css';

// Role-based guard: redirects after login based on role_type and activePortal
function RoleRedirect() {
  const { user, activePortal } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  
  if (user.portals && user.portals.length > 1 && !activePortal) {
    return <Navigate to="/choose-workspace" replace />;
  }

  const portal = (activePortal || user.role_type)?.toLowerCase();
  if (portal === 'system') return <Navigate to="/system" replace />;
  if (portal === 'restaurant') return <Navigate to="/restaurant" replace />;
  return <Navigate to="/central-kitchen" replace />;
}

function PrivateRoute({ children, allowedPortal }: { children: React.ReactNode; allowedPortal?: string }) {
  const { user, activePortal } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  if (allowedPortal) {
    const portal = (activePortal || user.role_type)?.toLowerCase();
    if (portal !== allowedPortal?.toLowerCase()) {
      if (portal === 'system') return <Navigate to="/system" replace />;
      if (portal === 'restaurant') return <Navigate to="/restaurant" replace />;
      return <Navigate to="/central-kitchen" replace />;
    }
  }

  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/choose-workspace" element={<PrivateRoute><ChooseWorkspace /></PrivateRoute>} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/onboarding/register" element={<RestaurantRegister />} />

          {/* Role-based redirect from /dashboard and / */}
          <Route path="/dashboard" element={<RoleRedirect />} />
          <Route path="/" element={<RoleRedirect />} />

          {/* Master Admin / System pages */}
          <Route path="/system" element={<PrivateRoute allowedPortal="system"><SystemAdminHome /></PrivateRoute>} />

          {/* Central Kitchen pages */}
          <Route path="/central-kitchen" element={<PrivateRoute allowedPortal="central_kitchen"><CentralKitchenHome /></PrivateRoute>} />

          {/* Restaurant pages */}
          <Route path="/restaurant" element={<PrivateRoute allowedPortal="restaurant"><RestaurantHome /></PrivateRoute>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
