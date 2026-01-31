import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
} from 'react-native';
import { tokens } from './src/styles/tokens';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

interface FlightData {
  flightKey: string;
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  scheduledDeparture: string;
  scheduledArrival: string;
  estimatedDeparture?: string;
  estimatedArrival?: string;
  status: 'scheduled' | 'boarding' | 'airborne' | 'approach' | 'landed' | 'cancelled' | 'diverted';
  gate?: string;
  terminal?: string;
  latitude?: number;
  longitude?: number;
  originLatitude?: number;
  originLongitude?: number;
  destinationLatitude?: number;
  destinationLongitude?: number;
  divertedTo?: string;
  originTimezone?: string;
  destinationTimezone?: string;
}

interface Airport {
  iata: string;
  lat: number;
  lon: number;
  timezone: string;
}

const AIRPORTS: Record<string, Airport> = {
  LAX: { iata: 'LAX', lat: 33.9425, lon: -118.408, timezone: 'America/Los_Angeles' },
  JFK: { iata: 'JFK', lat: 40.6413, lon: -73.7781, timezone: 'America/New_York' },
  ORD: { iata: 'ORD', lat: 41.9742, lon: -87.9073, timezone: 'America/Chicago' },
  DFW: { iata: 'DFW', lat: 32.8998, lon: -97.0403, timezone: 'America/Chicago' },
  SFO: { iata: 'SFO', lat: 37.6213, lon: -122.379, timezone: 'America/Los_Angeles' },
  LHR: { iata: 'LHR', lat: 51.4700, lon: -0.4543, timezone: 'Europe/London' },
  CDG: { iata: 'CDG', lat: 49.0097, lon: 2.5479, timezone: 'Europe/Paris' },
  NRT: { iata: 'NRT', lat: 35.7647, lon: 140.386, timezone: 'Asia/Tokyo' },
  GVA: { iata: 'GVA', lat: 46.2381, lon: 6.1090, timezone: 'Europe/Zurich' },
  AMS: { iata: 'AMS', lat: 52.3105, lon: 4.7683, timezone: 'Europe/Amsterdam' },
  FRA: { iata: 'FRA', lat: 50.0379, lon: 8.5622, timezone: 'Europe/Berlin' },
};

interface WeatherData {
  temp: number;
  conditions: string;
  forecast?: string;
  timezone?: string;
}

