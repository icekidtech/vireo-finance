import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * One param list for the whole app: navigators and screen props are typed from
 * this, so a renamed route or changed param fails at compile time.
 */
export type TabParamList = {
  Home: undefined;
  Pay: { orderReference?: string } | undefined;
  Activity: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Tabs: NavigatorScreenParams<TabParamList>;
  TransferDetail: { transferId: string };
  Kyc: undefined;
  Devices: undefined;
  Biometrics: undefined;
  BiometricEnroll: undefined;
  Assistant: undefined;
  Admin: undefined;
};
