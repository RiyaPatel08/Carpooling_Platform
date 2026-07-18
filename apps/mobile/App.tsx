import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './lib/auth';
import type { RootStackParamList } from './lib/navigation';
import { colors } from './theme';

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

// Typed with the shared param list so a Screen whose component expects params
// cannot be registered under a route that does not declare them.
const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<RootStackParamList>();

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

/** Bottom tabs mirror the mockup's nav: Dashboard, Trips, Vehicle, Wallet, Settings. */
function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="Dashboard" component={Dashboard} />
      <Tabs.Screen name="MyTrips" component={MyTrips} options={{ title: 'Trips' }} />
      <Tabs.Screen name="MyVehicle" component={MyVehicle} options={{ title: 'Vehicle' }} />
      <Tabs.Screen name="Wallet" component={Wallet} />
      <Tabs.Screen name="Settings" component={Settings} />
    </Tabs.Navigator>
  );
}

function Root() {
  const { user, ready } = useAuth();

  // Splash: held only while the stored session is read, so a returning user
  // never sees the login screen flash past.
  if (!ready) {
    return (
      <View style={s.splash}>
        <Text style={s.brand}>Carpooling</Text>
        <Text style={s.tagline}>Ride Together, Save Together</Text>
        <ActivityIndicator color="#fff" style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={theme}>
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
        <StatusBar style="auto" />
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 34, fontWeight: '800', color: '#fff' },
  tagline: { fontSize: 15, color: 'rgba(255,255,255,0.9)', marginTop: 8 },
});
