import { Link } from 'react-router-dom'
import { User, Building2, Code2, Check, Zap, Banknote, Shield, Scan } from 'lucide-react'
import './Landing.css'

export default function HomePage() {
  const PERSONAL_APP_URL = 'https://www.personal.vireofinance.app'
  const MERCHANT_APP_URL = 'https://www.merchant.vireofinance.app'

  return (
    <div className="landing">
      {/* Hero */}
      <div className="hero">
        <div className="glow glow-1" />
        <div className="glow glow-2" />
        
        <div className="inner">
          <nav className="nav fade-in">
            <img src="/logo-light.png" alt="Vireo Finance" className="logo-img" />
            <div className="nav-pill">
              <Link to="/personal" className="nav-item">Personal</Link>
              <Link to="/merchant" className="nav-item">Business</Link>
              <Link to="/developers" className="nav-item">Developers</Link>
            </div>
            <div className="nav-actions">
              <a href={PERSONAL_APP_URL} className="nav-link">Sign in</a>
            </div>
          </nav>

          <div className="hero-body">
            <div className="hero-text">
              <h1 className="headline fade-in-delay-1">
                Financial infrastructure <span className="accent">built on biometrics.</span>
              </h1>
              <div className="underline" />
              <p className="sub fade-in-delay-2">
                Payments approved by your face or fingerprint. No passwords, no PINs to remember. Money that moves only when you say so.
              </p>
              <div className="cta-row fade-in-delay-3">
                <Link to="/personal" className="btn btn-accent">For individuals</Link>
                <Link to="/merchant" className="btn btn-secondary">For businesses</Link>
              </div>
            </div>

            <div className="art-wrap">
              <div className="orb pulse">
                <div className="orb-inner" />
              </div>
              <div className="twinkle twinkle-1" />
              <div className="twinkle twinkle-2" />
              <div className="twinkle twinkle-3" />
              <div className="card-stack float">
                <div className="card-back" />
                <div className="glass-card">
                  <div className="card-top">
                    <img src="/icon-mark.png" alt="Vireo" className="card-logo-img" />
                    <div className="card-chip">INFRASTRUCTURE</div>
                  </div>
                  <div className="card-glyph">₦</div>
                  <div className="card-foot">Biometric payments for Nigeria</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Product Grid */}
      <div className="inner">
        <div className="grid">
          <div className="card rise">
            <div className="card-head">
              <div className="icon"><User size={24} /></div>
            </div>
            <h3 className="card-title">Personal Banking</h3>
            <p className="card-body">
              Send money, get paid, and approve payments with your fingerprint or face. One wallet for everyday money.
            </p>
            <div style={{ marginTop: 'auto', paddingTop: '1.5rem' }}>
              <Link to="/personal" className="btn btn-primary btn-small">Learn more</Link>
            </div>
          </div>

          <div className="card rise">
            <div className="card-head">
              <div className="icon"><Building2 size={24} /></div>
            </div>
            <h3 className="card-title">Merchant Solutions</h3>
            <p className="card-body">
              Take payments via QR codes and biometric verification. Get paid instantly, cash out to your bank.
            </p>
            <div style={{ marginTop: 'auto', paddingTop: '1.5rem' }}>
              <Link to="/merchant" className="btn btn-primary btn-small">Learn more</Link>
            </div>
          </div>

          <div className="card rise">
            <div className="card-head">
              <div className="icon"><Code2 size={24} /></div>
              <div className="tag">COMING SOON</div>
            </div>
            <h3 className="card-title">Developer API</h3>
            <p className="card-body">
              Add biometric payment infrastructure to your app. Face-based identification and payments via simple APIs.
            </p>
            <div style={{ marginTop: 'auto', paddingTop: '1.5rem' }}>
              <Link to="/developers" className="btn btn-primary btn-small">Explore API</Link>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="inner">
        <div className="rise">
          <h2 className="section-title">Built for security and simplicity</h2>
          <p className="section-sub">Biometric authentication at every step, with you in complete control.</p>
        </div>
        <div className="grid">
          <div className="sec-item rise">
            <div className="sec-icon"><Check size={28} /></div>
            <div>
              <h3 className="sec-title">Your biometrics, your device</h3>
              <p className="sec-body">Every payment signed on your phone, unlocked by your face or fingerprint. Nothing moves without your approval.</p>
            </div>
          </div>
          <div className="sec-item rise">
            <div className="sec-icon"><Zap size={28} /></div>
            <div>
              <h3 className="sec-title">Instant payments</h3>
              <p className="sec-body">Send to any Nigerian bank or Vireo user. Money arrives instantly with full transaction history.</p>
            </div>
          </div>
          <div className="sec-item rise">
            <div className="sec-icon"><Banknote size={28} /></div>
            <div>
              <h3 className="sec-title">Transparent fees</h3>
              <p className="sec-body">₦0 for Vireo-to-Vireo transfers, ₦100 flat to any Nigerian bank. No hidden charges.</p>
            </div>
          </div>
          <div className="sec-item rise">
            <div className="sec-icon"><Scan size={28} /></div>
            <div>
              <h3 className="sec-title">Face-only payments</h3>
              <p className="sec-body">Pay at merchant terminals with just your face. Opt-in consent with data deletion controls.</p>
            </div>
          </div>
          <div className="sec-item rise">
            <div className="sec-icon"><Shield size={28} /></div>
            <div>
              <h3 className="sec-title">Bank-grade security</h3>
              <p className="sec-body">End-to-end encryption, AML monitoring, and fraud detection protect every transaction.</p>
            </div>
          </div>
          <div className="sec-item rise">
            <div className="sec-icon"><Code2 size={28} /></div>
            <div>
              <h3 className="sec-title">API for developers</h3>
              <p className="sec-body">Build biometric payments into your app with our simple REST API and native SDKs.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Closing */}
      <div className="inner">
        <div className="closing rise">
          <div className="twinkle-closing twinkle-closing-1" />
          <div className="twinkle-closing twinkle-closing-2" />
          <h2 className="closing-title">Ready to experience the future of payments?</h2>
          <p className="closing-sub">Choose your product to get started.</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
            <a href={PERSONAL_APP_URL} className="btn btn-primary">Personal app</a>
            <a href={MERCHANT_APP_URL} className="btn btn-secondary">Business app</a>
          </div>
        </div>
      </div>

      <div className="inner">
        <p className="footer">© {new Date().getFullYear()} Vireo Finance</p>
      </div>
    </div>
  )
}
