import type { StackScreenProps } from '@react-navigation/stack';
import Landing, { LandingContent } from '../components/Landing';
import type { RootStackParamList } from '../navigation';

type Props = StackScreenProps<RootStackParamList, 'Landing'>;

/**
 * Every claim here describes behaviour that exists in the product today
 * (fees, limits and flows come from the backend). Add statistics, press logos,
 * licences or testimonials only when they are real and you can evidence them.
 */
const content: LandingContent = {
  headline: { before: 'Money that', highlight: 'responds', after: 'to you.' },
  sub: 'Send to people, banks and merchants. Ask the assistant about your money. Approve every payment with your fingerprint or face, so nothing moves without you.',
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
    { icon: '◎', title: 'Pay merchants', body: 'Scan or paste a merchant’s payment code, check the business and the exact amount, then approve.' },
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
    { icon: '✦', title: 'The assistant can’t spend', body: 'It can look things up and prepare a draft. Only your approval on your device releases a payment.' },
    { icon: '↗', title: 'Limits that grow with you', body: 'Daily and per-payment limits depend on your verification level, with checks on unusual activity.' },
    { icon: '☰', title: 'Every movement is recorded', body: 'Balances come from a double-entry ledger, so each naira in or out has a matching record.' },
    { icon: '◉', title: 'Your biometrics, your call', body: 'Face payments are opt-in. You can see every verification attempt and delete your data whenever you like.' },
    { icon: '⌂', title: 'Revoke any device', body: 'Lost a phone? Remove it from your signing devices and it can no longer approve anything.' },
  ],
  closing: 'Ready to take control of your money?',
  closingSub: 'Create your account with just your phone number.',
};

export default function LandingScreen({ navigation }: Props) {
  return (
    <Landing
      content={content}
      onPrimary={() => navigation.navigate('Auth', { mode: 'signup' })}
      onSecondary={() => navigation.navigate('Auth', { mode: 'signin' })}
    />
  );
}
