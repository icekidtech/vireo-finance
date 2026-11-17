import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * One param list for the whole app: the navigators and every screen's props are
 * typed from this, so a renamed route or a changed param fails at compile time.
 */
export type TabParamList = {
  Home: undefined;
  Charge: undefined;
  Activity: { initialTab?: 'sales' | 'payouts' } | undefined;
  Account: undefined;
};

export type RootStackParamList = {
  Landing: undefined;
  Onboard: { mode?: 'signin' | 'signup' } | undefined;
  Tabs: NavigatorScreenParams<TabParamList>;
  OrderDetail: { reference: string };
  Settle: undefined;
  Receive: undefined;
  Devices: undefined;
  EditBusiness: undefined;
  BiometricPayment: { orderReference: string; amount: string };
};
