import type { StackScreenProps } from '@react-navigation/stack';
import Landing, { LandingContent } from '../components/Landing';
import type { RootStackParamList } from '../navigation';

type Props = StackScreenProps<RootStackParamList, 'Landing'>;

const content: LandingContent = {
  headline: 'Money that responds to you.',
  sub: 'Send to people, banks and merchants. Ask the assistant about your money. Approve every payment with your fingerprint or face, so nothing moves without you.',
  primaryCta: 'Get started',
  secondaryCta: 'Sign in',
  features: [
    {
      title: 'Pay anyone',
      body: 'Send to another Vireo user by phone number or handle at no cost, or to any Nigerian bank account for a flat ₦100 fee.',
    },
    {
      title: 'Get paid from any bank',
      body: 'Every account has its own account number. Transfer in from any bank and the money lands in your wallet.',
    },
    {
      title: 'Pay merchants',
      body: 'Scan or paste a merchant’s payment code, check the business and the exact amount, then approve.',
    },
    {
      title: 'Ask Vireo',
      tag: 'Assistant',
      body: 'Check your balance, review activity or have a payment prepared by chatting. The assistant can prepare a payment but never send one.',
    },
    {
      title: 'See where your money went',
      body: 'One activity feed shows money in and out, with who it was and when, and a receipt for every payment.',
    },
    {
      title: 'Face and voice payments',
      tag: 'Coming soon',
      body: 'Opt in to pay at a till without your phone. You control the consent and can delete your data at any time.',
    },
  ],
  stepsTitle: 'How it works',
  steps: [
    { title: 'Create your account', body: 'Sign up with your phone number and confirm it with a one-time code.' },
    { title: 'Add money', body: 'Send money to your Vireo account number from any bank account.' },
    { title: 'Pay and approve', body: 'Choose who to pay, review the amount and fee, and approve with your fingerprint or face.' },
  ],
  securityTitle: 'Built so only you can move your money',
  security: [
    {
      title: 'Signed on your phone',
      body: 'Each payment is cryptographically signed by a key that stays on your device, unlocked by your fingerprint or face.',
    },
    {
      title: 'The assistant can’t spend',
      body: 'It can look things up and prepare a draft. Only your approval on your device releases a payment.',
    },
    {
      title: 'Limits that grow with you',
      body: 'Daily and per-payment limits depend on your verification level, with checks on unusual activity.',
    },
    {
      title: 'Every movement is recorded',
      body: 'Balances come from a double-entry ledger, so each naira in or out has a matching record.',
    },
    {
      title: 'Your biometrics, your call',
      body: 'Face and voice are opt-in. You can see every verification attempt and delete your data whenever you like.',
    },
    {
      title: 'You can revoke any device',
      body: 'Lost a phone? Remove it from your signing devices and it can no longer approve anything.',
    },
  ],
  closing: 'Ready to take control of your money?',
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