export default function App() {
  const [screen, setScreen] = useState<'input' | 'ambiguity' | 'tracking'>('input');
  const [flightNumber, setFlightNumber] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [flightOptions, setFlightOptions] = useState<FlightData[]>([]);
  const [currentFlight, setCurrentFlight] = useState<FlightData | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const planePosition = useRef(new Animated.Value(0)).current;
  const planeRotate = useRef(new Animated.Value(0)).current;

  const aviationstackKey =
    process.env.EXPO_PUBLIC_AVIATIONSTACK_KEY || process.env.AVIATIONSTACK_KEY || '';

  useEffect(() => {
    if (currentFlight && (currentFlight.status === 'airborne' || currentFlight.status === 'approach')) {
      const progress = calculateProgress();
      Animated.timing(planePosition, {
        toValue: progress,
        duration: 2000,
        useNativeDriver: false,
      }).start();

      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(planeRotate, {
            toValue: 1,
            duration: 3000,
            useNativeDriver: false,
          }),
          Animated.timing(planeRotate, {
            toValue: 0,
            duration: 3000,
            useNativeDriver: false,
          }),
        ])
      );
      loop.start();

      return () => {
        planeRotate.stopAnimation();
        loop.stop();
      };
    } else if (currentFlight?.status === 'landed') {
      Animated.timing(planePosition, {
        toValue: 1,
        duration: 500,
        useNativeDriver: false,
      }).start();
    }
  }, [currentFlight]);

  useEffect(() => {
    if (currentFlight && screen === 'tracking') {
      const interval = setInterval(() => {
        fetchFlightUpdate();
      }, 45000);
      return () => clearInterval(interval);
    }
  }, [currentFlight, screen]);

  const handleTrackFlight = () => {
    if (!flightNumber.trim()) return;
    fetchFlightOptions(flightNumber.trim());
  };

  const handleSelectFlight = (flight: FlightData) => {
    setCurrentFlight(flight);
    fetchWeatherForDestination(flight);
    setLastUpdated(new Date());
    setScreen('tracking');
    setShowDatePicker(false);
  };

  const fetchFlightUpdate = () => {
    if (!currentFlight) return;
    fetchLiveFlight(currentFlight.flightNumber, false);
  };

  const fetchFlightOptions = async (flightNumberInput: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const options = await fetchLiveFlights(flightNumberInput);
      if (options.length > 1) {
        setFlightOptions(options);
        setScreen('ambiguity');
      } else if (options.length === 1) {
        setCurrentFlight(options[0]);
        fetchWeatherForDestination(options[0]);
        setLastUpdated(new Date());
        setScreen('tracking');
      } else {
        setErrorMessage('No matching flights found.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to fetch live flight data.');
    } finally {
      setLoading(false);
    }
  };

  const fetchLiveFlight = async (flightNumberInput: string, updateScreen = true) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const options = await fetchLiveFlights(flightNumberInput);
      if (options.length === 0) {
        setErrorMessage('No matching flights found.');
        return;
      }
      const match = selectBestFlightMatch(options, currentFlight);
      setCurrentFlight(match);
      fetchWeatherForDestination(match);
      setLastUpdated(new Date());
      if (updateScreen) {
        setScreen('tracking');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to fetch live flight data.');
    } finally {
      setLoading(false);
    }
  };

  const fetchLiveFlights = async (flightNumberInput: string): Promise<FlightData[]> => {
    if (!aviationstackKey) {
      throw new Error('Missing aviationstack API key. Set EXPO_PUBLIC_AVIATIONSTACK_KEY.');
    }

    const response = await fetch(
      `https://api.aviationstack.com/v1/flights?access_key=${aviationstackKey}&flight_iata=${encodeURIComponent(
        flightNumberInput
      )}`
    );

    if (!response.ok) {
      throw new Error('Failed to reach aviationstack API.');
    }

    const payload = await response.json();
    if (!payload?.data || payload.data.length === 0) {
      return [];
    }

    return payload.data
      .map((item: any) => mapAviationstackFlight(item))
      .filter((flight: FlightData | null) => Boolean(flight)) as FlightData[];
  };

  const mapAviationstackFlight = (item: any): FlightData | null => {
    if (!item?.flight?.iata) {
      return null;
    }

    const status = mapFlightStatus(item.flight_status, item.live);
    const departure = item.departure || {};
    const arrival = item.arrival || {};
    const live = item.live || {};

    const origin = departure.iata || departure.icao || '';
    const destination = arrival.iata || arrival.icao || '';

    return {
      flightKey: `${item.flight.iata}-${item.flight.date || item.flight_number || Date.now()}`,
      airline: item.airline?.iata || item.airline?.name || 'Unknown',
      flightNumber: item.flight.iata,
      origin,
      destination,
      scheduledDeparture: departure.scheduled || departure.estimated || new Date().toISOString(),
      scheduledArrival: arrival.scheduled || arrival.estimated || new Date().toISOString(),
      estimatedDeparture: departure.estimated || undefined,
      estimatedArrival: arrival.estimated || undefined,
      status,
      gate: pickGate(status, departure, arrival),
      terminal: pickTerminal(status, departure, arrival),
      latitude: live.latitude ?? undefined,
      longitude: live.longitude ?? undefined,
      originLatitude: departure.latitude ?? AIRPORTS[origin]?.lat,
      originLongitude: departure.longitude ?? AIRPORTS[origin]?.lon,
      destinationLatitude: arrival.latitude ?? AIRPORTS[destination]?.lat,
      destinationLongitude: arrival.longitude ?? AIRPORTS[destination]?.lon,
      divertedTo: arrival.iata ?? undefined,
      originTimezone: departure.timezone ?? AIRPORTS[origin]?.timezone,
      destinationTimezone: arrival.timezone ?? undefined,
    };
  };

  const mapFlightStatus = (status: string, live: any): FlightData['status'] => {
    if (!status) return 'scheduled';
    if (status === 'cancelled') return 'cancelled';
    if (status === 'diverted') return 'diverted';
    if (status === 'landed') return 'landed';
    if (status === 'active') {
      if (live?.is_ground) {
        return 'boarding';
      }
      return live?.direction ? 'airborne' : 'airborne';
    }
    return 'scheduled';
  };

  const pickGate = (status: FlightData['status'], departure: any, arrival: any) => {
    if (status === 'landed' || status === 'approach') {
      return arrival?.gate || arrival?.baggage;
    }
    return departure?.gate;
  };

  const pickTerminal = (status: FlightData['status'], departure: any, arrival: any) => {
    if (status === 'landed' || status === 'approach') {
      return arrival?.terminal;
    }
    return departure?.terminal;
  };

  const selectBestFlightMatch = (options: FlightData[], current: FlightData | null) => {
    if (!current) {
      return options[0];
    }
    return (
      options.find(
        (option) =>
          option.flightNumber === current.flightNumber &&
          option.origin === current.origin &&
          option.destination === current.destination
      ) || options[0]
    );
  };

  const fetchWeatherForDestination = async (flight: FlightData) => {
    const coords = getDestinationCoordinates(flight);
    if (!coords) {
      setWeather(null);
      return;
    }

    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,weather_code&timezone=auto`
      );
      if (!response.ok) {
        setWeather(null);
        return;
      }
      const payload = await response.json();
      const temp = payload?.current?.temperature_2m;
      const conditions = mapWeatherCode(payload?.current?.weather_code);
      setWeather({
        temp: typeof temp === 'number' ? Math.round(temp) : 0,
        conditions,
        forecast: payload?.current?.weather_code?.toString(),
        timezone: payload?.timezone,
      });
    } catch (error) {
      setWeather(null);
    }
  };

  const mapWeatherCode = (code?: number) => {
    if (code === undefined || code === null) return 'Clear';
    if (code === 0) return 'Clear';
    if ([1, 2, 3].includes(code)) return 'Partly Cloudy';
    if ([45, 48].includes(code)) return 'Foggy';
    if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rainy';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snowy';
    if ([95, 96, 99].includes(code)) return 'Stormy';
    return 'Cloudy';
  };

  const calculateProgress = (): number => {
    if (!currentFlight) return 0;

    const { origin, destination } = getRouteCoordinates(currentFlight);
    
    if (currentFlight.status === 'landed') return 1;

    if (
      currentFlight.latitude !== undefined &&
      currentFlight.longitude !== undefined &&
      origin &&
      destination
    ) {
      const totalDist = calculateDistance(origin.lat, origin.lon, destination.lat, destination.lon);
      const currentDist = calculateDistance(origin.lat, origin.lon, currentFlight.latitude, currentFlight.longitude);
      return Math.min(currentDist / totalDist, 1);
    }

    const now = Date.now();
    const depTime = new Date(currentFlight.estimatedDeparture || currentFlight.scheduledDeparture).getTime();
    const arrTime = new Date(currentFlight.estimatedArrival || currentFlight.scheduledArrival).getTime();
    
    if (now < depTime) return 0;
    if (now > arrTime) return 1;
    
    return (now - depTime) / (arrTime - depTime);
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getProgressDots = (): number => {
    return Math.floor(calculateProgress() * 100);
  };

  const getRouteCoordinates = (flight: FlightData) => {
    const origin =
      flight.originLatitude && flight.originLongitude
        ? { lat: flight.originLatitude, lon: flight.originLongitude }
        : AIRPORTS[flight.origin];
    const destination =
      flight.destinationLatitude && flight.destinationLongitude
        ? { lat: flight.destinationLatitude, lon: flight.destinationLongitude }
        : AIRPORTS[flight.destination];
    return { origin, destination };
  };

  const getDestinationCoordinates = (flight: FlightData) => {
    if (flight.destinationLatitude && flight.destinationLongitude) {
      return { lat: flight.destinationLatitude, lon: flight.destinationLongitude };
    }
    const fallback = AIRPORTS[flight.destination];
    return fallback ? { lat: fallback.lat, lon: fallback.lon } : null;
  };

  const getDistanceMetrics = () => {
    if (!currentFlight) return null;
    const { origin, destination } = getRouteCoordinates(currentFlight);
    if (!origin || !destination) {
      return null;
    }

    const total = calculateDistance(origin.lat, origin.lon, destination.lat, destination.lon);
    if (currentFlight.latitude !== undefined && currentFlight.longitude !== undefined) {
      const traveled = calculateDistance(origin.lat, origin.lon, currentFlight.latitude, currentFlight.longitude);
      const remaining = Math.max(total - traveled, 0);
      return { total, traveled, remaining };
    }

    const progress = calculateProgress();
    const traveled = total * progress;
    const remaining = Math.max(total - traveled, 0);
    return { total, traveled, remaining };
  };

  const formatTime = (isoString: string, timezoneId?: string): string => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: timezoneId,
      hour12: false,
    });
  };

  const getCountdown = (): string => {
    if (!currentFlight) return '';
    const now = Date.now();
    const depTime = new Date(currentFlight.estimatedDeparture || currentFlight.scheduledDeparture).getTime();
    const diff = depTime - now;
    
    if (diff <= 0) return 'Departing';
    
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${mins}m`;
  };

  const getDestinationLocalTime = (): string => {
    if (!currentFlight) return '';
    const timezone = currentFlight.destinationTimezone || weather?.timezone;
    try {
      return new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: timezone,
      });
    } catch (error) {
      return new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
  };

  if (screen === 'input') {
    return (
      <View style={styles.container}>
        <View style={styles.inputCard}>
          <Text style={[styles.label, { color: tokens.colors['secondary-light'] }]}>
            FLIGHT NUMBER
          </Text>
          <TextInput
            style={styles.input}
            value={flightNumber}
            onChangeText={setFlightNumber}
            placeholder="BA123"
            placeholderTextColor={tokens.colors['secondary-dark']}
            autoCapitalize="characters"
          />
          {errorMessage && (
            <Text style={[styles.errorText, { color: tokens.colors.red }]}>{errorMessage}</Text>
          )}
          <TouchableOpacity
            style={[styles.trackButton, loading && styles.buttonDisabled]}
            onPress={handleTrackFlight}
            activeOpacity={0.7}
            disabled={loading}
          >
            <Text style={styles.trackButtonText}>{loading ? 'LOADING...' : 'TRACK FLIGHT'}</Text>
          </TouchableOpacity>
          <Text style={styles.helperText}>
            Live data requires an aviationstack API key (EXPO_PUBLIC_AVIATIONSTACK_KEY).
          </Text>
        </View>
      </View>
    );
  }

  if (screen === 'ambiguity') {
    return (
      <View style={styles.container}>
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={[styles.label, { color: tokens.colors['secondary-light'], marginBottom: tokens.spacing[3] }]}>
            SELECT FLIGHT
          </Text>
          {errorMessage && (
            <Text style={[styles.errorText, { color: tokens.colors.red }]}>{errorMessage}</Text>
          )}
          {flightOptions.map((flight, index) => {
            const { origin, destination } = getRouteCoordinates(flight);
            const originTimezone = flight.originTimezone || origin?.timezone;
            const destinationTimezone = flight.destinationTimezone || destination?.timezone;
            
            return (
              <TouchableOpacity
                key={flight.flightKey}
                style={styles.flightOption}
                onPress={() => handleSelectFlight(flight)}
                activeOpacity={0.7}
              >
                <View style={styles.optionHeader}>
                  <Text style={styles.optionAirline}>{flight.airline} {flight.flightNumber}</Text>
                  <Text style={[styles.optionStatus, { color: tokens.colors['secondary-light'] }]}>
                    {flight.status.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.optionRoute}>
                  <Text style={styles.optionAirport}>{flight.origin}</Text>
                  <Text style={[styles.optionArrow, { color: tokens.colors['secondary-light'] }]}>→</Text>
                  <Text style={styles.optionAirport}>{flight.destination}</Text>
                </View>
                <View style={styles.optionTimes}>
                  <Text style={[styles.optionTime, { color: tokens.colors['secondary-light'] }]}>
                    {formatTime(flight.scheduledDeparture, originTimezone)}
                  </Text>
                  <Text style={[styles.optionTime, { color: tokens.colors['secondary-light'] }]}>
                    {formatTime(flight.scheduledArrival, destinationTimezone)}
                  </Text>
                </View>
                {flight.gate && flight.terminal && (
                  <Text style={[styles.optionGate, { color: tokens.colors['secondary-light'] }]}>
                    Terminal {flight.terminal} · Gate {flight.gate}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  if (screen === 'tracking' && currentFlight) {
    const progress = getProgressDots();
    const { origin, destination } = getRouteCoordinates(currentFlight);
    const originTimezone = currentFlight.originTimezone || origin?.timezone;
    const destinationTimezone = currentFlight.destinationTimezone || destination?.timezone;
    const distanceMetrics = getDistanceMetrics();

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.flightNum}>{currentFlight.airline} {currentFlight.flightNumber}</Text>
            <Text style={[styles.status, currentFlight.status === 'cancelled' && { color: tokens.colors.red }]}>
              {currentFlight.status.toUpperCase()}
            </Text>
          </View>
          <View style={styles.route}>
            <Text style={styles.airport}>{currentFlight.origin}</Text>
            <Text style={[styles.arrow, { color: tokens.colors['secondary-light'] }]}>→</Text>
            <Text style={styles.airport}>{currentFlight.destination}</Text>
          </View>
        </View>

        <View style={styles.mapContainer}>
          <Svg width="290" height="60" viewBox="0 0 290 60">
            <Defs>
              <LinearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={tokens.colors['secondary-dark']} stopOpacity="0.3" />
                <Stop offset={`${progress}%`} stopColor={tokens.colors.light} stopOpacity="0.6" />
                <Stop offset={`${progress}%`} stopColor={tokens.colors['secondary-dark']} stopOpacity="0.3" />
                <Stop offset="1" stopColor={tokens.colors['secondary-dark']} stopOpacity="0.3" />
              </LinearGradient>
            </Defs>
            
            <Path
              d="M 20 30 Q 145 10, 270 30"
              stroke="url(#routeGrad)"
              strokeWidth="2"
              strokeDasharray="4,4"
              fill="none"
            />
            
            <Circle cx="20" cy="30" r="4" fill={tokens.colors.light} />
            <Circle cx="270" cy="30" r="4" fill={tokens.colors.light} />
            
            {(currentFlight.status === 'airborne' || currentFlight.status === 'approach') && (
              <AnimatedPlane
                progress={planePosition}
                rotate={planeRotate}
              />
            )}
            
            {currentFlight.status === 'landed' && (
              <Circle cx="270" cy="30" r="6" fill={tokens.colors.light} />
            )}
          </Svg>
        </View>

        <View style={styles.infoGrid}>
          {currentFlight.status === 'scheduled' && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: tokens.colors['secondary-light'] }]}>DEPARTS IN</Text>
              <Text style={styles.infoValue}>{getCountdown()}</Text>
            </View>
          )}
          
          {(currentFlight.status === 'airborne' || currentFlight.status === 'approach') && (
            <>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: tokens.colors['secondary-light'] }]}>PROGRESS</Text>
                <Text style={styles.infoValue}>{progress}%</Text>
              </View>
              <View style={styles.dotsContainer}>
                {Array.from({ length: 100 }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      i < progress && { backgroundColor: tokens.colors.light },
                    ]}
                  />
                ))}
              </View>
            </>
          )}
          {distanceMetrics && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: tokens.colors['secondary-light'] }]}>DISTANCE</Text>
              <Text style={styles.infoValue}>
                {Math.round(distanceMetrics.traveled)} km / {Math.round(distanceMetrics.remaining)} km left
              </Text>
            </View>
          )}

          <View style={styles.timesRow}>
            <View style={styles.timeBlock}>
              <Text style={[styles.infoLabel, { color: tokens.colors['secondary-light'] }]}>DEPARTURE</Text>
              <Text style={styles.timeValue}>
                {formatTime(
                  currentFlight.estimatedDeparture || currentFlight.scheduledDeparture,
                  originTimezone
                )}
              </Text>
              {currentFlight.estimatedDeparture && 
               currentFlight.estimatedDeparture !== currentFlight.scheduledDeparture && (
                <Text style={[styles.scheduledTime, { color: tokens.colors['secondary-dark'] }]}>
                  Sched: {formatTime(currentFlight.scheduledDeparture, originTimezone)}
                </Text>
              )}
            </View>
            <View style={styles.timeBlock}>
              <Text style={[styles.infoLabel, { color: tokens.colors['secondary-light'] }]}>ARRIVAL</Text>
              <Text style={styles.timeValue}>
                {formatTime(
                  currentFlight.estimatedArrival || currentFlight.scheduledArrival,
                  destinationTimezone
                )}
              </Text>
              {currentFlight.estimatedArrival && 
               currentFlight.estimatedArrival !== currentFlight.scheduledArrival && (
                <Text style={[styles.scheduledTime, { color: tokens.colors['secondary-dark'] }]}>
                  Sched: {formatTime(currentFlight.scheduledArrival, destinationTimezone)}
                </Text>
              )}
            </View>
          </View>

          {(currentFlight.gate || currentFlight.terminal) && (
            <View style={styles.gateTerminalRow}>
              {currentFlight.terminal && (
                <View style={styles.gateBlock}>
                  <Text style={[styles.infoLabel, { color: tokens.colors['secondary-light'] }]}>TERMINAL</Text>
                  <Text style={styles.infoValue}>{currentFlight.terminal}</Text>
                </View>
              )}
              {currentFlight.gate && (
                <View style={styles.gateBlock}>
                  <Text style={[styles.infoLabel, { color: tokens.colors['secondary-light'] }]}>GATE</Text>
                  <Text style={styles.infoValue}>{currentFlight.gate}</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: tokens.colors['secondary-light'] }]}>DEST TIME</Text>
            <Text style={styles.infoValue}>{getDestinationLocalTime()}</Text>
          </View>

          {weather && destination && (
            <View style={styles.weatherRow}>
              <Text style={[styles.infoLabel, { color: tokens.colors['secondary-light'] }]}>
                {destination.iata} WEATHER
              </Text>
              <Text style={styles.weatherValue}>{weather.temp}°C · {weather.conditions}</Text>
            </View>
          )}
        </View>

        {lastUpdated && (
          <Text style={styles.timestamp}>
            Updated {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </Text>
        )}
        {errorMessage && (
          <Text style={[styles.errorText, { color: tokens.colors.red }]}>{errorMessage}</Text>
        )}
      </View>
    );
  }

  return null;
}

