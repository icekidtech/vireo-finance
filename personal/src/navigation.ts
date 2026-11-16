/**
 * One param list for the whole app: the navigator and every screen's props are
 * typed from this, so a renamed route or a changed param fails at compile time.
 */
export type RootStackParamList = {
  Register: undefined;
  OtpVerify: { phone?: string } | undefined;
  Wallet: undefined;
  Send: undefined;
  Transactions: undefined;
  Kyc: undefined;
};