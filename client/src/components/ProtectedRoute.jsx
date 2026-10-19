import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ user, children }) {
  if (user === undefined) return null; // still loading — render nothing yet
  if (!user) return <Navigate to="/" replace />;
  return children;
}
