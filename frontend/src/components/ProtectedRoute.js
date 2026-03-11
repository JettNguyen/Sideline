import React from 'react';
import { Navigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  //while checking for token
  if(loading) {
    return <div>Loading...</div>
  }

  // if no user, redirect to login page
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // user authenticated, render the protected content
  return children;
};

export default ProtectedRoute;
