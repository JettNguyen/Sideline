import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../utils/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if(!token) {
      setLoading(false);
      return;
    }

    const fetchUser = async () => {
      try {
        const res = await api.get('/users/me');
        setUser(res.data);
      } catch (err) {
        console.error('Error validating token:', err);
        localStorage.removeItem('token');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();


  }, []);

  const login = async ({ username, password }) => {
    try {
      const res = await api.post('/auth/login', {
        username,
        password
      });

      const { token, user } = res.data;

      localStorage.setItem('token', token);
      setUser(user);

      return { success: true };
    } catch (err) {
      console.error('Login failed:', err);
      const message = err.response?.data?.message || 'Login failed. Please try again.';
      return {
        success: false,
        message,
        requiresEmailVerification: !!err.response?.data?.requiresEmailVerification,
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const updateUser = (nextUser) => {
    setUser(nextUser);
  };

  const value = {
    user,
    login,
    logout,
    updateUser,
    loading,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  return useContext(AuthContext);
};