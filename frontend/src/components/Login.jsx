import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Key, Mail, User, ShieldAlert, CheckCircle, Award } from 'lucide-react';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Form Fields
  const [registerNumber, setRegisterNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

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

  const navigate = useNavigate();

  const handleToggleMode = (mode) => {
    setIsRegister(mode);
    setShowForgot(false);
    setCodeSent(false);
    setErrorMsg('');
    setSuccessMsg('');
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
        throw new Error(data.error || 'Authentication failed.');
      }

      if (isRegister) {
        setSuccessMsg('Registration successful! Please sign in.');
        setIsRegister(false);
        setPassword('');
        setConfirmPassword('');
      } else {
        localStorage.setItem('user', JSON.stringify(data.user));
        navigate('/dashboard');
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
        {/* Left Pane - Dark Teal branding and description message */}
        <div className="split-login-left">
          <div className="left-brand-wrapper">
            <div className="brand-logo-row">
              <Award className="certora-logo" size={32} />
              <span className="certora-title">Certora</span>
            </div>

            <div className="brand-message-block">
              <h2>Secure Certificate Platform</h2>
              <p>
                Instantly generate, secure, verify, and distribute academic and professional credentials using decentralized blockchain ledger verification.
              </p>
            </div>
          </div>

          <div className="left-footer-row">
            Certora Systems &copy; {new Date().getFullYear()}
          </div>
        </div>

        {/* Right Pane - Sleek interactive form on Light Background */}
        <div className="split-login-right">
          <div className="right-form-wrapper">

            {/* Mode Selector Pill */}
            <div className="toggle-pill-row">
              <div className="toggle-pill-container">
                <button
                  type="button"
                  className={`toggle-pill-btn ${!isRegister && !showForgot ? 'active' : ''}`}
                  onClick={() => handleToggleMode(false)}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className={`toggle-pill-btn ${isRegister ? 'active' : ''}`}
                  onClick={() => handleToggleMode(true)}
                >
                  Register
                </button>
              </div>
            </div>

            <div className="form-heading">
              <h1>{showForgot ? 'Reset Password' : isRegister ? 'Create Account' : 'Welcome Back'}</h1>
              <p>
                {showForgot 
                  ? 'We will send a verification code to your email.' 
                  : isRegister 
                    ? 'Enter your credentials to register.' 
                    : 'Sign in to access your certificate dashboard.'}
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

            {/* Interactive Forms */}
            {showForgot ? (
              <form className="auth-form-body" onSubmit={codeSent ? handleVerifyAndReset : handleSendResetCode}>
                <div className="form-group-item">
                  <label htmlFor="forgotEmail">Registered Email</label>
                  <div className="field-wrapper">
                    <Mail className="field-icon" size={18} />
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
                        <Key className="field-icon" size={18} />
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
                        <Key className="field-icon" size={18} />
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

                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600' }}
                    onClick={() => {
                      setShowForgot(false);
                      setCodeSent(false);
                      setErrorMsg('');
                      setSuccessMsg('');
                    }}
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            ) : (
              <form className="auth-form-body" onSubmit={handleSubmit}>
                {isRegister && (
                  <div className="form-group-item">
                    <label htmlFor="regNum">User Name</label>
                    <div className="field-wrapper">
                      <User className="field-icon" size={18} />
                      <input
                        id="regNum"
                        type="text"
                        placeholder="user_name"
                        value={registerNumber}
                        onChange={(e) => setRegisterNumber(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="form-group-item">
                  <label htmlFor="email">Email Address</label>
                  <div className="field-wrapper">
                    <Mail className="field-icon" size={18} />
                    <input
                      id="email"
                      type="text"
                      placeholder="user@gmail.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group-item">
                  <label htmlFor="password">Password</label>
                  <div className="field-wrapper">
                    <Key className="field-icon" size={18} />
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
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {!isRegister && (
                  <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: '#0f766e', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600' }}
                      onClick={() => {
                        setShowForgot(true);
                        setErrorMsg('');
                        setSuccessMsg('');
                      }}
                    >
                      Forgot Password?
                    </button>
                  </div>
                )}

                {isRegister && (
                  <div className="form-group-item">
                    <label htmlFor="confirmPassword">Confirm Password</label>
                    <div className="field-wrapper">
                      <Key className="field-icon" size={18} />
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
                  {loading ? 'Processing...' : isRegister ? 'Register' : 'Sign In'}
                </button>
              </form>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
