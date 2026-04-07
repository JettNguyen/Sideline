import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  const [message, setMessage] = useState('');
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetPasswordMode, setResetPasswordMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const verifyToken = searchParams.get('verifyToken');
  const resetToken = searchParams.get('resetToken');
  const hasVerifiedToken = useRef(false);
  const hasHandledReset = useRef(false);

  useEffect(() => {
    if (!verifyToken || hasVerifiedToken.current) return;

  hasVerifiedToken.current = true;

  const verifyEmail = async () => {
    try {
      const res = await api.get(`/auth/verify-email?token=${encodeURIComponent(verifyToken)}`);
      setMessage(res.data.message || 'Email verified successfully. You can now log in.');
      setError('');
      setIsRegistering(false);
      setShowResendVerification(false);

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('verifyToken');
      setSearchParams(nextParams, { replace: true });
    } catch (err) {
      console.error('Email verification failed:', err);
      setError(err.response?.data?.message || 'Email verification failed.');
      setMessage('');

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('verifyToken');
      setSearchParams(nextParams, { replace: true });
    }
  };

  verifyEmail();
}, [verifyToken]);

useEffect(() => {
  if (!resetToken || hasHandledReset.current) return;
  hasHandledReset.current = true;

  // show reset password UI
  setResetPasswordMode(true);
  setShowForgotPassword(false);
  setShowResendVerification(false);
}, [resetToken]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsSubmitting(true);

    try {
      if(isRegistering) {
        // call backend to create user
        const res = await api.post('/auth/register', {
          username,
          email,
          password,
        });

        setMessage(
          res.data?.message || 'Account created. Check your email to verify your account.'
        );
        setIsRegistering(false);
        setPassword('');
      } else if (showResendVerification) {
        await api.post('/auth/resend-verification', { email, username });
        setMessage('Verification email sent. Please check your inbox.');
        setShowResendVerification(false);
      }else {
        // login mode
        const result = await login({ username, password });
        if(result.success) {
          navigate('/');
        }else {
          setError(result.message || 'Login failed.');
          if (result.requiresEmailVerification) {
            if (username.includes('@') && !email) {
              setEmail(username);
            }
            setShowResendVerification(true);
          }
        }
      }
    } catch (err) {
      console.error('Authentication failed:', err);
      const message = err.response?.data?.message || (isRegistering ? 'Registration failed.' : 'Login failed.');
      setError(message);
      setMessage('');

      if (err.response?.data?.requiresEmailVerification) {
        if (username.includes('@') && !email) {
          setEmail(username);
        }
        setShowResendVerification(true);
      }
    } finally {
      setIsSubmitting(false);
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
    setMessage('');
    setShowResendVerification(false);
  };

  const handleForgotPassword = () => {
    setError('');
    setMessage('');
    setShowForgotPassword(true);
    setShowResendVerification(false);
  };

  const handleSendResetLink = async () => {
    setError('');
    setMessage('');
    if (!email) {
      setError('Please enter your email');
      return;
    }

    setIsSendingReset(true);
    try {
      await api.post('/auth/request-password-reset', { email });
      setMessage('Password reset email sent. Check your inbox.');
      setShowForgotPassword(false);
    } catch (err) {
      console.error('Request password reset failed:', err);
      setError(err.response?.data?.message || 'Could not send password reset email.');
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleResetPassword = async () => {
    setError('');
    setMessage('');

    if (!newPassword) {
      setError('Please enter a new password');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      await api.post('/auth/reset-password', { token: resetToken, password: newPassword });
      setMessage('Password reset successful. You can now log in.');
      setResetPasswordMode(false);
      setNewPassword('');
      setConfirmPassword('');

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('resetToken');
      setSearchParams(nextParams, { replace: true });
    } catch (err) {
      console.error('Reset password failed:', err);
      setError(err.response?.data?.message || 'Could not reset password.');
    }
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
          {(!showForgotPassword || resetPasswordMode) && (
            <div className="form-group">
              <label htmlFor="username" className="form-label">
                {showResendVerification ? 'Username (optional)' : 'Username'}
                {!isRegistering && !resetPasswordMode && (
                  <span className="form-label-suffix">or Email</span>
                )}
              </label>
              {!resetPasswordMode ? (
                <input
                  type="text"
                  id="username"
                  className="form-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required={!showResendVerification}
                  autoComplete="username"
                  disabled={isSubmitting}
                />
              ) : (
                <div id="username" className="username-static">{username || '—'}</div>
              )}
            </div>
          )}
          
          {(isRegistering || showResendVerification || showForgotPassword) && (
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                {showResendVerification ? 'Email (optional)' : 'Email'}
              </label>
              <input
                type="email"
                id="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required={isRegistering || showForgotPassword}
                placeholder={showResendVerification && !isRegistering ? 'Email (optional)' : ''}
                autoComplete="email"
                disabled={isSubmitting}
              />
            </div>
          )}
          
          {!resetPasswordMode && !showForgotPassword && !showResendVerification && (
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
                  autoComplete={isRegistering ? 'new-password' : 'current-password'}
                  disabled={isSubmitting}
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
          )}

          {error && <p className="error-text">{error}</p>}
          {message && <p className="success-text">{message}</p>}
          
          {!resetPasswordMode && !showForgotPassword && (
            <button type="submit" className="login-button" disabled={isSubmitting}>
              {isSubmitting
                ? (isRegistering ? 'Creating account…' : (showResendVerification ? 'Sending…' : 'Logging in…'))
                : (isRegistering ? 'Create Account' : (showResendVerification ? 'Send Email' : 'Log In'))}
            </button>
          )}

          {!isRegistering && (
            <>
              {!resetPasswordMode && !showForgotPassword && (
                <button
                  type="button"
                  className="forgot-password-button"
                  onClick={showResendVerification ? () => {
                    setShowResendVerification(false);
                    setError('');
                    setMessage('');
                  } : handleForgotPassword}
                >
                  {showResendVerification ? 'Back to login' : 'Forgot your password?'}
                </button>
              )}

              {showForgotPassword && (
                <div>
                  <p className="info-text">Enter your email and press "Send reset link" to reset your password.</p>
                  <button
                    type="button"
                    className="action-primary"
                    onClick={handleSendResetLink}
                    disabled={!email || isSendingReset}
                  >
                    {isSendingReset ? 'Sending…' : 'Send reset link'}
                  </button>
                  <button
                    type="button"
                    className="action-secondary"
                    onClick={() => setShowForgotPassword(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {resetPasswordMode && (
                <div className="reset-password-fields">
                  <div className="form-group">
                    <label htmlFor="newPassword" className="form-label">New Password</label>
                    <input
                      type="password"
                      id="newPassword"
                      className="form-input"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="confirmPassword" className="form-label">Confirm Password</label>
                    <input
                      type="password"
                      id="confirmPassword"
                      className="form-input"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <button
                    type="button"
                    className="login-button"
                    onClick={handleResetPassword}
                  >
                    Set New Password
                  </button>
                </div>
              )}
            </>
          )}
        </form>
        
        {!showForgotPassword && (
          <button 
            type="button" 
            className="create-account-button"
            onClick={toggleMode}
            disabled={isSubmitting}
          >
            {isRegistering ? 'Already have an account?\nLog In' : 'Create an Account'}
          </button>
        )}
      </div>
    </div>
  );
};

export default Login;
