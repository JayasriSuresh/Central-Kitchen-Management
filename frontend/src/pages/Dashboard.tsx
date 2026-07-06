
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

export default function Dashboard() {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (user.role_type === 'restaurant') return <Navigate to="/restaurant" replace />;
  return <Navigate to="/central-kitchen" replace />;
}
