import { createNavigationContainerRef, type NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { Place } from '../components/PlacePicker';

/**
 * The tab bar's own routes.
 *
 * These are NOT stack routes. They live inside the `Main` stack screen, and
 * React Navigation only resolves a route name upward through parent
 * navigators — never downward into a child. So `navigate('MyTrips')` from a
 * stack screen like Trip Details matches nothing and is silently dropped,
 * which is why several buttons appeared to do nothing at all. Reaching a tab
 * from outside requires naming its parent: navigate('Main', { screen: ... }),
 * or the goToTab() helper below.
 */
export type MainTabParamList = {
  Dashboard: undefined;
  MyTrips: undefined;
  MyVehicle: undefined;
  Wallet: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList>;
  Login: undefined;
  Signup: undefined;
  FindRide: undefined;
  OfferRide: undefined;
  RouteConfirmation: {
    mode: 'find' | 'offer';
    from: Place;
    to: Place;
    date: string;
    seats: number;
    farePerSeat?: number;
    vehicleId?: string;
    recurrence?: string[];
  };
  AvailableRides: { from: Place; to: Place; date: string; seats: number };
  TripDetails: { rideId: string };
  TrackRide: { tripId: string; rideId: string; isDriver: boolean };
  Payment: { bookingId: string; amount: number };
  RideHistory: undefined;
  Reports: undefined;
  Chat: { tripId: string };
  Help: undefined;
  Profile: undefined;
  Notifications: undefined;
};

/** Props for a screen registered on the root stack. */
export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

/**
 * Props for a screen registered on the tab bar. Composite so a tab screen can
 * still navigate to stack routes (Find Ride, Reports, …) with types intact.
 */
export type TabScreenProps<T extends keyof MainTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

/**
 * Navigation handle for code that runs outside a screen — chiefly tapping a
 * notification, which arrives on a socket, not from a component.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateFromAnywhere<T extends keyof RootStackParamList>(
  screen: T,
  params?: RootStackParamList[T],
): void {
  // Silently ignored before the container mounts: a notification landing
  // during the splash has nowhere to go, and dropping it beats crashing.
  if (!navigationRef.isReady()) return;
  // The cast is unavoidable: navigate()'s overloads split on whether a route
  // takes params, which a generic T spans both sides of. The public signature
  // above is what callers are checked against.
  (navigationRef.navigate as (s: string, p?: unknown) => void)(screen, params);
}

/** Jump to a tab from anywhere, including a screen outside the tab navigator. */
export function goToTab(tab: keyof MainTabParamList): void {
  navigateFromAnywhere('Main', { screen: tab });
}

declare global {
  // Lets bare useNavigation() calls resolve without per-call generics.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
