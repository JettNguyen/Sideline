import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import api from '../utils/api';
import logo from '../logo.svg';
import './Login.css';

const Login = () => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if(isRegistering) {
        // call backend to create user
        await api.post('/auth/register', {
          username,
          email,
          password
        });

        // auto-login after successful registration
        const result = await login({ username, password });
        if(result.success) {
          navigate('/');
        }else {
          setError(result.message || 'Login after registration failed.');
        }
      }else {
        // login mode
        const result = await login({ username, password });
        if(result.success) {
          navigate('/');
        }else {
          setError(result.message || 'Login failed.');
        }
      }
    } catch (err) {
      console.error('Authentication failed:', err);
      const message = err.response?.data?.message || (isRegistering ? 'Registration failed.' : 'Login failed.');
      setError(message);
    }
  };

  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    // clear form when switching modes
    setUsername('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setError('');
  };

  const handleForgotPassword = () => {
    setError('Password reset is not available yet.');
  };

  return (
    <div className="login-container">
      <div className="login-header">
        <p className="welcome-text">Welcome!</p>
        <img src={logo} alt="Sideline Logo" className="login-logo" />
        <h1 className="login-title">Sideline</h1>
      </div>
      
      <div className="login-card">
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username" className="form-label">Username</label>
            <input
              type="text"
              id="username"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          
          {isRegistering && (
            <div className="form-group">
              <label htmlFor="email" className="form-label">Email</label>
              <input
                type="email"
                id="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <div className="password-input-container">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                className="form-input password-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}
          
          <button type="submit" className="login-button">
            {isRegistering ? 'Create Account' : 'Log In'}
          </button>

          {!isRegistering && (
            <button
              type="button"
              className="forgot-password-button"
              onClick={handleForgotPassword}
            >
              Forgot your password?
            </button>
          )}
        </form>
        
        <button 
          type="button" 
          className="create-account-button"
          onClick={toggleMode}
        >
          {isRegistering ? 'Already have an account?\nLog In' : 'Create an Account'}
        </button>
      </div>
    </div>
  );
};

export default Login;
