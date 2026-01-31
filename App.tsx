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
  divertedTo?: string;
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
  
  const planePosition = useRef(new Animated.Value(0)).current;
  const planeRotate = useRef(new Animated.Value(0)).current;

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
    
    const now = Date.now();
    const depTime = now + 5400000;
    const arrTime = now + 12600000;
    
    const mockOptions: FlightData[] = [
      {
        flightKey: `${flightNumber}-${Date.now()}`,
        airline: 'BA',
        flightNumber: flightNumber,
        origin: 'LHR',
        destination: 'GVA',
        scheduledDeparture: new Date(depTime).toISOString(),
        scheduledArrival: new Date(arrTime).toISOString(),
        estimatedDeparture: new Date(depTime + 300000).toISOString(),
        estimatedArrival: new Date(arrTime - 600000).toISOString(),
        status: 'scheduled',
        gate: 'A12',
        terminal: '5',
      },
      {
        flightKey: `${flightNumber}-${Date.now() + 1}`,
        airline: 'EZY',
        flightNumber: flightNumber,
        origin: 'LHR',
        destination: 'GVA',
        scheduledDeparture: new Date(now + 10800000).toISOString(),
        scheduledArrival: new Date(now + 18000000).toISOString(),
        estimatedDeparture: new Date(now + 10800000).toISOString(),
        estimatedArrival: new Date(now + 18000000).toISOString(),
        status: 'scheduled',
        gate: 'B7',
        terminal: '3',
      },
    ];

    if (mockOptions.length > 1) {
      setFlightOptions(mockOptions);
      setScreen('ambiguity');
    } else {
      setCurrentFlight(mockOptions[0]);
      fetchWeather(mockOptions[0].destination);
      setLastUpdated(new Date());
      setScreen('tracking');
    }
  };

  const handleSelectFlight = (flight: FlightData) => {
    setCurrentFlight(flight);
    fetchWeather(flight.destination);
    setLastUpdated(new Date());
    setScreen('tracking');
    setShowDatePicker(false);
  };

  const fetchFlightUpdate = () => {
    if (!currentFlight) return;

    const statuses: FlightData['status'][] = ['scheduled', 'boarding', 'airborne', 'approach', 'landed'];
    const currentIndex = statuses.indexOf(currentFlight.status);
    const nextStatus = currentIndex < statuses.length - 1 ? statuses[currentIndex + 1] : currentFlight.status;

    const origin = AIRPORTS[currentFlight.origin];
    const dest = AIRPORTS[currentFlight.destination];
    
    let lat = currentFlight.latitude;
    let lon = currentFlight.longitude;
    
    if (nextStatus === 'airborne' && origin && dest) {
      lat = origin.lat + (dest.lat - origin.lat) * 0.3;
      lon = origin.lon + (dest.lon - origin.lon) * 0.3;
    } else if (nextStatus === 'approach' && origin && dest) {
      lat = origin.lat + (dest.lat - origin.lat) * 0.7;
      lon = origin.lon + (dest.lon - origin.lon) * 0.7;
    }

    const updated: FlightData = {
      ...currentFlight,
      status: nextStatus,
      latitude: lat,
      longitude: lon,
    };

    setCurrentFlight(updated);
    setLastUpdated(new Date());
  };

  const fetchWeather = (airportCode: string) => {
    const airport = AIRPORTS[airportCode];
    if (!airport) {
      setWeather(null);
      return;
    }

    const temps: Record<string, number> = {
      LAX: 22,
      JFK: 15,
      ORD: 12,
      DFW: 25,
      SFO: 18,
      LHR: 14,
      CDG: 16,
      NRT: 20,
      GVA: 18,
      AMS: 13,
      FRA: 15,
    };

    const conditions: Record<string, string> = {
      LAX: 'Clear',
      JFK: 'Cloudy',
      ORD: 'Partly Cloudy',
      DFW: 'Clear',
      SFO: 'Foggy',
      LHR: 'Rainy',
      CDG: 'Cloudy',
      NRT: 'Clear',
      GVA: 'Clear',
      AMS: 'Cloudy',
      FRA: 'Partly Cloudy',
    };

    setWeather({
      temp: temps[airportCode] || 18,
      conditions: conditions[airportCode] || 'Clear',
      forecast: 'Partly Cloudy',
    });
  };

  const calculateProgress = (): number => {
    if (!currentFlight) return 0;

    const origin = AIRPORTS[currentFlight.origin];
    const dest = AIRPORTS[currentFlight.destination];
    
    if (currentFlight.latitude && currentFlight.longitude && origin && dest) {
      const totalDist = calculateDistance(origin.lat, origin.lon, dest.lat, dest.lon);
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
          <TouchableOpacity
            style={styles.trackButton}
            onPress={handleTrackFlight}
            activeOpacity={0.7}
          >
            <Text style={styles.trackButtonText}>TRACK FLIGHT</Text>
          </TouchableOpacity>
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
          {flightOptions.map((flight, index) => {
            const origin = AIRPORTS[flight.origin];
            const dest = AIRPORTS[flight.destination];
            
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
                    {formatTime(flight.scheduledDeparture, origin?.timezone)}
                  </Text>
                  <Text style={[styles.optionTime, { color: tokens.colors['secondary-light'] }]}>
                    {formatTime(flight.scheduledArrival, dest?.timezone)}
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
    const origin = AIRPORTS[currentFlight.origin];
    const dest = AIRPORTS[currentFlight.destination];

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

          <View style={styles.timesRow}>
            <View style={styles.timeBlock}>
              <Text style={[styles.infoLabel, { color: tokens.colors['secondary-light'] }]}>DEPARTURE</Text>
              <Text style={styles.timeValue}>
                {formatTime(
                  currentFlight.estimatedDeparture || currentFlight.scheduledDeparture,
                  origin?.timezone
                )}
              </Text>
              {currentFlight.estimatedDeparture && 
               currentFlight.estimatedDeparture !== currentFlight.scheduledDeparture && (
                <Text style={[styles.scheduledTime, { color: tokens.colors['secondary-dark'] }]}>
                  Sched: {formatTime(currentFlight.scheduledDeparture, origin?.timezone)}
                </Text>
              )}
            </View>
            <View style={styles.timeBlock}>
              <Text style={[styles.infoLabel, { color: tokens.colors['secondary-light'] }]}>ARRIVAL</Text>
              <Text style={styles.timeValue}>
                {formatTime(
                  currentFlight.estimatedArrival || currentFlight.scheduledArrival,
                  dest?.timezone
                )}
              </Text>
              {currentFlight.estimatedArrival && 
               currentFlight.estimatedArrival !== currentFlight.scheduledArrival && (
                <Text style={[styles.scheduledTime, { color: tokens.colors['secondary-dark'] }]}>
                  Sched: {formatTime(currentFlight.scheduledArrival, dest?.timezone)}
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

          {weather && dest && (
            <View style={styles.weatherRow}>
              <Text style={[styles.infoLabel, { color: tokens.colors['secondary-light'] }]}>
                {dest.iata} WEATHER
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
  trackButtonText: {
    ...tokens.textStyles.labelMedium,
    color: tokens.colors.dark,
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