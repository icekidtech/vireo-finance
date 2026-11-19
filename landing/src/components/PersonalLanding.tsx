import { useEffect, useRef, useState } from 'react'
import './Landing.css'

interface Props {
  onSwitch: () => void
}

export default function PersonalLanding({ onSwitch }: Props) {
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

  const PERSONAL_APP_URL = 'https://www.personal.vireofinance.app'

  const content = {
    headline: { before: 'Money that', highlight: 'responds', after: 'to you.' },
    sub: "Send to people, banks and merchants. Ask the assistant about your money. Approve every payment with your fingerprint or face, so nothing moves without you.",
    primaryCta: 'Get started',
    secondaryCta: 'Sign in',
    cardLabel: 'Wallet',
    facts: [
      { value: '₦0', label: 'Transfers between Vireo users' },
      { value: '₦100', label: 'Flat fee to any Nigerian bank' },
      { value: '1 key', label: 'Stays on your phone, unlocked by you' },
      { value: '0', label: 'Payments the assistant can send' },
    ],
    featuresTitle: 'Everything for everyday money',
    featuresSub: 'One wallet for paying, getting paid and keeping track, with you in control of every payment.',
    features: [
      { icon: '↗', title: 'Pay anyone', body: 'Send to another Vireo user by phone number or handle, or to any Nigerian bank account, and review the fee before you approve.' },
      { icon: '₦', title: 'Get paid from any bank', body: 'Every account has its own account number. Transfer in from any bank and the money lands in your wallet.' },
      { icon: '◎', title: 'Pay merchants', body: "Scan or paste a merchant's payment code, check the business and the exact amount, then approve." },
      { icon: '✦', title: 'Ask Vireo', tag: 'Assistant', body: 'Check your balance, review activity or have a payment prepared by chatting. It can prepare a payment but never send one.' },
      { icon: '☰', title: 'See where it went', body: 'One feed shows money in and out, with who it was and when, plus a receipt for every payment.' },
      { icon: '◉', title: 'Face payments', tag: 'Coming soon', body: 'Opt in to pay at a till without your phone. You control the consent and can delete your data at any time.' },
    ],
    stepsTitle: 'Up and running in three steps',
    steps: [
      { title: 'Create your account', body: 'Sign up with your phone number and confirm it with a one-time code.' },
      { title: 'Add money', body: 'Send money to your Vireo account number from any bank account.' },
      { title: 'Pay and approve', body: 'Choose who to pay, review the amount and fee, and approve with your fingerprint or face.' },
    ],
    securityTitle: 'Built so only you can move your money',
    securitySub: 'Security is part of how payments work here, not an add-on.',
    security: [
      { icon: '✓', title: 'Signed on your phone', body: 'Each payment is signed by a key that stays on your device, unlocked by your fingerprint or face.' },
      { icon: '✦', title: "The assistant can't spend", body: 'It can look things up and prepare a draft. Only your approval on your device releases a payment.' },
      { icon: '↗', title: 'Limits that grow with you', body: 'Daily and per-payment limits depend on your verification level, with checks on unusual activity.' },
      { icon: '☰', title: 'Every movement is recorded', body: 'Balances come from a double-entry ledger, so each naira in or out has a matching record.' },
      { icon: '◉', title: 'Your biometrics, your call', body: 'Face payments are opt-in. You can see every verification attempt and delete your data whenever you like.' },
      { icon: '⌂', title: 'Revoke any device', body: 'Lost a phone? Remove it from your signing devices and it can no longer approve anything.' },
    ],
    closing: 'Ready to take control of your money?',
    closingSub: 'Create your account with just your phone number.',
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
              <button onClick={onSwitch} className="nav-link">Business</button>
              <a href={PERSONAL_APP_URL} className="btn btn-accent btn-small">{content.primaryCta}</a>
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
                <a href={PERSONAL_APP_URL} className="btn btn-accent">{content.primaryCta}</a>
                <a href={PERSONAL_APP_URL} className="btn btn-secondary">{content.secondaryCta}</a>
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
          <a href={PERSONAL_APP_URL} className="btn btn-primary">{content.primaryCta}</a>
        </div>
      </div>

      <div className="inner">
        <p className="footer">© {new Date().getFullYear()} Vireo Finance</p>
      </div>
    </div>
  )
}
