import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  NativeEventEmitter, NativeModules,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity, View
} from 'react-native';
import BleManager from 'react-native-ble-manager';
import { BarChart, LineChart } from 'react-native-chart-kit';

const screenWidth = Dimensions.get("window").width;

interface BluetoothDevice {
  id: string;
  name?: string;
}

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

export default function SmartStickController() {
  // --- STATE ---
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);

  // Toggles
  const [isRasEnabled, setIsRasEnabled] = useState(false);
  const [isHapticEnabled, setIsHapticEnabled] = useState(false);
  const [isLaserEnabled, setIsLaserEnabled] = useState(false);

  // NEW: Chart Data State
  // We initialize with flat data so the graph doesn't crash before you walk
  const [gaitData, setGaitData] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); 
  const [weeklySteps, setWeeklySteps] = useState<number[]>([1200, 2100, 1800, 2400, 1500, 3000, 0]); // Fake past data for the dashboard

  // --- BLUETOOTH ENGINE ---
  useEffect(() => {
    BleManager.start({ showAlert: false }).then(() => console.log("Bluetooth Engine Started"));

    const discoverListener = bleManagerEmitter.addListener('BleManagerDiscoverPeripheral', (device: BluetoothDevice) => {
        if (device.name) {
          setDevices((prev) => prev.find(d => d.id === device.id) ? prev : [...prev, device]);
        }
      }
    );

    const stopListener = bleManagerEmitter.addListener('BleManagerStopScan', () => setIsScanning(false));

    // NEW: Listener for incoming Gait Data from the Pi!
    const updateListener = bleManagerEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', (data) => {
        // When the Pi sends a number, we push it to the end of the graph and remove the oldest number
        const newValue = data.value[0]; 
        setGaitData(currentData => {
            const newData = [...currentData.slice(1), newValue];
            return newData;
        });
    });

    return () => {
      discoverListener.remove();
      stopListener.remove();
      updateListener.remove();
    };
  }, []);

  const startScan = () => {
    if (!isScanning) {
      setDevices([]);
      setIsScanning(true);
      // @ts-ignore
      BleManager.scan([], 5, true).catch(err => {
          console.error(err);
          setIsScanning(false);
      });
    }
  };

  const connectToDevice = async (id: string) => {
    try {
      await BleManager.connect(id);
      setConnectedDeviceId(id);
      
      // Placeholder UUIDs - Ask the Pi to start notifying us of changes!
      const SERVICE_UUID = "1234abcd-0000-1000-8000-00805f9b34fb";
      const CHAR_UUID = "abcd1234-0000-1000-8000-00805f9b34fb";
      
      await BleManager.retrieveServices(id);
      await BleManager.startNotification(id, SERVICE_UUID, CHAR_UUID);
      
      alert('Connected & Listening to Smart Stick!');
    } catch (error) {
      console.error('Connection error', error);
      alert('Failed to connect');
    }
  };

  const sendCommandToStick = async (commandString: string) => {
    if (!connectedDeviceId) return;
    const byteData = commandString.split('').map((char) => char.charCodeAt(0));
    try {
      await BleManager.write(connectedDeviceId, "1234abcd-0000-1000-8000-00805f9b34fb", "abcd1234-0000-1000-8000-00805f9b34fb", byteData);
    } catch (error) {
      console.error("Failed to send command", error);
    }
  };

  // --- CHART DESIGN SETTINGS ---
  const chartConfig = {
    backgroundGradientFrom: "#ffffff",
    backgroundGradientTo: "#ffffff",
    color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`, // Apple Blue
    strokeWidth: 3,
    barPercentage: 0.6,
    useShadowColorFromDataset: false 
  };

  // --- UI ---
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ alignItems: 'center', paddingBottom: 50 }}>
      <Text style={styles.title}>Smart Stick Controller</Text>
      
      {/* 1. BLUETOOTH CONNECTION */}
      <TouchableOpacity style={[styles.button, isScanning && styles.buttonDisabled]} onPress={startScan} disabled={isScanning}>
        <Text style={styles.buttonText}>{isScanning ? 'Scanning...' : 'Find My Smart Stick'}</Text>
      </TouchableOpacity>

      <View style={styles.listContainer}>
        {devices.map((item) => (
          <TouchableOpacity key={item.id} style={[styles.deviceBox, connectedDeviceId === item.id && styles.deviceBoxConnected]} onPress={() => connectToDevice(item.id)}>
            <Text style={styles.deviceName}>{item.name}</Text>
            {connectedDeviceId === item.id && <Text style={styles.connectedText}>Connected!</Text>}
          </TouchableOpacity>
        ))}
      </View>

      {/* 2. REAL-TIME GAIT GRAPH */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Live Gait Monitor</Text>
        <LineChart
          data={{
            labels: ["", "", "", "", "", "", "", "", "", "Now"],
            datasets: [{ data: gaitData }]
          }}
          width={screenWidth - 60}
          height={180}
          chartConfig={chartConfig}
          bezier
          style={styles.chartStyle}
          withDots={false}
          withInnerLines={false}
        />
      </View>

      {/* 3. SMART CONTROLS */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Cueing Controls</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>RAS (Audio Beeps)</Text>
          <Switch value={isRasEnabled} onValueChange={(v) => { setIsRasEnabled(v); sendCommandToStick(v ? "RAS:1" : "RAS:0"); }} />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Haptic Feedback</Text>
          <Switch value={isHapticEnabled} onValueChange={(v) => { setIsHapticEnabled(v); sendCommandToStick(v ? "HAP:1" : "HAP:0"); }} />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Laser Cueing</Text>
          <Switch value={isLaserEnabled} onValueChange={(v) => { setIsLaserEnabled(v); sendCommandToStick(v ? "LAS:1" : "LAS:0"); }} />
        </View>
      </View>

      {/* 4. WEEKLY DASHBOARD */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Weekly Steps</Text>
        <BarChart
          data={{
            labels: ["M", "T", "W", "Th", "F", "S", "Su"],
            datasets: [{ data: weeklySteps }]
          }}
          width={screenWidth - 60}
          height={200}
          yAxisLabel=""
          yAxisSuffix=""
          chartConfig={{...chartConfig, color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`}} // Green for steps
          style={styles.chartStyle}
        />
      </View>
    </ScrollView>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', paddingTop: 60 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 20, color: '#1c1c1e' },
  button: { backgroundColor: '#007AFF', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 12, marginBottom: 15, width: '85%', alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#a1c6ea' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  
  listContainer: { width: '85%', marginBottom: 10 },
  deviceBox: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginVertical: 5, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  deviceBoxConnected: { borderColor: '#34C759', borderWidth: 2 },
  deviceName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  connectedText: { color: '#34C759', fontWeight: 'bold', marginTop: 5 },

  card: { backgroundColor: '#fff', width: '90%', padding: 20, borderRadius: 16, marginVertical: 10, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1c1c1e', marginBottom: 15 },
  
  chartStyle: { borderRadius: 12, marginTop: 10, alignSelf: 'center' },

  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  toggleLabel: { fontSize: 16, fontWeight: '500', color: '#333' }
});