function AnimatedPlane({ progress, rotate }: { progress: Animated.Value; rotate: Animated.Value }) {
  const [planeX, setPlaneX] = useState(20);
  const [planeY, setPlaneY] = useState(30);

  useEffect(() => {
    const listenerId = progress.addListener(({ value }) => {
      const x = 20 + (270 - 20) * value;
      const y = value <= 0.5 
        ? 30 - (30 - 20) * (value / 0.5) 
        : 20 + (30 - 20) * ((value - 0.5) / 0.5);
      setPlaneX(x);
      setPlaneY(y);
    });

    return () => {
      progress.removeListener(listenerId);
    };
  }, [progress]);

  const rotateValue = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['-5deg', '5deg'],
  });

  return (
    <Animated.View style={{ transform: [{ rotate: rotateValue }] }}>
      <Svg width="290" height="60" style={{ position: 'absolute' }}>
        <Circle cx={planeX} cy={planeY} r="5" fill={tokens.colors.light} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: tokens.colors.dark,
    borderRadius: 22,
    padding: tokens.spacing[4],
    overflow: 'hidden',
  },
  inputCard: {
    flex: 1,
    justifyContent: 'center',
  },
  label: {
    ...tokens.textStyles.labelUppercasedSmall,
    marginBottom: tokens.spacing[2],
  },
  input: {
    ...tokens.textStyles.ndotHeadlineMedium,
    color: tokens.colors.light,
    borderBottomWidth: 2,
    borderBottomColor: tokens.colors['secondary-dark'],
    paddingVertical: tokens.spacing[2],
    marginBottom: tokens.spacing[6],
  },
  trackButton: {
    backgroundColor: tokens.colors.light,
    paddingVertical: tokens.spacing[3],
    borderRadius: tokens.borderRadius.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  trackButtonText: {
    ...tokens.textStyles.labelMedium,
    color: tokens.colors.dark,
  },
  helperText: {
    ...tokens.textStyles.bodySmall,
    color: tokens.colors['secondary-light'],
    marginTop: tokens.spacing[2],
  },
  errorText: {
    ...tokens.textStyles.bodySmall,
    marginBottom: tokens.spacing[2],
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  flightOption: {
    backgroundColor: tokens.colors['secondary-dark'],
    padding: tokens.spacing[3],
    borderRadius: tokens.borderRadius.md,
    marginBottom: tokens.spacing[2],
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing[1],
  },
  optionAirline: {
    ...tokens.textStyles.labelMedium,
    color: tokens.colors.light,
  },
  optionStatus: {
    ...tokens.textStyles.labelSmall,
  },
  optionRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: tokens.spacing[1],
  },
  optionAirport: {
    ...tokens.textStyles.bodyMedium,
    color: tokens.colors.light,
  },
  optionArrow: {
    ...tokens.textStyles.bodyMedium,
    marginHorizontal: tokens.spacing[2],
  },
  optionTimes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing[1],
  },
  optionTime: {
    ...tokens.textStyles.bodySmall,
  },
  optionGate: {
    ...tokens.textStyles.bodySmall,
  },
  header: {
    marginBottom: tokens.spacing[3],
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacing[1],
  },
  flightNum: {
    ...tokens.textStyles.labelMedium,
    color: tokens.colors.light,
  },
  status: {
    ...tokens.textStyles.labelSmall,
    color: tokens.colors['secondary-light'],
  },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  airport: {
    ...tokens.textStyles.ndotHeadlineXSmall,
    color: tokens.colors.light,
  },
  arrow: {
    ...tokens.textStyles.bodyMedium,
    marginHorizontal: tokens.spacing[2],
  },
  mapContainer: {
    height: 60,
    marginVertical: tokens.spacing[2],
    alignItems: 'center',
  },
  infoGrid: {
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing[2],
  },
  infoLabel: {
    ...tokens.textStyles.labelSmall,
  },
  infoValue: {
    ...tokens.textStyles.bodyMedium,
    color: tokens.colors.light,
  },
  timesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing[2],
  },
  timeBlock: {
    flex: 1,
  },
  timeValue: {
    ...tokens.textStyles.bodyMedium,
    color: tokens.colors.light,
  },
  scheduledTime: {
    ...tokens.textStyles.bodySmall,
    marginTop: tokens.spacing[1],
  },
  gateTerminalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing[2],
  },
  gateBlock: {
    flex: 1,
  },
  dotsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    marginBottom: tokens.spacing[3],
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: tokens.borderRadius.full,
    backgroundColor: tokens.colors['secondary-dark'],
  },
  weatherRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: tokens.spacing[2],
  },
  weatherValue: {
    ...tokens.textStyles.bodySmall,
    color: tokens.colors.light,
  },
  timestamp: {
    ...tokens.textStyles.labelSmall,
    color: tokens.colors['secondary-dark'],
    textAlign: 'center',
    marginTop: tokens.spacing[2],
  },
});
