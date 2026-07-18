import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Place } from '../components/PlacePicker';

/**
 * One param list for the whole app. Screens derive their props from this, so
 * a navigate() call with the wrong shape fails to compile instead of arriving
 * as undefined at runtime.
 */
export type RootStackParamList = {
  Main: undefined;
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
  MyTrips: undefined;
  MyVehicle: undefined;
  Wallet: undefined;
  Dashboard: undefined;
  Settings: undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

declare global {
  // Lets bare useNavigation() calls resolve without per-call generics.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
