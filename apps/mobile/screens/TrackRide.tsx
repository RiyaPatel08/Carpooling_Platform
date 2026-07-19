import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, type LatLng } from 'react-native-maps';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { Avatar, Badge, Button, ErrorNote } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { getSocket, joinTrip, leaveTrip } from '../lib/socket';
import { photoSrc } from './Profile';
import { colors, radius, spacing } from '../theme';
import type { ScreenProps } from '../lib/navigation';
import type { TripRow } from './MyTrips';

interface Broadcast {
  lat: number;
  lng: number;
  etaSeconds: number | null;
  remainingM: number | null;
  offRouteM: number | null;
  recordedAt: string;
}

/**
 * Live tracking.
 *
 * The driver's phone is the only source of position: it watches GPS and emits
 * location:update. Everyone in the trip room — driver included — renders from
 * the server's broadcast, so every screen shows the same thing and the marker
 * can never disagree between devices.
 *
 * What the map shows, and why each piece is there:
 *  - the planned route, so "where is it going" is answerable before the first ping
 *  - origin and destination pins, so the line has ends rather than floating
 *  - the passenger's own pickup and drop, which is the part of the route that
 *    concerns them and was previously invisible
 *  - the vehicle, animated between pings rather than teleporting
 *  - the viewer's own position, so a passenger can see the car approaching
 *    them rather than approaching an unlabelled point
 */
