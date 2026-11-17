import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DialogHost from './src/components/DialogHost';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import OnboardScreen from './src/screens/OnboardScreen';
import LandingScreen from './src/screens/LandingScreen';
import { AppFrame } from './src/components/ui';
import DashboardScreen from './src/screens/DashboardScreen';
import CreateOrderScreen from './src/screens/CreateOrderScreen';
import ActivityScreen from './src/screens/ActivityScreen';
import AccountScreen from './src/screens/AccountScreen';
import OrderDetailScreen from './src/screens/OrderDetailScreen';
import SettleScreen from './src/screens/SettleScreen';
import ReceiveScreen from './src/screens/ReceiveScreen';
import VerifyScreen from './src/screens/VerifyScreen';
import PinScreen from './src/screens/PinScreen';
import DevicesScreen from './src/screens/DevicesScreen';
import EditBusinessScreen from './src/screens/EditBusinessScreen';
import BiometricPaymentScreen from './src/screens/BiometricPaymentScreen';
import type { RootStackParamList, TabParamList } from './src/navigation';
import { colors } from './src/theme';

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
};

const TAB_LABELS: Record<keyof TabParamList, string> = {
  Home: '⌂',
  Charge: '₦',
  Activity: '☰',
  Account: '◉',
};

function Tabs() {
  return (
    <Tab.Navigator
      sceneContainerStyle={{ flex: 1 }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { borderTopColor: colors.border, backgroundColor: '#141414' },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarIcon: ({ color }) => (
          <Text style={{ fontSize: 22, color, fontWeight: '800' }}>{TAB_LABELS[route.name]}</Text>
        ),
      })}
    >
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="Charge" component={CreateOrderScreen} />
      <Tab.Screen name="Activity" component={ActivityScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const navigator = (
    <NavigationContainer theme={navTheme}>
      {/* cardStyle flex:1 gives screens a bounded height on web; without it ScrollViews grow to their content and never scroll. */}
      <Stack.Navigator screenOptions={{ headerShown: false, cardStyle: { flex: 1 } }}>
        {!token ? (
          <>
            {/* The marketing page is web-only; phones open straight to sign-in. */}
            {Platform.OS === 'web' && <Stack.Screen name="Landing" component={LandingScreen} />}
            <Stack.Screen name="Onboard" component={OnboardScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
            <Stack.Screen name="Settle" component={SettleScreen} />
            <Stack.Screen name="Receive" component={ReceiveScreen} />
            <Stack.Screen name="Verify" component={VerifyScreen} />
            <Stack.Screen name="Pin" component={PinScreen} />
            <Stack.Screen name="Devices" component={DevicesScreen} />
            <Stack.Screen name="EditBusiness" component={EditBusinessScreen} />
            <Stack.Screen name="BiometricPayment" component={BiometricPaymentScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );

  return token ? <AppFrame>{navigator}</AppFrame> : navigator;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppNavigator />
        <StatusBar style="light" />
      </AuthProvider>
      <DialogHost />
    </SafeAreaProvider>
  );
}
