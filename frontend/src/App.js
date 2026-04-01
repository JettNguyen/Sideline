import React from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import './App.css';

import logo from './logo.svg';

import ProtectedRoute from './components/ProtectedRoute';

import Home from './pages/Home';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Team from './pages/Team';
import GameDetails from './pages/GameDetails';
import { useEffect, useState } from 'react';
import api from './utils/api';
import { AuthProvider, useAuth } from './context/AuthContext';

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profilePicUrl, setProfilePicUrl] = useState("");
  const [displayLocation, setDisplayLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState('entered');

  const showBackButton = ['/profile', '/team'].some(path => 
    location.pathname.startsWith(path)
  );

  useEffect(() => {
    const fetchProfilePic = async () => {
      try {
        const res = await api.get('/images/me');
        setProfilePicUrl(res.data.url);
      } catch (err) {
        console.error("Failed to load profile pic", err);
      }
    };

    if (user?.profilePicture) {
      fetchProfilePic();
    }
  }, [user]);

  useEffect(() => {
    if (location.pathname === displayLocation.pathname) return;

    // Launch exit transition first
    setTransitionStage('exiting');
    const exitTimer = setTimeout(() => {
      setDisplayLocation(location);
      setTransitionStage('entering');
      const enterTimer = setTimeout(() => {
        setTransitionStage('entered');
      }, 150);
      return () => clearTimeout(enterTimer);
    }, 200);

    return () => clearTimeout(exitTimer);
  }, [location, displayLocation]);

  const showProfileButton = location.pathname !== '/login';
  const showHeader = location.pathname !== '/login';

  return (
    <div className="App">
      {showHeader && (
        <header className={`app-header ${showBackButton ? 'has-back' : 'no-back'}`}>
          {showBackButton && (
            <button className="header-back-btn" onClick={() => navigate(-1)}>
              <i className="fas fa-arrow-left"></i>
            </button>
          )}
          <div className={`brand-container ${showBackButton ? 'center' : 'left'}`}>
            <Link to="/" className="brand-mark">
              <img src={logo} alt="Sideline" className="brand-logo" />
              <span className="brand-text">Sideline</span>
            </Link>
          </div>
          {showProfileButton && user && (
            <Link to="/profile" className="header-profile-btn" aria-label="Profile">
              {user?.profilePicture && profilePicUrl ? (
                <img
                  src={profilePicUrl}
                  alt="Profile"
                  className="header-profile-pic"
                />
              ) : (
                <i className="fas fa-user"></i>
              )}
            </Link>
          )}
        </header>
      )}

      <div className={`container page-transition page-${transitionStage}`}>
        <Routes location={displayLocation}>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile" 
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/team/:teamId"
            element={
              <ProtectedRoute>
                <Team />
              </ProtectedRoute>
            }
          />
          <Route
            path="/team/:teamId/game/:gameId"
            element={
              <ProtectedRoute>
                <GameDetails />
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;
