import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  Scan, Zap, Banknote, Shield, Bell, Code2,
  Store, Car, Package, Building2, Hotel, Ticket,
  Check, Loader2, Mail
} from 'lucide-react'
import './Landing.css'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3050/api/v1'

export default function DevelopersPage() {
  const [scrollY, setScrollY] = useState(0)
  const [viewport, setViewport] = useState(800)
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [useCase, setUseCase] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY)
    const handleResize = () => setViewport(window.innerHeight)
    
    window.addEventListener('scroll', handleScroll)
    window.addEventListener('resize', handleResize)
    handleResize()
    
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const scrollTo = (key: string) => {
    sectionRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/developers/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, company, useCase })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Failed to join waitlist')
      }

      setSubmitted(true)
      setEmail('')
      setCompany('')
      setUseCase('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const visibleBottom = scrollY + viewport

  return (
    <div className="landing">
      {/* Hero */}
      <div className="hero">
        <div className="glow glow-1" />
        <div className="glow glow-2" />
        
        <div className="inner">
          <nav className="nav fade-in">
            <Link to="/">
              <img src="/logo-light.png" alt="Vireo Finance" className="logo-img" />
            </Link>
            <div className="nav-pill">
              <button onClick={() => scrollTo('features')} className="nav-item">Features</button>
              <button onClick={() => scrollTo('integration')} className="nav-item">Integration</button>
              <button onClick={() => scrollTo('use-cases')} className="nav-item">Use cases</button>
            </div>
            <div className="nav-actions">
              <Link to="/personal" className="nav-link">Personal</Link>
              <Link to="/merchant" className="nav-link">Business</Link>
            </div>
          </nav>

          <div className="hero-body">
            <div className="hero-text">
              <div className="tag" style={{ marginBottom: '1.5rem' }}>COMING SOON</div>
              <h1 className="headline fade-in-delay-1">
                Biometric payment <span className="accent">infrastructure</span> for your app.
              </h1>
              <div className="underline" />
              <p className="sub fade-in-delay-2">
                Add face-based identification and payments to your application in minutes. One API for enrollment, verification, and transactions—no biometric data handling required.
              </p>
              <div className="cta-row fade-in-delay-3">
                <button onClick={() => scrollTo('waitlist')} className="btn btn-accent">
                  Join waitlist
                </button>
                <button onClick={() => scrollTo('integration')} className="btn btn-secondary">
                  See how it works
                </button>
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
                <div className="glass-card" style={{ padding: '1.5rem' }}>
                  <div className="card-top">
                    <div className="card-chip">API</div>
                  </div>
                  <pre style={{ 
                    fontSize: '0.75rem', 
                    margin: '1rem 0',
                    color: 'rgba(255,255,255,0.8)',
                    textAlign: 'left',
                    lineHeight: '1.4'
                  }}>
{`// Enroll user
await vireo.enroll({
  phone: "+234...",
  bvn: "...",
  face: imageBase64
});

// Authorize payment
const result = 
  await vireo.authorize({
    face: captureBase64,
    amount: 5000
  });`}
                  </pre>
                  <div className="card-foot">Simple. Secure. Scalable.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="inner">
        <div className={`facts ${visibleBottom > 800 ? 'rise' : ''}`}>
          <div className="fact">
            <div className="fact-value">3 calls</div>
            <div className="fact-label">Enroll, identify, and authorize</div>
          </div>
          <div className="fact">
            <div className="fact-value">1:N</div>
            <div className="fact-label">Face search across your users</div>
          </div>
          <div className="fact">
            <div className="fact-value">Zero</div>
            <div className="fact-label">Biometric data you handle</div>
          </div>
          <div className="fact">
            <div className="fact-value">REST</div>
            <div className="fact-label">Simple HTTP API + webhooks</div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div ref={(el) => { sectionRefs.current.features = el }} className="inner">
        <div className={visibleBottom > 1200 ? 'rise' : ''}>
          <h2 className="section-title">Everything you need to build biometric payments</h2>
          <p className="section-sub">Infrastructure that handles identity verification, biometric enrollment, face matching, and payment authorization.</p>
        </div>
        <div className="grid">
          <div className={`card ${visibleBottom > 1400 ? 'rise' : ''}`}>
            <div className="card-head">
              <div className="icon"><Scan size={24} /></div>
            </div>
            <h3 className="card-title">Biometric enrollment</h3>
            <p className="card-body">
              Enroll users with BVN verification and face capture. We handle liveness detection, encryption, and secure storage.
            </p>
          </div>
          <div className={`card ${visibleBottom > 1450 ? 'rise' : ''}`}>
            <div className="card-head">
              <div className="icon"><Zap size={24} /></div>
            </div>
            <h3 className="card-title">Face-only identification</h3>
            <p className="card-body">
              1:N face search finds users without phone numbers. Perfect for POS terminals and deviceless payments.
            </p>
          </div>
          <div className={`card ${visibleBottom > 1500 ? 'rise' : ''}`}>
            <div className="card-head">
              <div className="icon"><Banknote size={24} /></div>
            </div>
            <h3 className="card-title">Payment authorization</h3>
            <p className="card-body">
              Authorize transactions with biometric verification. Face + phone (1:1) or face-only (1:N) modes supported.
            </p>
          </div>
          <div className={`card ${visibleBottom > 1550 ? 'rise' : ''}`}>
            <div className="card-head">
              <div className="icon"><Shield size={24} /></div>
            </div>
            <h3 className="card-title">Compliance built-in</h3>
            <p className="card-body">
              NDPR-compliant biometric handling, AML checks, and KYC verification through Nigerian BVN.
            </p>
          </div>
          <div className={`card ${visibleBottom > 1600 ? 'rise' : ''}`}>
            <div className="card-head">
              <div className="icon"><Bell size={24} /></div>
            </div>
            <h3 className="card-title">Real-time webhooks</h3>
            <p className="card-body">
              Get instant notifications for payment confirmations, failed transactions, and enrollment completions.
            </p>
          </div>
          <div className={`card ${visibleBottom > 1650 ? 'rise' : ''}`}>
            <div className="card-head">
              <div className="icon"><Code2 size={24} /></div>
            </div>
            <h3 className="card-title">SDK + REST API</h3>
            <p className="card-body">
              Native SDKs for React Native, iOS, and Android. Or use the REST API from any platform.
            </p>
          </div>
        </div>
      </div>

      {/* Integration */}
      <div ref={(el) => { sectionRefs.current.integration = el }} className="inner">
        <div className={visibleBottom > 2200 ? 'rise' : ''}>
          <h2 className="section-title">Simple integration</h2>
          <p className="section-sub">Three endpoints. Unlimited possibilities.</p>
        </div>
        <div className="grid">
          <div className={`step ${visibleBottom > 2400 ? 'rise' : ''}`}>
            <div className="step-num">01</div>
            <h3 className="card-title">Enroll users</h3>
            <p className="card-body">Submit BVN, phone number, and face image. We verify identity and store encrypted biometric templates.</p>
            <pre style={{ 
              fontSize: '0.75rem', 
              marginTop: '1rem',
              padding: '1rem',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '8px',
              overflow: 'auto'
            }}>
{`POST /api/v1/partner/users/enroll
{
  "externalUserId": "customer_123",
  "phone": "+2348012345678",
  "bvn": "22222222222",
  "faceImage": "data:image/jpeg;base64,..."
}

Response: {
  "vireoUserId": "uuid",
  "enrolled": true,
  "kycTier": 1
}`}
            </pre>
          </div>
          <div className={`step ${visibleBottom > 2450 ? 'rise' : ''}`}>
            <div className="step-num">02</div>
            <h3 className="card-title">Identify by face</h3>
            <p className="card-body">Search for a user across your enrolled base using only their face. Returns match confidence scores.</p>
            <pre style={{ 
              fontSize: '0.75rem', 
              marginTop: '1rem',
              padding: '1rem',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '8px',
              overflow: 'auto'
            }}>
{`POST /api/v1/partner/identify
{
  "faceImage": "data:image/jpeg;base64,...",
  "minMatchScore": 85
}

Response: {
  "identified": true,
  "userId": "uuid",
  "matchScore": 92,
  "livenessScore": 98
}`}
            </pre>
          </div>
          <div className={`step ${visibleBottom > 2500 ? 'rise' : ''}`}>
            <div className="step-num">03</div>
            <h3 className="card-title">Authorize payment</h3>
            <p className="card-body">Complete a transaction with face verification. Choose 1:1 (with phone) or 1:N (face-only) mode.</p>
            <pre style={{ 
              fontSize: '0.75rem', 
              marginTop: '1rem',
              padding: '1rem',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '8px',
              overflow: 'auto'
            }}>
{`POST /api/v1/partner/payments/authorize
{
  "faceImage": "data:image/jpeg;base64,...",
  "amountMinor": 150000,
  "merchantId": "shop_001",
  "reference": "TXN-20261120-001"
}

Response: {
  "authorized": true,
  "transactionId": "uuid",
  "userId": "uuid",
  "status": "completed"
}`}
            </pre>
          </div>
        </div>
      </div>

      {/* Use Cases */}
      <div ref={(el) => { sectionRefs.current['use-cases'] = el }} className="security-band">
        <div className="glow glow-security" />
        <div className="inner">
          <div className={visibleBottom > 3000 ? 'rise' : ''}>
            <h2 className="section-title">Built for real-world use cases</h2>
            <p className="section-sub">From retail POS to ride-hailing, government services to e-commerce.</p>
          </div>
          <div className="grid">
            <div className={`sec-item ${visibleBottom > 3200 ? 'rise' : ''}`}>
              <div className="sec-icon"><Store size={28} /></div>
              <div>
                <h3 className="sec-title">Retail & POS</h3>
                <p className="sec-body">Shoppers pay with their face at checkout terminals. No phone, no card, no cash needed.</p>
              </div>
            </div>
            <div className={`sec-item ${visibleBottom > 3250 ? 'rise' : ''}`}>
              <div className="sec-icon"><Car size={28} /></div>
              <div>
                <h3 className="sec-title">Ride-hailing</h3>
                <p className="sec-body">Passengers authorize trip payments with a selfie. Drivers get paid instantly without card details.</p>
              </div>
            </div>
            <div className={`sec-item ${visibleBottom > 3300 ? 'rise' : ''}`}>
              <div className="sec-icon"><Package size={28} /></div>
              <div>
                <h3 className="sec-title">E-commerce delivery</h3>
                <p className="sec-body">Pay-on-delivery with face verification. Delivery agents confirm customer identity at the door.</p>
              </div>
            </div>
            <div className={`sec-item ${visibleBottom > 3350 ? 'rise' : ''}`}>
              <div className="sec-icon"><Building2 size={28} /></div>
              <div>
                <h3 className="sec-title">Government services</h3>
                <p className="sec-body">Citizens pay for licenses and permits with NIN + face verification. Instant identity confirmation.</p>
              </div>
            </div>
            <div className={`sec-item ${visibleBottom > 3400 ? 'rise' : ''}`}>
              <div className="sec-icon"><Hotel size={28} /></div>
              <div>
                <h3 className="sec-title">Hospitality</h3>
                <p className="sec-body">Hotel guests check in and pay with face recognition. Seamless experience without physical cards.</p>
              </div>
            </div>
            <div className={`sec-item ${visibleBottom > 3450 ? 'rise' : ''}`}>
              <div className="sec-icon"><Ticket size={28} /></div>
              <div>
                <h3 className="sec-title">Events & ticketing</h3>
                <p className="sec-body">Attendees enter venues and make purchases with face authentication. No tickets to lose.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing teaser */}
      <div className="inner">
        <div className={visibleBottom > 3800 ? 'rise' : ''}>
          <h2 className="section-title">Transparent pricing</h2>
          <p className="section-sub">Pay only for what you use, with no upfront costs or monthly minimums.</p>
        </div>
        <div className={`facts ${visibleBottom > 3900 ? 'rise' : ''}`} style={{ marginTop: '3rem' }}>
          <div className="fact">
            <div className="fact-value">₦50</div>
            <div className="fact-label">Per user enrollment</div>
          </div>
          <div className="fact">
            <div className="fact-value">1.5%</div>
            <div className="fact-label">Per successful transaction</div>
          </div>
          <div className="fact">
            <div className="fact-value">Free</div>
            <div className="fact-label">First 1,000 transactions</div>
          </div>
          <div className="fact">
            <div className="fact-value">₦0</div>
            <div className="fact-label">Monthly fees during pilot</div>
          </div>
        </div>
      </div>

      {/* Waitlist Form */}
      <div ref={(el) => { sectionRefs.current.waitlist = el }} className="inner">
        <div className={`closing ${visibleBottom > 4200 ? 'rise' : ''}`}>
          <div className="twinkle-closing twinkle-closing-1" />
          <div className="twinkle-closing twinkle-closing-2" />
          <h2 className="closing-title">Ready to build the future of payments?</h2>
          <p className="closing-sub">Join the waitlist for early access to the Vireo API.</p>
          
          {!submitted ? (
            <form onSubmit={handleWaitlistSubmit} style={{ 
              maxWidth: '500px', 
              margin: '2rem auto', 
              textAlign: 'left' 
            }}>
              <div style={{ marginBottom: '1rem' }}>
                <input
                  type="email"
                  placeholder="Your work email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.875rem 1rem',
                    fontSize: '1rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    outline: 'none'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <input
                  type="text"
                  placeholder="Company name"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.875rem 1rem',
                    fontSize: '1rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    outline: 'none'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <textarea
                  placeholder="Tell us about your use case (optional)"
                  value={useCase}
                  onChange={(e) => setUseCase(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.875rem 1rem',
                    fontSize: '1rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                />
              </div>
              {error && (
                <p style={{ color: '#ff6b6b', marginBottom: '1rem', fontSize: '0.875rem' }}>
                  {error}
                </p>
              )}
              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={loading}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    <Mail size={18} />
                    Join waitlist
                  </>
                )}
              </button>
            </form>
          ) : (
            <div style={{ 
              maxWidth: '500px', 
              margin: '2rem auto',
              padding: '2rem',
              background: 'rgba(76, 175, 80, 0.1)',
              border: '1px solid rgba(76, 175, 80, 0.3)',
              borderRadius: '12px'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ 
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '60px',
                  height: '60px',
                  background: 'rgba(76, 175, 80, 0.2)',
                  borderRadius: '50%',
                  marginBottom: '1rem'
                }}>
                  <Check size={32} color="#4caf50" />
                </div>
                <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>You're on the list!</h3>
                <p style={{ opacity: 0.8 }}>
                  We'll send you updates about the Vireo API launch and exclusive early access opportunities.
                </p>
              </div>
            </div>
          )}
          
          <p style={{ marginTop: '2rem', fontSize: '0.875rem', opacity: 0.7 }}>
            API launching Q1 2027. Pilot partners accepted on rolling basis.
          </p>
        </div>
      </div>

      <div className="inner">
        <p className="footer">© {new Date().getFullYear()} Vireo Finance</p>
      </div>

      <style>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
