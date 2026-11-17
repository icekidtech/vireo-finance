/**
 * One param list for the whole app: the navigator and every screen's props are
 * typed from this, so a renamed route or a changed param fails at compile time.
 */
export type RootStackParamList = {
  Onboard: undefined;
  Dashboard: undefined;
  CreateOrder: undefined;
  Orders: undefined;
  Settle: undefined;
  BiometricPayment: { orderReference: string; amount: string };
};