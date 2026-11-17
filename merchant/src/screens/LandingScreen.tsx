import type { StackScreenProps } from '@react-navigation/stack';
import Landing, { LandingContent } from '../components/Landing';
import type { RootStackParamList } from '../navigation';

type Props = StackScreenProps<RootStackParamList, 'Landing'>;

const content: LandingContent = {
  headline: 'Get paid the way your customers pay.',
  sub: 'Create a payment request in seconds, show a QR code, and see the money arrive in your balance. Cash out to your bank when you’re ready.',
  primaryCta: 'Create business account',
  secondaryCta: 'Sign in',
  features: [
    {
      title: 'Payment requests in seconds',
      body: 'Enter an amount, add a note, and show the QR. Your customer pays from the Vireo app and you see it the moment it lands.',
    },
    {
      title: 'Live sales dashboard',
      body: 'Your balance, today’s sales and recent orders on one screen, refreshed whenever you open it.',
    },
    {
      title: 'Cash out to your bank',
      body: 'Send your balance to your bank account. Every payout is approved on your device before any money leaves.',
    },
    {
      title: 'Full order history',
      body: 'Every request with its status: open, paid, expired or cancelled. Cancel an unpaid request any time.',
    },
    {
      title: 'Payouts you can track',
      body: 'See each cash-out and whether it is processing, completed or failed, with the reason if it failed.',
    },
    {
      title: 'Pay with face',
      tag: 'Coming soon',
      body: 'Let verified customers pay at your till with their face instead of a phone, once biometric verification is switched on.',
    },
  ],
  stepsTitle: 'How it works',
  steps: [
    { title: 'Set up your business', body: 'Sign up with your phone number, name your business and add the bank account to settle to.' },
    { title: 'Charge', body: 'Enter the amount, show the QR code, and wait for the customer’s payment to confirm.' },
    { title: 'Cash out', body: 'Once your business is verified, send your balance to your bank and approve it on your phone.' },
  ],
  securityTitle: 'Your money moves only when you say so',
  security: [
    {
      title: 'Payouts signed on your device',
      body: 'Each cash-out shows the destination account and is signed by a key that stays on your phone.',
    },
    {
      title: 'Business verification',
      body: 'Cash-out unlocks after your business is reviewed and verified.',
    },
    {
      title: 'Bank details are protected',
      body: 'Settlement details can’t be changed while a payout is in progress, so a payout can’t be redirected mid-flight.',
    },
    {
      title: 'Exact amounts, every time',
      body: 'The customer pays the amount on the order. It can’t be changed after you create it.',
    },
    {
      title: 'Every movement is recorded',
      body: 'Balances come from a double-entry ledger, so each naira in or out has a matching record.',
    },
    {
      title: 'Manage your devices',
      body: 'Remove any phone from your signing devices and it can no longer approve payouts.',
    },
  ],
  closing: 'Start taking payments today.',
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
