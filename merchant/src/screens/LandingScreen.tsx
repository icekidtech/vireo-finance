import type { StackScreenProps } from '@react-navigation/stack';
import Landing, { LandingContent } from '../components/Landing';
import type { RootStackParamList } from '../navigation';

type Props = StackScreenProps<RootStackParamList, 'Landing'>;

/**
 * Every claim here describes behaviour that exists in the product today
 * (order lifetime, polling, signed payouts come from the backend). Add
 * statistics, partner logos, licences or testimonials only when they are real.
 */
const content: LandingContent = {
  headline: { before: 'Get paid the way', highlight: 'your customers', after: 'pay.' },
  sub: 'Create a payment request in seconds, show a QR code, and watch the money arrive in your balance. Cash out to your bank when you’re ready.',
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
    { icon: '◎', title: 'Live sales dashboard', body: 'Your balance, today’s sales and recent orders on one screen, refreshed whenever you open it.' },
    { icon: '↗', title: 'Cash out to your bank', body: 'Send your balance to your bank account. Every payout is approved on your device before any money leaves.' },
    { icon: '☰', title: 'Full order history', body: 'Every request with its status: open, paid, expired or cancelled. Cancel an unpaid request any time.' },
    { icon: '⌂', title: 'Payouts you can track', body: 'See each cash-out as processing, completed or failed, with the reason if it failed.' },
    { icon: '◉', title: 'Pay with face', tag: 'Coming soon', body: 'Let verified customers pay at your till with their face instead of a phone, once biometric verification is switched on.' },
  ],
  stepsTitle: 'Start taking payments in three steps',
  steps: [
    { title: 'Set up your business', body: 'Sign up with your phone number, name your business and add the bank account to settle to.' },
    { title: 'Charge', body: 'Enter the amount, show the QR code, and wait for the customer’s payment to confirm.' },
    { title: 'Cash out', body: 'Once your business is verified, send your balance to your bank and approve it on your phone.' },
  ],
  securityTitle: 'Your money moves only when you say so',
  securitySub: 'Payouts and payments are protected at every step.',
  security: [
    { icon: '✓', title: 'Payouts signed on your device', body: 'Each cash-out shows the destination account and is signed by a key that stays on your phone.' },
    { icon: '◎', title: 'Business verification', body: 'Cash-out unlocks after your business is reviewed and verified.' },
    { icon: '⌂', title: 'Bank details are protected', body: 'Settlement details can’t change while a payout is in progress, so a payout can’t be redirected mid-flight.' },
    { icon: '₦', title: 'Exact amounts, every time', body: 'The customer pays the amount on the order. It can’t be changed after you create it.' },
    { icon: '☰', title: 'Every movement is recorded', body: 'Balances come from a double-entry ledger, so each naira in or out has a matching record.' },
    { icon: '◉', title: 'Manage your devices', body: 'Remove any phone from your signing devices and it can no longer approve payouts.' },
  ],
  closing: 'Start taking payments today.',
  closingSub: 'Set up your business in a few minutes.',
};

export default function LandingScreen({ navigation }: Props) {
  return (
    <Landing
      content={content}
      onPrimary={() => navigation.navigate('Onboard', { mode: 'signup' })}
      onSecondary={() => navigation.navigate('Onboard', { mode: 'signin' })}
    />
  );
}
