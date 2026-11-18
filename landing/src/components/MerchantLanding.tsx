import { useEffect, useRef, useState } from 'react'
import './Landing.css'

interface Props {
  onSwitch: () => void
}

export default function MerchantLanding({ onSwitch }: Props) {
  const [scrollY, setScrollY] = useState(0)
  const [viewport, setViewport] = useState(800)
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

  const visibleBottom = scrollY + viewport

  const MERCHANT_APP_URL = 'https://vireo-merchant.vercel.app'

  const content = {
    headline: { before: 'Get paid the way', highlight: 'your customers', after: 'pay.' },
    sub: "Create a payment request in seconds, show a QR code, and watch the money arrive in your balance. Cash out to your bank when you're ready.",
    primaryCta: 'Create business account',
    secondaryCta: 'Sign in',
    cardLabel: 'Business',
    facts: [
      { value: '5 min', label: 'Default life of a payment request' },
      { value: 'Live', label: 'Order status as customers pay' },
      { value: 'Signed', label: 'Every payout approved on your device' },
      { value: 'Bank', label: 'Cash out to your own account' },
    ],
    featuresTitle: 'Everything to take payments',
    featuresSub: 'From the first QR code to the money in your bank, with every step visible.',
    features: [
      { icon: '₦', title: 'Payment requests in seconds', body: 'Enter an amount, add a note, and show the QR. Your customer pays from the Vireo app.' },
      { icon: '◎', title: 'Live sales dashboard', body: "Your balance, today's sales and recent orders on one screen, refreshed whenever you open it." },
      { icon: '↗', title: 'Cash out to your bank', body: 'Send your balance to your bank account. Every payout is approved on your device before any money leaves.' },
      { icon: '☰', title: 'Full order history', body: 'Every request with its status: open, paid, expired or cancelled. Cancel an unpaid request any time.' },
      { icon: '⌂', title: 'Payouts you can track', body: 'See each cash-out as processing, completed or failed, with the reason if it failed.' },
      { icon: '◉', title: 'Pay with face', tag: 'Coming soon', body: 'Let verified customers pay at your till with their face instead of a phone, once biometric verification is switched on.' },
    ],
    stepsTitle: 'Start taking payments in three steps',
    steps: [
      { title: 'Set up your business', body: 'Sign up with your phone number, name your business and add the bank account to settle to.' },
      { title: 'Charge', body: "Enter the amount, show the QR code, and wait for the customer's payment to confirm." },
      { title: 'Cash out', body: 'Once your business is verified, send your balance to your bank and approve it on your phone.' },
    ],
    securityTitle: 'Your money moves only when you say so',
    securitySub: 'Payouts and payments are protected at every step.',
    security: [
      { icon: '✓', title: 'Payouts signed on your device', body: 'Each cash-out shows the destination account and is signed by a key that stays on your phone.' },
      { icon: '◎', title: 'Business verification', body: 'Cash-out unlocks after your business is reviewed and verified.' },
      { icon: '⌂', title: 'Bank details are protected', body: "Settlement details can't change while a payout is in progress, so a payout can't be redirected mid-flight." },
      { icon: '₦', title: 'Exact amounts, every time', body: "The customer pays the amount on the order. It can't be changed after you create it." },
      { icon: '☰', title: 'Every movement is recorded', body: 'Balances come from a double-entry ledger, so each naira in or out has a matching record.' },
      { icon: '◉', title: 'Manage your devices', body: 'Remove any phone from your signing devices and it can no longer approve payouts.' },
    ],
    closing: 'Start taking payments today.',
    closingSub: 'Set up your business in a few minutes.',
  }

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
              <button onClick={() => scrollTo('features')} className="nav-item">Features</button>
              <button onClick={() => scrollTo('steps')} className="nav-item">How it works</button>
              <button onClick={() => scrollTo('security')} className="nav-item">Security</button>
            </div>
            <div className="nav-actions">
              <button onClick={onSwitch} className="nav-link">Personal</button>
              <a href={MERCHANT_APP_URL} className="btn btn-accent btn-small">{content.primaryCta}</a>
            </div>
          </nav>

          <div className="hero-body">
            <div className="hero-text">
              <h1 className="headline fade-in-delay-1">
                {content.headline.before} <span className="accent">{content.headline.highlight}</span> {content.headline.after}
              </h1>
              <div className="underline" />
              <p className="sub fade-in-delay-2">{content.sub}</p>
              <div className="cta-row fade-in-delay-3">
                <a href={MERCHANT_APP_URL} className="btn btn-accent">{content.primaryCta}</a>
                <a href={MERCHANT_APP_URL} className="btn btn-secondary">{content.secondaryCta}</a>
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
                    <div className="card-chip">{content.cardLabel.toUpperCase()}</div>
                  </div>
                  <div className="card-glyph">₦</div>
                  <div className="card-foot">Approved on your device</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Facts */}
      <div className="inner">
        <div className={`facts ${visibleBottom > 800 ? 'rise' : ''}`}>
          {content.facts.map((f) => (
            <div key={f.label} className="fact">
              <div className="fact-value">{f.value}</div>
              <div className="fact-label">{f.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div ref={(el) => { sectionRefs.current.features = el }} className="inner">
        <div className={visibleBottom > 1200 ? 'rise' : ''}>
          <h2 className="section-title">{content.featuresTitle}</h2>
          <p className="section-sub">{content.featuresSub}</p>
        </div>
        <div className="grid">
          {content.features.map((f, i) => (
            <div key={f.title} className={`card ${visibleBottom > 1400 + i * 50 ? 'rise' : ''}`}>
              <div className="card-head">
                <div className="icon">{f.icon}</div>
                {f.tag && <div className="tag">{f.tag.toUpperCase()}</div>}
              </div>
              <h3 className="card-title">{f.title}</h3>
              <p className="card-body">{f.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Steps */}
      <div ref={(el) => { sectionRefs.current.steps = el }} className="inner">
        <div className={visibleBottom > 2200 ? 'rise' : ''}>
          <h2 className="section-title">{content.stepsTitle}</h2>
        </div>
        <div className="grid">
          {content.steps.map((s, i) => (
            <div key={s.title} className={`step ${visibleBottom > 2400 + i * 50 ? 'rise' : ''}`}>
              <div className="step-num">{String(i + 1).padStart(2, '0')}</div>
              <h3 className="card-title">{s.title}</h3>
              <p className="card-body">{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Security */}
      <div ref={(el) => { sectionRefs.current.security = el }} className="security-band">
        <div className="glow glow-security" />
        <div className="inner">
          <div className={visibleBottom > 3000 ? 'rise' : ''}>
            <h2 className="section-title">{content.securityTitle}</h2>
            <p className="section-sub">{content.securitySub}</p>
          </div>
          <div className="grid">
            {content.security.map((s, i) => (
              <div key={s.title} className={`sec-item ${visibleBottom > 3200 + i * 50 ? 'rise' : ''}`}>
                <div className="sec-icon">{s.icon}</div>
                <div>
                  <h3 className="sec-title">{s.title}</h3>
                  <p className="sec-body">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Closing */}
      <div className="inner">
        <div className={`closing ${visibleBottom > 4000 ? 'rise' : ''}`}>
          <div className="twinkle-closing twinkle-closing-1" />
          <div className="twinkle-closing twinkle-closing-2" />
          <h2 className="closing-title">{content.closing}</h2>
          <p className="closing-sub">{content.closingSub}</p>
          <a href={MERCHANT_APP_URL} className="btn btn-primary">{content.primaryCta}</a>
        </div>
      </div>

      <div className="inner">
        <p className="footer">© {new Date().getFullYear()} Vireo Finance</p>
      </div>
    </div>
  )
}
