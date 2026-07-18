import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { Badge, Button, Card, ErrorNote } from '../components/ui';
import { api } from '../lib/api';
import { getSocket, joinTrip, leaveTrip } from '../lib/socket';
import { colors, spacing } from '../theme';
import type { ScreenProps } from '../lib/navigation';

interface Params { tripId: string; rideId: string; isDriver: boolean }

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
 */
export default function TrackRide({ route }: ScreenProps<'TrackRide'>) {
  const { tripId, rideId, isDriver } = route.params;
  const [position, setPosition] = useState<Broadcast | null>(null);
  const [line, setLine] = useState<{ latitude: number; longitude: number }[]>([]);
  const [trail, setTrail] = useState<{ latitude: number; longitude: number }[]>([]);
  const [alert, setAlert] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watcher = useRef<Location.LocationSubscription | null>(null);

  // Planned route, drawn once.
  useEffect(() => {
    api<{ coordinates: [number, number][] }>(`/rides/${rideId}/route`)
      .then((g) => setLine(g.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))))
      .catch(() => setLine([]));
  }, [rideId]);

  // Path already travelled, so opening the screen mid-trip is not a blank map.
  useEffect(() => {
    api<{ lat: number; lng: number }[]>(`/trips/${tripId}/track`)
      .then((pts) => setTrail(pts.map((p) => ({ latitude: p.lat, longitude: p.lng }))))
      .catch(() => undefined);
  }, [tripId]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        await joinTrip(tripId);
      } catch (e) {
        if (active) setError((e as Error).message);
        return;
      }

      const socket = getSocket();

      socket.on('location:broadcast', (b: Broadcast) => {
        if (!active) return;
        setPosition(b);
        setTrail((t) => [...t.slice(-400), { latitude: b.lat, longitude: b.lng }]);
      });

      socket.on('safety:alert', (a: { detail: string }) => {
        if (!active) return;
        setAlert(a.detail);
      });

      // Only the driver publishes location.
      if (isDriver) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (active) setError('Location permission is needed to share your position with passengers.');
          return;
        }
        watcher.current = await Location.watchPositionAsync(
          // 3s / 20m: frequent enough that the marker moves smoothly, sparse
          // enough not to flatten the battery on a 40-minute commute.
          { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 20 },
          (loc) => {
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
      socket.off('location:broadcast');
      socket.off('safety:alert');
      leaveTrip(tripId);
    };
  }, [tripId, isDriver]);

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

  const region = position
    ? { latitude: position.lat, longitude: position.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }
    : line.length
      ? { latitude: line[0].latitude, longitude: line[0].longitude, latitudeDelta: 0.12, longitudeDelta: 0.12 }
      : { latitude: 23.05, longitude: 72.6, latitudeDelta: 0.2, longitudeDelta: 0.2 };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <MapView provider={PROVIDER_DEFAULT} style={{ flex: 1 }} region={region}>
        {line.length > 1 && (
          <Polyline coordinates={line} strokeWidth={4} strokeColor={colors.border} />
        )}
        {trail.length > 1 && (
          <Polyline coordinates={trail} strokeWidth={4} strokeColor={colors.primary} />
        )}
        {position && (
          <Marker
            coordinate={{ latitude: position.lat, longitude: position.lng }}
            title="Vehicle"
            pinColor={colors.primary}
          />
        )}
        {line.length > 1 && (
          <Marker coordinate={line[line.length - 1]} title="Destination" pinColor={colors.danger} />
        )}
      </MapView>

      <View style={s.panel}>
        {!!error && <ErrorNote text={error} />}
        {!!alert && <ErrorNote text={`Safety alert: ${alert}`} />}

        <Card style={{ marginBottom: 0 }}>
          {position ? (
            <>
              <View style={s.row}>
                <Text style={s.eta}>
                  {position.etaSeconds != null
                    ? position.etaSeconds < 60
                      ? 'Arriving now'
                      : `Coming in ${Math.round(position.etaSeconds / 60)} minutes`
                    : 'En route'}
                </Text>
                {position.offRouteM != null && (
                  <Badge
                    text={position.offRouteM > 500 ? 'Off route' : 'On route'}
                    tone={position.offRouteM > 500 ? 'red' : 'green'}
                  />
                )}
              </View>
              {position.remainingM != null && (
                <Text style={s.meta}>{(position.remainingM / 1000).toFixed(1)} km remaining</Text>
              )}
            </>
          ) : (
            <Text style={s.meta}>
              {isDriver ? 'Starting location sharing…' : 'Waiting for the driver to share location…'}
            </Text>
          )}
        </Card>

        {!isDriver && (
          <Button title="SOS" variant="danger" onPress={sos} style={{ marginTop: spacing.sm }} />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  panel: { padding: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eta: { fontSize: 18, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
});
