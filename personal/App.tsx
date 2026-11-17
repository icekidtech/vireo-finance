import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import AuthScreen from './src/screens/AuthScreen';
import LandingScreen from './src/screens/LandingScreen';
import { AppFrame } from './src/components/ui';
import HomeScreen from './src/screens/HomeScreen';
import PayScreen from './src/screens/PayScreen';
import ActivityScreen from './src/screens/ActivityScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import TransferDetailScreen from './src/screens/TransferDetailScreen';
import KycScreen from './src/screens/KycScreen';
import DevicesScreen from './src/screens/DevicesScreen';
import BiometricsScreen from './src/screens/BiometricsScreen';
import BiometricEnrollScreen from './src/screens/BiometricEnrollScreen';
import AssistantScreen from './src/screens/AssistantScreen';
import AdminScreen from './src/screens/AdminScreen';
import type { RootStackParamList, TabParamList } from './src/navigation';
import { colors } from './src/theme';

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.bg, text: colors.text, border: colors.border },
};

const TAB_ICONS: Record<keyof TabParamList, string> = {
  Home: '⌂',
  Pay: '₦',
  Activity: '☰',
  Profile: '◉',
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.black,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { borderTopColor: colors.border, backgroundColor: colors.bg },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarIcon: ({ color }: { color: string }) => (
          <Text style={{ fontSize: 22, color, fontWeight: '800' }}>{TAB_ICONS[route.name]}</Text>
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Pay" component={PayScreen} />
      <Tab.Screen name="Activity" component={ActivityScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.black} />
      </View>
    );
  }

  const navigator = (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!token ? (
          <>
            {/* The marketing page is web-only; phones open straight to sign-in. */}
            {Platform.OS === 'web' && <Stack.Screen name="Landing" component={LandingScreen} />}
            <Stack.Screen name="Auth" component={AuthScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen name="TransferDetail" component={TransferDetailScreen} />
            <Stack.Screen name="Kyc" component={KycScreen} />
            <Stack.Screen name="Devices" component={DevicesScreen} />
            <Stack.Screen name="Biometrics" component={BiometricsScreen} />
            <Stack.Screen name="BiometricEnroll" component={BiometricEnrollScreen} />
            <Stack.Screen name="Assistant" component={AssistantScreen} />
            <Stack.Screen name="Admin" component={AdminScreen} />
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
        <StatusBar style="dark" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
