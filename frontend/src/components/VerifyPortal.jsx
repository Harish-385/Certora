import React, { useState, useEffect } from 'react';
import ThemeToggle from './ThemeToggle';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import jsQR from 'jsqr';
import { Award, Loader, CheckCircle, AlertTriangle } from './SvgIcons';

export default function VerifyPortal({ theme, toggleTheme }) {
  const { unique_id } = useParams();
  const navigate = useNavigate();
  const [certId, setCertId] = useState(unique_id || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  // QR Analytics (Item 8)
  const [qrAnalytics, setQrAnalytics] = useState(null);
  const [showQrAnalytics, setShowQrAnalytics] = useState(false);

  useEffect(() => {
    if (unique_id) {
      handleVerify(unique_id);
    }
  }, [unique_id]);

  const handleVerify = async (idToVerify) => {
    const targetId = (idToVerify || certId).trim().toUpperCase();
    if (!targetId) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await axios.get(`http://${window.location.hostname}:5000/api/verify/${targetId}`);
      setResult(res.data);
      if (idToVerify !== unique_id) {
        navigate(`/verify/${targetId}`, { replace: true });
      }
      // Fetch QR analytics for this cert (Item 8)
      axios.get(`http://${window.location.hostname}:5000/api/qr-analytics/${targetId}`)
        .then(r => setQrAnalytics(r.data))
        .catch(() => {});
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Fast path: if ID is in filename
    const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.'));
    const match = nameWithoutExt.match(/([A-Z0-9]{10})$/i) || nameWithoutExt.split('_').pop();
    if (typeof match === 'string' && match.length === 10 && /^[A-Z0-9]{10}$/i.test(match)) {
       setCertId(match.toUpperCase());
       handleVerify(match.toUpperCase());
       return;
    }

    // Otherwise, scan the QR code from image
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        context.drawImage(img, 0, 0, img.width, img.height);
        const imageData = context.getImageData(0, 0, img.width, img.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        
        if (code) {
           // The QR code contains the URL, e.g., http://.../verify/A9B8C7D6E5
           const parts = code.data.split('/');
           const parsedId = parts[parts.length - 1];
           if (parsedId && parsedId.length === 10) {
              setCertId(parsedId.toUpperCase());
              handleVerify(parsedId.toUpperCase());
           } else {
              setError("QR Code scanned, but no valid Certificate ID found inside it.");
           }
        } else {
           setError("Could not auto-detect ID from file name, and could not find a valid QR code in the image. Please manually enter the 10-character ID below.");
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const startMockScanner = () => {
    setScannerActive(true);
    setScanProgress(0);
    setError(null);
    
    const interval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setScannerActive(false);
          const demoId = certId || 'SAMPLE123';
          setCertId(demoId);
          handleVerify(demoId);
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  return (
    <div className="verify-portal-container" style={{
      minHeight: '100vh',
      position: 'relative',
      background: 'radial-gradient(circle at top right, #1e2e30, #12191a)',
      color: 'var(--text-primary)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1.5rem',
      fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{ position: 'absolute', top: '1.5rem', right: '2rem', zIndex: 100 }}>
        <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
      </div>
      <div className="verify-card" style={{
        maxWidth: '680px',
        width: '100%',
        borderRadius: '1.75rem',
        padding: '3.5rem 3rem',
        textAlign: 'center'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--accent), #e2b294)',
            padding: '1rem',
            borderRadius: '1rem',
            boxShadow: '0 10px 25px rgba(200, 159, 132, 0.2)'
          }}>
            <Award size={36} style={{ color: '#12191a' }} />
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.03em', margin: 0 }}>
            Certora Verification Portal
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: 0 }}>
            Verify the authenticity of academic & professional credentials on-chain
          </p>
        </div>

        {/* Action Panel */}
        {!result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Scanner */}
            {scannerActive ? (
              <div className="scanner-box">
                <div className="scanner-laser" />
                <span style={{ color: '#38bdf8', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.15em', textTransform: 'uppercase', textShadow: '0 0 10px rgba(56, 189, 248, 0.5)', zIndex: 10 }}>
                  Scanning Identity... {scanProgress}%
                </span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <button className="premium-btn" onClick={startMockScanner} style={{ padding: '1rem' }}>
                  📷 Scan QR Code
                </button>
                <label className="premium-btn" style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: '1rem',
                  
                }}>
                  📤 Upload Certificate
                  <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', margin: '0.5rem 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              <span style={{ padding: '0 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>OR ENTER CERTIFICATE ID</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>

            {/* Form Input */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input
                type="text"
                placeholder="e.g. A9B8C7D6E5"
                value={certId}
                onChange={e => setCertId(e.target.value)}
                maxLength={10}
                className="sleek-input"
                style={{
                  flex: 1,
                  textAlign: 'center',
                  letterSpacing: '0.2em',
                  fontSize: '1.1rem',
                  textTransform: 'uppercase'
                }}
              />
              <button
                className="premium-btn"
                onClick={() => handleVerify()}
                disabled={loading || !certId.trim()}
                style={{ minWidth: '120px' }}
              >
                {loading ? <Loader className="spin" size={18} /> : 'Verify'}
              </button>
            </div>
          </div>
        )}

        {/* Loader */}
        {loading && (
          <div style={{ padding: '3rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <Loader className="spin" size={40} style={{ color: 'var(--accent)' }} />
            <p style={{ color: 'var(--text-secondary)' }}>Verifying blockchain registries...</p>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div style={{
            marginTop: '1.5rem',
            padding: '1rem 1.25rem',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '0.75rem',
            color: '#F87171',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            textAlign: 'left'
          }}>
            <AlertTriangle size={20} />
            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{error}</span>
          </div>
        )}

        {/* Verification Result Display */}
        {result && (
          <div style={{ animation: 'fadeIn 0.4s ease', textAlign: 'left', marginTop: '1rem' }}>
            {/* Status Card */}
            <div className={`result-card ${result.is_valid ? 'result-valid' : 'result-invalid'}`} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '2rem'
            }}>
              <div>
                <h3 style={{
                  color: result.is_valid ? '#10B981' : '#EF4444',
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  margin: '0 0 0.25rem 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  {result.is_valid ? '✔ Genuine & Valid' : '✗ Invalid Certificate'}
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', margin: 0 }}>
                  {result.is_valid ? 'This credential matches the cryptographically verified contract state.' : 'This ID does not map to any active certificate.'}
                </p>
              </div>
              <div style={{
                background: result.is_valid ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: result.is_valid ? '#10B981' : '#EF4444',
                padding: '0.5rem 1rem',
                borderRadius: '2rem',
                fontWeight: 800,
                fontSize: '0.75rem',
                letterSpacing: '0.05em',
                textTransform: 'uppercase'
              }}>
                Verified {result.verification_count} times
              </div>
            </div>

            {/* Grid Detail Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', paddingBottom: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Recipient</span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{result.recipient}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', paddingBottom: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Issued By</span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{result.issued_by}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', paddingBottom: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Issued Date</span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{result.issued_date}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', paddingBottom: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Blockchain Hash</span>
                <span style={{ fontFamily: 'monospace', wordBreak: 'break-all', fontSize: '0.85rem', color: '#6366F1' }}>{result.blockchain_hash}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', paddingBottom: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Transaction ID</span>
                <span style={{ fontFamily: 'monospace', wordBreak: 'break-all', fontSize: '0.85rem', color: '#3b82f6' }}>{result.transaction_id}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', paddingBottom: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Template Category</span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{result.template}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', paddingBottom: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Last Verified</span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{new Date(result.last_verified).toLocaleString()}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', paddingBottom: '0.85rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Digital Signature</span>
                <span style={{ fontFamily: 'monospace', wordBreak: 'break-all', fontSize: '0.8rem', color: '#10B981' }}>{result.digital_signature}</span>
              </div>
            </div>

            {/* Back Button */}
            <button className="premium-btn" onClick={() => { setResult(null); setQrAnalytics(null); navigate('/verify', { replace: true }); }} style={{ width: '100%', marginTop: '2rem' }}>
              Verify Another Certificate
            </button>

            {/* QR Analytics Panel (Item 8) */}
            {qrAnalytics && qrAnalytics.total_scans > 0 && (
              <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div>
                    <h4 style={{ margin: 0, fontWeight: 800, fontSize: '0.95rem' }}>📡 QR Scan Analytics</h4>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{qrAnalytics.total_scans} total scans recorded</p>
                  </div>
                  <button onClick={() => setShowQrAnalytics(p => !p)} style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.3rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', color: 'var(--text-primary)' }}>
                    {showQrAnalytics ? 'Hide' : 'Show Details'}
                  </button>
                </div>

                {/* Aggregate summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                  {[
                    { label: 'Countries', value: Object.keys(qrAnalytics.countries || {}).length, icon: '🌍', color: '#3B82F6' },
                    { label: 'Devices', value: Object.keys(qrAnalytics.devices || {}).length + ' types', icon: '📱', color: '#8B5CF6' },
                    { label: 'Browsers', value: Object.keys(qrAnalytics.browsers || {}).length + ' types', icon: '🌐', color: '#10B981' },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.85rem 1rem' }}>
                      <div style={{ fontSize: '1.2rem' }}>{s.icon}</div>
                      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: s.color, marginTop: '0.3rem' }}>{s.value}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {showQrAnalytics && (
                  <>
                    {/* Country Breakdown */}
                    {Object.keys(qrAnalytics.countries || {}).length > 0 && (
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Countries</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {Object.entries(qrAnalytics.countries).map(([country, count]) => (
                            <span key={country} style={{ padding: '0.25rem 0.6rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '1rem', fontSize: '0.72rem', fontWeight: 700, color: '#3B82F6' }}>
                              {country} · {count}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Device Breakdown */}
                    {Object.keys(qrAnalytics.devices || {}).length > 0 && (
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Devices</div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {Object.entries(qrAnalytics.devices).map(([device, count]) => (
                            <span key={device} style={{ padding: '0.25rem 0.6rem', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '1rem', fontSize: '0.72rem', fontWeight: 700, color: '#8B5CF6' }}>
                              {device === 'Mobile' ? '📱' : device === 'Tablet' ? '📟' : '🖥'} {device} · {count}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Browser Breakdown */}
                    {Object.keys(qrAnalytics.browsers || {}).length > 0 && (
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Browsers</div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {Object.entries(qrAnalytics.browsers).map(([browser, count]) => (
                            <span key={browser} style={{ padding: '0.25rem 0.6rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '1rem', fontSize: '0.72rem', fontWeight: 700, color: '#10B981' }}>
                              🌐 {browser} · {count}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Scan Event List */}
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Recent Scans</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '220px', overflowY: 'auto' }}>
                        {qrAnalytics.events.slice(0, 20).map((ev, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: '0.5rem', fontSize: '0.75rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{ev.country || '?'}</span>
                              <span style={{ color: 'var(--text-secondary)' }}>{ev.city && ev.city !== ev.country ? ev.city : ''}</span>
                              <span style={{ padding: '0.1rem 0.4rem', background: 'rgba(139,92,246,0.1)', borderRadius: '0.3rem', color: '#8B5CF6', fontWeight: 600 }}>{ev.device}</span>
                              <span style={{ color: 'var(--text-secondary)' }}>{ev.browser}</span>
                            </div>
                            <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>
                              {ev.scanned_at ? new Date(ev.scanned_at).toLocaleString() : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
