import { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './lib/auth';
import { NotificationProvider } from './lib/notifications';
import { navigationRef, type MainTabParamList, type RootStackParamList } from './lib/navigation';
import { colors } from './theme';

import Splash from './screens/Splash';
import Login from './screens/Login';
import Signup from './screens/Signup';
import Dashboard from './screens/Dashboard';
import FindRide from './screens/FindRide';
import OfferRide from './screens/OfferRide';
import RouteConfirmation from './screens/RouteConfirmation';
import AvailableRides from './screens/AvailableRides';
import MyTrips from './screens/MyTrips';
import TripDetails from './screens/TripDetails';
import TrackRide from './screens/TrackRide';
import Payment from './screens/Payment';
import Wallet from './screens/Wallet';
import MyVehicle from './screens/MyVehicle';
import RideHistory from './screens/RideHistory';
import Reports from './screens/Reports';
import Settings from './screens/Settings';
import Chat from './screens/Chat';
import Help from './screens/Help';
import Profile from './screens/Profile';
import Notifications from './screens/Notifications';

// Typed with the shared param list so a Screen whose component expects params
// cannot be registered under a route that does not declare them.
const Stack = createNativeStackNavigator<RootStackParamList>();
// Its own param list: the tab routes are not stack routes, and typing them as
// one is what let navigate('MyTrips') compile from screens that could never
// reach it.
const Tabs = createBottomTabNavigator<MainTabParamList>();

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

/**
 * Bottom tabs mirror the mockup's nav: Dashboard, Trips, Vehicle, Wallet,
 * Settings. Icons are filled when active and outlined when not — the standard
 * iOS/Android convention, and the cue people actually read before the label.
 */
const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Dashboard: 'home',
  MyTrips: 'car-sport',
  MyVehicle: 'construct',
  Wallet: 'wallet',
  Settings: 'settings',
};

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { borderTopColor: colors.border, height: 60, paddingBottom: 6, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size, focused }) => {
          const base = TAB_ICONS[route.name] ?? 'ellipse';
          return (
            <Ionicons
              name={(focused ? base : `${base}-outline`) as keyof typeof Ionicons.glyphMap}
              size={size ?? 22}
              color={color}
            />
          );
        },
      })}
    >
      <Tabs.Screen name="Dashboard" component={Dashboard} options={{ title: 'Home' }} />
      <Tabs.Screen name="MyTrips" component={MyTrips} options={{ title: 'Trips' }} />
      <Tabs.Screen name="MyVehicle" component={MyVehicle} options={{ title: 'Vehicle' }} />
      <Tabs.Screen name="Wallet" component={Wallet} />
      <Tabs.Screen name="Settings" component={Settings} />
    </Tabs.Navigator>
  );
}

/** Floor on how long the Splash screen stays up, so a fast session restore
 *  still reads as a screen rather than a flicker before Login/Dashboard. */
const MIN_SPLASH_MS = 1200;

function Root() {
  const { user, ready } = useAuth();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  if (!ready || !minTimeElapsed) {
    return <Splash />;
  }

  return (
    <NavigationContainer theme={theme} ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerTintColor: colors.primary }}>
        {user ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="FindRide" component={FindRide} options={{ title: 'Find Ride' }} />
            <Stack.Screen name="OfferRide" component={OfferRide} options={{ title: 'Offer Ride' }} />
            <Stack.Screen name="RouteConfirmation" component={RouteConfirmation} options={{ title: 'Route' }} />
            <Stack.Screen name="AvailableRides" component={AvailableRides} options={{ title: 'Available Rides' }} />
            <Stack.Screen name="TripDetails" component={TripDetails} options={{ title: 'Trip' }} />
            <Stack.Screen name="TrackRide" component={TrackRide} options={{ title: 'Track Ride' }} />
            <Stack.Screen name="Payment" component={Payment} options={{ title: 'Payment' }} />
            <Stack.Screen name="RideHistory" component={RideHistory} options={{ title: 'Ride History' }} />
            <Stack.Screen name="Reports" component={Reports} options={{ title: 'Reports' }} />
            <Stack.Screen name="Chat" component={Chat} options={{ title: 'Chat' }} />
            <Stack.Screen name="Help" component={Help} options={{ title: 'Help & Support' }} />
            <Stack.Screen name="Profile" component={Profile} options={{ title: 'My Profile' }} />
            <Stack.Screen name="Notifications" component={Notifications} options={{ title: 'Notifications' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={Login} options={{ headerShown: false }} />
            <Stack.Screen name="Signup" component={Signup} options={{ title: 'Sign Up' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        {/* Inside AuthProvider: the socket needs a token, and notifications
            must reset when the signed-in user changes. */}
        <NotificationProvider>
          <StatusBar style="auto" />
          <Root />
        </NotificationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
