import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Key, Mail, User, ShieldAlert, CheckCircle, Award } from './SvgIcons';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Form Fields
  const [registerNumber, setRegisterNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Field-level error highlighting (Item 4)
  const [fieldError, setFieldError] = useState(''); // 'register_number' | 'email' | ''

  // Forgot Password Fields
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotPassword, setForgotPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  // Alerts
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Dynamic stats (Item 3)
  const [liveStats, setLiveStats] = useState({ total_generated: 24, users_count: 0 });

  const navigate = useNavigate();

  useEffect(() => {
    fetch(`http://${window.location.hostname}:5000/api/public/stats`)
      .then(r => r.json())
      .then(d => setLiveStats(d))
      .catch(() => {});
  }, []);

  const handleToggleMode = (mode) => {
    setIsRegister(mode);
    setShowForgot(false);
    setCodeSent(false);
    setErrorMsg('');
    setSuccessMsg('');
    setFieldError('');
    setRegisterNumber('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    // Validation
    if (isRegister) {
      if (!registerNumber.trim() || !email.trim() || !password || !confirmPassword) {
        setErrorMsg('Please fill in all registration fields.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match.');
        return;
      }
    } else {
      if (!email.trim() || !password) {
        setErrorMsg('Please enter both email and password.');
        return;
      }
    }

    setLoading(true);
    const endpoint = isRegister ? '/api/register' : '/api/login';
    const payload = isRegister
      ? { register_number: registerNumber, email, password }
      : { email, password };

    try {
      const response = await fetch(`http://${window.location.hostname}:5000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (!response.ok) {
        // Field-level error highlighting (Item 4)
        if (data.field) setFieldError(data.field);
        else setFieldError('');
        throw new Error(data.error || 'Authentication failed.');
      }

      setFieldError('');
      if (isRegister) {
        setSuccessMsg('Registration successful! Please sign in.');
        setIsRegister(false);
        setPassword('');
        setConfirmPassword('');
      } else {
        localStorage.setItem('user', JSON.stringify(data.user));
        // Redirect to admin dashboard if they are admin, else standard dashboard
        if (data.user.role === 'admin') {
          navigate('/admin-dashboard');
        } else {
          navigate('/dashboard');
        }
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendResetCode = async (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const response = await fetch(`http://${window.location.hostname}:5000/api/forgot-password/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send code.');
      setSuccessMsg(data.message);
      setCodeSent(true);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleVerifyAndReset = async (e) => {
    e.preventDefault();
    if (!forgotEmail.trim() || !forgotCode.trim() || !forgotPassword.trim()) return;
    setForgotLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const response = await fetch(`http://${window.location.hostname}:5000/api/forgot-password/verify-and-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, code: forgotCode, password: forgotPassword })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to reset password.');
      setSuccessMsg(data.message);
      setShowForgot(false);
      setCodeSent(false);
      setForgotEmail('');
      setForgotCode('');
      setForgotPassword('');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="login-page-wrapper">
      <div className="split-login-container">
        {/* Left Side: White login form */}
        <div className="split-login-left">
          <div className="left-header-row">
            <span className="brand-logo-text">Certora</span>
          </div>

          <div className="left-form-wrapper">
            <div className="green-logo-badge">
              <Award size={32} color="#fff" />
            </div>

            <div className="form-heading">
              <h1>{showForgot ? 'Reset Password' : isRegister ? 'Get Started' : 'Welcome Back'}</h1>
              <p>
                {showForgot
                  ? 'We will send a verification code to your email.'
                  : isRegister
                    ? 'Welcome to Certora - Let\'s create your account'
                    : 'Welcome to Certora - Let\'s login to your account'}
              </p>
            </div>

            {/* Form Alerts */}
            {errorMsg && (
              <div className="auth-alert-message alert-error-block">
                <ShieldAlert size={18} />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="auth-alert-message alert-success-block">
                <CheckCircle size={18} />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Forms */}
            {showForgot ? (
              <form className="auth-form-body" onSubmit={codeSent ? handleVerifyAndReset : handleSendResetCode}>
                <div className="form-group-item">
                  <label htmlFor="forgotEmail">Email Address</label>
                  <div className="field-wrapper">
                    <input
                      id="forgotEmail"
                      type="email"
                      placeholder="user@gmail.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      disabled={codeSent}
                      required
                    />
                  </div>
                </div>

                {codeSent && (
                  <>
                    <div className="form-group-item">
                      <label htmlFor="forgotCode">Verification Code</label>
                      <div className="field-wrapper">
                        <input
                          id="forgotCode"
                          type="text"
                          maxLength={6}
                          placeholder="Enter 6-digit code"
                          value={forgotCode}
                          onChange={(e) => setForgotCode(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="form-group-item">
                      <label htmlFor="forgotPassword">New Password</label>
                      <div className="field-wrapper">
                        <input
                          id="forgotPassword"
                          type="password"
                          placeholder="••••••••"
                          value={forgotPassword}
                          onChange={(e) => setForgotPassword(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  </>
                )}

                <button type="submit" className="submit-button" disabled={forgotLoading}>
                  {forgotLoading ? 'Processing...' : codeSent ? 'Reset Password' : 'Send Verification Code'}
                </button>

                <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                  <button
                    type="button"
                    className="toggle-link-btn"
                    onClick={() => {
                      setShowForgot(false);
                      setCodeSent(false);
                      setErrorMsg('');
                      setSuccessMsg('');
                    }}
                  >
                    Back to Log in
                  </button>
                </div>
              </form>
            ) : (
              <form className="auth-form-body" onSubmit={handleSubmit}>
                {isRegister && (
                  <div className="form-group-item">
                    <label htmlFor="regNum">User Name</label>
                    <div className="field-wrapper" style={fieldError === 'register_number' ? { borderColor: '#ef4444', borderRadius: '0.5rem', border: '1.5px solid #ef4444' } : {}}>
                      <input
                        id="regNum"
                        type="text"
                        placeholder="user_name"
                        value={registerNumber}
                        onChange={(e) => { setRegisterNumber(e.target.value); if (fieldError === 'register_number') setFieldError(''); }}
                        style={fieldError === 'register_number' ? { borderColor: '#ef4444' } : {}}
                        required
                      />
                    </div>
                    {fieldError === 'register_number' && (
                      <div style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '0.25rem', fontWeight: 600 }}>⚠ Username already taken — try a different one</div>
                    )}
                  </div>
                )}

                <div className="form-group-item">
                  <label htmlFor="email">Email or User_name</label>
                  <div className="field-wrapper" style={fieldError === 'email' ? { border: '1.5px solid #ef4444', borderRadius: '0.5rem' } : {}}>
                    <input
                      id="email"
                      type="text"
                      placeholder="hi@certora.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); if (fieldError === 'email') setFieldError(''); }}
                      style={fieldError === 'email' ? { borderColor: '#ef4444' } : {}}
                      required
                    />
                  </div>
                  {fieldError === 'email' && (
                    <div style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '0.25rem', fontWeight: 600 }}>⚠ Email already registered — use a different email</div>
                  )}
                </div>

                <div className="form-group-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <label htmlFor="password" style={{ margin: 0 }}>Password</label>
                    <button
                      type="button"
                      className="forgot-password-link"
                      onClick={() => {
                        setShowForgot(true);
                        setErrorMsg('');
                        setSuccessMsg('');
                      }}
                    >
                      Forgot?
                    </button>
                  </div>
                  <div className="field-wrapper password-field-wrapper">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="field-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {isRegister && (
                  <div className="form-group-item">
                    <label htmlFor="confirmPassword">Confirm Password</label>
                    <div className="field-wrapper">
                      <input
                        id="confirmPassword"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                )}

                <button type="submit" className="submit-button" disabled={loading}>
                  {loading ? 'Processing...' : isRegister ? 'Sign up' : 'Log in'}
                </button>
              </form>
            )}

            <div className="switch-mode-row">
              {isRegister ? (
                <span>
                  Already have an account?{' '}
                  <button type="button" className="mode-toggle-link" onClick={() => handleToggleMode(false)}>
                    Log in
                  </button>
                </span>
              ) : (
                <span>
                  Don't have an account?{' '}
                  <button type="button" className="mode-toggle-link" onClick={() => handleToggleMode(true)}>
                    Sign up
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Premium dark graphics panel nested with padding */}
        <div className="split-login-right-container">
          <div className="split-login-right">
            <div className="right-graphic-overlay"></div>
            <div className="right-graphic-content">
              <h2 className="hero-text">
                Enter the Future <br />
                <span className="italic-hero">of Credentials</span>, today
              </h2>

              {/* Floating Visual Elements Group — Dynamic Stats (Item 3) */}
              <div className="floating-elements-container">
                {/* Vertical floating toolbar */}
                <div className="floating-toolbar">
                  <div className="toolbar-icon active-tool">
                    <Award size={18} />
                  </div>
                  <div className="toolbar-dots">
                    <span></span>
                    <span></span>
                  </div>
                  <div className="toolbar-icon">
                    <Key size={18} />
                  </div>
                </div>

                {/* White primary credit/dashboard card — dynamic data */}
                <div className="floating-stats-card">
                  <div className="card-top-row">
                    <div className="card-logo-badge">
                      <Award size={16} color="var(--accent)" />
                    </div>
                  </div>

                  <div className="card-balance-section">
                    <h3 className="card-balance-value">
                      {liveStats.total_generated > 0 ? `${liveStats.total_generated}` : '0'} Active
                    </h3>
                    <p className="card-balance-label">Certificates Generated</p>
                  </div>

                  <div className="card-bottom-row">
                    <div className="card-meta">
                      <span className="card-meta-title">Platform Users</span>
                      <span className="card-meta-number">
                        {liveStats.users_count > 0
                          ? `${liveStats.users_count} registered`
                          : 'Secure Console'}
                      </span>
                    </div>
                    <div className="card-type-badge">LIVE</div>
                  </div>

                  <div className="card-view-all-btn">
                    <span>Platform Stats</span>
                  </div>
                </div>
              </div>

              {/* Floating bottom logo icon */}
              <div className="bottom-floating-logo">
                <Award size={24} color="#fff" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
