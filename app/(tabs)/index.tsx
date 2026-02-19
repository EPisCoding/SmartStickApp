import React, { useEffect, useState } from 'react';
import {
  FlatList,
  NativeEventEmitter,
  NativeModules,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import BleManager from 'react-native-ble-manager';

// 1. Tell TypeScript what a "Device" looks like
interface BluetoothDevice {
  id: string;
  name?: string;
}

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

export default function SmartStickController() {
  // --- STATE (The App's Memory) ---
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);

  // Toggle Features State
  const [isRasEnabled, setIsRasEnabled] = useState(false);
  const [isHapticEnabled, setIsHapticEnabled] = useState(false);
  const [isLaserEnabled, setIsLaserEnabled] = useState(false);

  // --- BLUETOOTH ENGINE INITIALIZATION ---
  useEffect(() => {
    BleManager.start({ showAlert: false }).then(() => {
      console.log("Bluetooth Engine Started");
    });

    const discoverListener = bleManagerEmitter.addListener(
      'BleManagerDiscoverPeripheral',
      (device: BluetoothDevice) => {
        if (device.name) {
          setDevices((prevDevices) => {
            const deviceExists = prevDevices.find(d => d.id === device.id);
            if (!deviceExists) return [...prevDevices, device];
            return prevDevices;
          });
        }
      }
    );

    const stopListener = bleManagerEmitter.addListener('BleManagerStopScan', () => {
      setIsScanning(false);
      console.log("Scan stopped");
    });

    return () => {
      discoverListener.remove();
      stopListener.remove();
    };
  }, []);

  // --- BLUETOOTH ACTIONS ---
  const startScan = () => {
    if (!isScanning) {
      setDevices([]); // Clear old list
      setIsScanning(true);
      const serviceUUIDs: string[] = []; 
      
      // @ts-ignore
      BleManager.scan(serviceUUIDs, 5, true)
        .then(() => console.log("Scanning..."))
        .catch(err => {
          console.error(err);
          setIsScanning(false);
        });
    }
  };

  // NEW: Connect to the stick when tapped!
  const connectToDevice = async (id: string) => {
    try {
      console.log('Connecting to: ', id);
      await BleManager.connect(id);
      setConnectedDeviceId(id);
      alert('Connected to Smart Stick!');
    } catch (error) {
      console.error('Connection error', error);
      alert('Failed to connect');
    }
  };

  const sendCommandToStick = async (commandString: string) => {
    if (!connectedDeviceId) {
      alert("Please scan and tap to connect to the stick first!");
      return;
    }

    const byteData = commandString.split('').map((char) => char.charCodeAt(0));
    
    // Placeholder UUIDs - we will match these to the Pi later!
    const SERVICE_UUID = "1234abcd-0000-1000-8000-00805f9b34fb";
    const CHARACTERISTIC_UUID = "abcd1234-0000-1000-8000-00805f9b34fb";

    try {
      await BleManager.write(connectedDeviceId, SERVICE_UUID, CHARACTERISTIC_UUID, byteData);
      console.log(`Successfully sent: ${commandString}`);
    } catch (error) {
      console.error("Failed to send command", error);
    }
  };

  // --- UI (WHAT YOU SEE ON SCREEN) ---
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Smart Stick Controller</Text>
      
      {/* SCAN BUTTON */}
      <TouchableOpacity 
        style={[styles.button, isScanning && styles.buttonDisabled]} 
        onPress={startScan}
        disabled={isScanning}
      >
        <Text style={styles.buttonText}>
          {isScanning ? 'Scanning for Stick...' : 'Find My Smart Stick'}
        </Text>
      </TouchableOpacity>

      {/* LIST OF FOUND DEVICES */}
      <View style={styles.listContainer}>
        <FlatList
          data={devices}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={[styles.deviceBox, connectedDeviceId === item.id && styles.deviceBoxConnected]}
              onPress={() => connectToDevice(item.id)}
            >
              <Text style={styles.deviceName}>{item.name}</Text>
              <Text style={styles.deviceId}>{item.id}</Text>
              {connectedDeviceId === item.id && <Text style={styles.connectedText}>Connected!</Text>}
            </TouchableOpacity>
          )}
        />
      </View>

      {/* SMART STICK FEATURE SWITCHES */}
      <View style={styles.controlsContainer}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>RAS (Audio Beeps)</Text>
          <Switch
            value={isRasEnabled}
            onValueChange={(newValue) => {
              setIsRasEnabled(newValue);
              sendCommandToStick(newValue ? "RAS:1" : "RAS:0");
            }}
          />
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Haptic Feedback</Text>
          <Switch
            value={isHapticEnabled}
            onValueChange={(newValue) => {
              setIsHapticEnabled(newValue);
              sendCommandToStick(newValue ? "HAP:1" : "HAP:0");
            }}
          />
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Laser Cueing</Text>
          <Switch
            value={isLaserEnabled}
            onValueChange={(newValue) => {
              setIsLaserEnabled(newValue);
              sendCommandToStick(newValue ? "LAS:1" : "LAS:0");
            }}
          />
        </View>
      </View>
    </View>
  );
}

// --- STYLES (THE PAINT) ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', alignItems: 'center', paddingTop: 80 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#333' },
  button: { backgroundColor: '#007AFF', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 10, marginBottom: 10 },
  buttonDisabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  
  // List Styles
  listContainer: { flex: 1, width: '100%', alignItems: 'center' },
  deviceBox: { backgroundColor: '#fff', padding: 15, borderRadius: 8, marginVertical: 5, width: 300, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  deviceBoxConnected: { borderColor: '#4CAF50', borderWidth: 2 },
  deviceName: { fontSize: 16, fontWeight: 'bold' },
  deviceId: { fontSize: 12, color: '#666', marginTop: 5 },
  connectedText: { color: '#4CAF50', fontWeight: 'bold', marginTop: 5 },

  // Toggle Styles
  controlsContainer: { width: '100%', paddingHorizontal: 20, paddingBottom: 40, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  toggleLabel: { fontSize: 16, fontWeight: '500', color: '#333' }
});