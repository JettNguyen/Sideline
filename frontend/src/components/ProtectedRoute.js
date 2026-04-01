import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    let timeout;
    if (loading) {
      timeout = setTimeout(() => setShowLoading(true), 1000);
    } else {
      setShowLoading(false);
    }
    return () => clearTimeout(timeout);
  }, [loading]);

  // while checking for token
  if (loading) {
    return showLoading ? <div className="protected-loading">Loading...</div> : null;
  }

  // if no user, redirect to login page
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // user authenticated, render the protected content
  return children;
};

export default ProtectedRoute;