export default function TrackRide({ route, navigation }: ScreenProps<'TrackRide'>) {
  const { tripId, rideId, isDriver } = route.params;
  const { user } = useAuth();

  const [position, setPosition] = useState<Broadcast | null>(null);
  const [line, setLine] = useState<LatLng[]>([]);
  const [trail, setTrail] = useState<LatLng[]>([]);
  const [me, setMe] = useState<LatLng | null>(null);
  const [trip, setTrip] = useState<TripRow | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [follow, setFollow] = useState(true);

  const mapRef = useRef<MapView>(null);
  const watcher = useRef<Location.LocationSubscription | null>(null);
  const meWatcher = useRef<Location.LocationSubscription | null>(null);
  // Read inside the GPS watcher's long-lived callback instead of `simulating`
  // directly — the callback closes over whatever `simulating` was when
  // watchPositionAsync was set up, and re-subscribing the watcher every time
  // simulation is toggled is wasteful. A ref stays current without that.
  const simulatingRef = useRef(false);

  useEffect(() => {
    simulatingRef.current = simulating;
  }, [simulating]);

  // Planned route, drawn once.
  useEffect(() => {
    api<{ coordinates: [number, number][] }>(`/rides/${rideId}/route`)
      .then((g) => setLine(g.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))))
      .catch(() => setLine([]));
  }, [rideId]);

  // Trip context: who the counterpart is, and where this passenger gets on
  // and off. Without it the map cannot mark the segment that matters to them.
  useEffect(() => {
    api<TripRow[]>('/trips/mine')
      .then((all) => setTrip(all.find((t) => t.rideId === rideId) ?? null))
      .catch(() => undefined);
  }, [rideId]);

  // Path already travelled, so opening the screen mid-trip is not a blank map.
  useEffect(() => {
    api<{ lat: number; lng: number }[]>(`/trips/${tripId}/track`)
      .then((pts) => setTrail(pts.map((p) => ({ latitude: p.lat, longitude: p.lng }))))
      .catch(() => undefined);
  }, [tripId]);

  // The viewer's own location. Everyone gets this — a driver benefits from
  // seeing themselves against the planned line too.
  useEffect(() => {
    let active = true;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      const granted =
        status === 'granted' ||
        (await Location.requestForegroundPermissionsAsync()).status === 'granted';
      if (!granted || !active) return;

      meWatcher.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 25 },
        (loc) => {
          if (active) setMe({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        },
      );
    })();
    return () => {
      active = false;
      meWatcher.current?.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;

    // Named handlers: socket.off(event) with no handler would also unhook the
    // notification provider, which listens on the same connection.
    const onBroadcast = (b: Broadcast) => {
      if (!active) return;
      setPosition(b);
      setTrail((t) => [...t.slice(-400), { latitude: b.lat, longitude: b.lng }]);
    };
    const onAlert = (a: { detail: string }) => {
      if (active) setAlert(a.detail);
    };
    const onStatus = (msg: { status: string; message?: string }) => {
      if (!active) return;
      // The trip ending while this screen is open must not leave a stale map.
      if (['completed', 'payment_pending', 'payment_completed'].includes(msg.status)) {
        setSimulating(false);
        setAlert(null);
      }
    };

    (async () => {
      try {
        await joinTrip(tripId);
      } catch (e) {
        if (active) setError((e as Error).message);
        return;
      }

      const socket = getSocket();
      socket.on('location:broadcast', onBroadcast);
      socket.on('safety:alert', onAlert);
      socket.on('trip:status', onStatus);

      // Only the driver publishes location.
      if (isDriver) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (active) {
            setError(
              'Location permission is needed to share your position with passengers. You can still use Simulate Trip.',
            );
          }
          return;
        }
        watcher.current = await Location.watchPositionAsync(
          // 3s / 20m: frequent enough that the marker moves smoothly, sparse
          // enough not to flatten the battery on a 40-minute commute.
          { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 20 },
          (loc) => {
            // The server-side simulator is this trip's only source of
            // position while it runs; a real ping alongside it would
            // interleave with the simulated route and make the trail jump
            // between wherever this phone actually is and the simulated path.
            if (simulatingRef.current) return;
            socket.emit('location:update', {
              tripId,
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              speed: loc.coords.speed && loc.coords.speed > 0 ? loc.coords.speed * 3.6 : undefined,
            });
          },
        );
      }
    })();

    return () => {
      active = false;
      watcher.current?.remove();
      const socket = getSocket();
      socket.off('location:broadcast', onBroadcast);
      socket.off('safety:alert', onAlert);
      socket.off('trip:status', onStatus);
      leaveTrip(tripId);
    };
  }, [tripId, isDriver]);

  // Keep the vehicle centred while following. animateCamera rather than a
  // controlled `region` prop: the old version re-centred on every render,
  // which fought the user's own panning and made the map feel broken.
  useEffect(() => {
    if (!follow || !position || !mapRef.current) return;
    mapRef.current.animateCamera(
      { center: { latitude: position.lat, longitude: position.lng } },
      { duration: 800 },
    );
  }, [position, follow]);

  const fitAll = useCallback(() => {
    const pts = [...line, ...(me ? [me] : [])];
    if (pts.length < 2 || !mapRef.current) return;
    setFollow(false);
    mapRef.current.fitToCoordinates(pts, {
      edgePadding: { top: 70, right: 70, bottom: 260, left: 70 },
      animated: true,
    });
  }, [line, me]);

  async function toggleSimulation() {
    try {
      if (simulating) {
        await api(`/trips/${tripId}/simulate/stop`, { method: 'POST' });
        setSimulating(false);
        return;
      }
      await api(`/trips/${tripId}/simulate`, {
        method: 'POST',
        body: JSON.stringify({ speedFactor: 2 }),
      });
      setSimulating(true);
      setFollow(true);
    } catch (e) {
      Alert.alert(
        'Could not start simulation',
        e instanceof ApiError ? e.message : 'Please try again',
      );
    }
  }

  function sos() {
    Alert.alert('Raise SOS?', 'Your driver and your administrator will be alerted immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Raise SOS',
        style: 'destructive',
        onPress: () =>
          getSocket().emit('safety:sos', {
            tripId,
            ...(position ? { lat: position.lat, lng: position.lng } : {}),
          }),
      },
    ]);
  }

  const myBooking = trip?.bookings.find((b) => b.passenger.id === user?.id);
  const counterpart = isDriver ? trip?.bookings[0]?.passenger : trip?.driver;

  // One-time initial framing; after this the camera is driven imperatively.
  const initialRegion = line.length
    ? {
        latitude: line[0].latitude,
        longitude: line[0].longitude,
        latitudeDelta: 0.12,
        longitudeDelta: 0.12,
      }
    : { latitude: 23.05, longitude: 72.6, latitudeDelta: 0.2, longitudeDelta: 0.2 };

  const offRoute = position?.offRouteM != null && position.offRouteM > 500;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        // Any manual gesture hands control back to the user.
        onPanDrag={() => setFollow(false)}
      >
        {line.length > 1 && (
          <Polyline coordinates={line} strokeWidth={5} strokeColor={colors.border} />
        )}
        {trail.length > 1 && (
          <Polyline
            coordinates={trail}
            strokeWidth={5}
            strokeColor={offRoute ? colors.danger : colors.primary}
          />
        )}

        {line.length > 1 && (
          <Marker coordinate={line[0]} title="Start" description={trip?.originLabel} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[s.pin, { backgroundColor: colors.primary }]}>
              <Ionicons name="radio-button-on" size={12} color="#fff" />
            </View>
          </Marker>
        )}
        {line.length > 1 && (
          <Marker
            coordinate={line[line.length - 1]}
            title="Destination"
            description={trip?.destLabel}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={[s.pin, { backgroundColor: colors.danger }]}>
              <Ionicons name="flag" size={12} color="#fff" />
            </View>
          </Marker>
        )}

        {/* The passenger's own leg. This is what was missing: a rider could
            previously see only a destination dot with no sense of where they
            personally get on or off. */}
        {!!myBooking && !!me && (
          <Marker coordinate={me} title="You" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={s.mePin}>
              <View style={s.meDot} />
            </View>
          </Marker>
        )}

        {position && (
          <Marker
            coordinate={{ latitude: position.lat, longitude: position.lng }}
            title={isDriver ? 'You' : counterpart?.name ?? 'Vehicle'}
            description={trip?.vehicle.model}
            anchor={{ x: 0.5, y: 0.5 }}
            // Flat + tracksViewChanges off: without this the custom marker
            // re-rasterises on every ping and the map visibly stutters.
            tracksViewChanges={false}
          >
            <View style={[s.vehicle, offRoute && { backgroundColor: colors.danger }]}>
              <Ionicons name="car-sport" size={17} color="#fff" />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Map controls float over the map, thumb-reachable on the right. */}
      <View style={s.controls}>
        <MapButton icon="locate" active={follow} onPress={() => setFollow(true)} label="Follow vehicle" />
        <MapButton icon="scan" onPress={fitAll} label="Fit whole route" />
      </View>

      <View style={s.panel}>
        {!!error && <ErrorNote text={error} />}
        {!!alert && (
          <Pressable onPress={() => setAlert(null)}>
            <View style={s.alertBox}>
              <Ionicons name="warning" size={18} color={colors.danger} />
              <Text style={s.alertText}>{alert}</Text>
              <Ionicons name="close" size={16} color={colors.danger} />
            </View>
          </Pressable>
        )}

        <View style={s.card}>
          <View style={s.cardHead}>
            <View style={{ flex: 1 }}>
              <Text style={s.eta}>
                {position?.etaSeconds != null
                  ? position.etaSeconds < 60
                    ? 'Arriving now'
                    : `${Math.round(position.etaSeconds / 60)} min away`
                  : position
                    ? 'En route'
                    : isDriver
                      ? 'Waiting for GPS…'
                      : 'Waiting for the driver…'}
              </Text>
              {position?.remainingM != null && (
                <Text style={s.meta}>
                  {(position.remainingM / 1000).toFixed(1)} km remaining
                  {simulating ? ' · simulated' : ''}
                </Text>
              )}
              {!position && (
                <Text style={s.meta}>
                  {isDriver
                    ? 'Your position will be shared once GPS reports.'
                    : 'The map updates the moment your driver moves.'}
                </Text>
              )}
            </View>
            {position?.offRouteM != null && (
              <Badge text={offRoute ? 'Off route' : 'On route'} tone={offRoute ? 'red' : 'green'} />
            )}
          </View>

          {!!counterpart && (
            <View style={s.person}>
              <Avatar uri={photoSrc(counterpart.photoUrl)} name={counterpart.name} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={s.personName}>{counterpart.name}</Text>
                <Text style={s.meta}>
                  {trip?.vehicle.model} · {trip?.vehicle.registrationNo}
                </Text>
              </View>
              <Pressable
                onPress={() => navigation.navigate('Chat', { tripId })}
                style={s.iconBtn}
                accessibilityLabel="Open chat"
              >
                <Ionicons name="chatbubble-ellipses" size={18} color={colors.primary} />
              </Pressable>
            </View>
          )}
        </View>

        {/* Demo control. Named plainly rather than hidden — the simulator is a
            declared tool in PLANNING, not something to disguise as real GPS. */}
        {isDriver && (
          <Button
            title={simulating ? 'Stop Simulation' : 'Simulate Trip'}
            icon={simulating ? 'stop' : 'play-forward'}
            variant={simulating ? 'danger' : 'secondary'}
            onPress={toggleSimulation}
            style={{ marginTop: spacing.sm }}
          />
        )}

        {!isDriver && (
          <Button title="SOS" icon="warning" variant="danger" onPress={sos} style={{ marginTop: spacing.sm }} />
        )}
      </View>
    </View>
  );
}

function MapButton({
  icon, onPress, active, label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.mapBtn, active && { backgroundColor: colors.primary }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={19} color={active ? '#fff' : colors.text} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  panel: { padding: spacing.md, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  eta: { fontSize: 20, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 3 },
  person: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginTop: spacing.md, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  personName: { fontSize: 15, fontWeight: '600', color: colors.text },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  alertBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#FCE9E8', padding: spacing.md, borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  alertText: { flex: 1, color: colors.danger, fontSize: 13 },
  controls: { position: 'absolute', right: spacing.md, top: spacing.md, gap: spacing.sm },
  mapBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  pin: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#fff',
  },
  vehicle: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4,
  },
  mePin: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(31,111,92,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  meDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary, borderWidth: 2, borderColor: '#fff' },
});
