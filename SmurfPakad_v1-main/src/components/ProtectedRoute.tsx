import { Navigate } from "react-router-dom";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const token = localStorage.getItem("authToken");
  
  if (!token) {
    return <Navigate to="/cryptoflow" replace />;
  }
  
  return <>{children}</>;
};
