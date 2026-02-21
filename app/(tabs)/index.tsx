import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  NativeEventEmitter, NativeModules,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity, View
} from 'react-native';
import BleManager from 'react-native-ble-manager';
import { LineChart } from 'react-native-chart-kit';

const screenWidth = Dimensions.get("window").width;

interface BluetoothDevice {
  id: string;
  name?: string;
}

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

export default function SmartStickController() {
  // --- APP NAVIGATION STATE ---
  // This state controls which "page" we are looking at!
  const [activeTab, setActiveTab] = useState<'controls' | 'monitor'>('controls');

  // --- BLUETOOTH STATE ---
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);

  // --- FEATURE STATE ---
  const [isRasEnabled, setIsRasEnabled] = useState(false);
  const [isHapticEnabled, setIsHapticEnabled] = useState(false);
  const [isLaserEnabled, setIsLaserEnabled] = useState(false);
  const [gaitData, setGaitData] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); 

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

    const updateListener = bleManagerEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', (data) => {
        const newValue = data.value[0]; 
        setGaitData(currentData => [...currentData.slice(1), newValue]);
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
      
      console.log("Asking Apple to start scanning...");
      
      const targetUUIDs = ["1234abcd-0000-1000-8000-00805f9b34fb"]; 
      const scanTime = 5;                                           
      const allowDupes = true;                                      
      
      // FIX: We added a dummy key. Because it is no longer empty, 
      // the bridge CANNOT accidentally convert this into an Array!
      const scanOptions = { forceDictionary: true };                                       
      
      // @ts-ignore
      BleManager.scan(targetUUIDs, scanTime, allowDupes, scanOptions).then(() => {
          console.log("Scan successfully started!");
      }).catch(err => {
          console.error("Scan failed:", err);
          setIsScanning(false);
      });
    }
  };

  const connectToDevice = async (id: string) => {
    try {
      await BleManager.connect(id);
      setConnectedDeviceId(id);
      
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

  const chartConfig = {
    backgroundGradientFrom: "#ffffff",
    backgroundGradientTo: "#ffffff",
    color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`, 
    strokeWidth: 3,
    useShadowColorFromDataset: false 
  };

  // --- UI ---
  return (
    <SafeAreaView style={styles.mainContainer}>
      <Text style={styles.headerTitle}>Smart Stick</Text>

      {/* DYNAMIC CONTENT AREA (Switches based on the active tab) */}
      <ScrollView style={styles.scrollArea} contentContainerStyle={{ alignItems: 'center', paddingBottom: 20 }}>
        
        {/* PAGE 1: CONTROLS */}
        {activeTab === 'controls' && (
          <>
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
          </>
        )}

        {/* PAGE 2: LIVE MONITOR */}
        {activeTab === 'monitor' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Live Gait Monitor</Text>
            <LineChart
              data={{
                labels: ["", "", "", "", "", "", "", "", "", "Now"],
                datasets: [{ data: gaitData }]
              }}
              width={screenWidth - 60}
              height={220}
              chartConfig={chartConfig}
              bezier
              style={styles.chartStyle}
              withDots={false}
              withInnerLines={false}
            />
            <Text style={styles.monitorHint}>Graph updates automatically when walking.</Text>
          </View>
        )}

      </ScrollView>

      {/* BOTTOM TAB BAR NAVIGATION */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'controls' && styles.tabButtonActive]} 
          onPress={() => setActiveTab('controls')}
        >
          <Text style={[styles.tabText, activeTab === 'controls' && styles.tabTextActive]}>Remote Control</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'monitor' && styles.tabButtonActive]} 
          onPress={() => setActiveTab('monitor')}
        >
          <Text style={[styles.tabText, activeTab === 'monitor' && styles.tabTextActive]}>Gait Monitor</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#f0f2f5' },
  headerTitle: { fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: 20, marginBottom: 15, color: '#1c1c1e' },
  scrollArea: { flex: 1 },
  
  button: { backgroundColor: '#007AFF', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 12, marginBottom: 15, width: '85%', alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#a1c6ea' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  
  listContainer: { width: '85%', marginBottom: 10 },
  deviceBox: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginVertical: 5, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  deviceBoxConnected: { borderColor: '#34C759', borderWidth: 2 },
  deviceName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  connectedText: { color: '#34C759', fontWeight: 'bold', marginTop: 5 },

  card: { backgroundColor: '#fff', width: '90%', padding: 20, borderRadius: 16, marginVertical: 10, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1c1c1e', marginBottom: 15, textAlign: 'center' },
  
  chartStyle: { borderRadius: 12, marginTop: 10, alignSelf: 'center' },
  monitorHint: { textAlign: 'center', color: '#888', marginTop: 15, fontStyle: 'italic' },

  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  toggleLabel: { fontSize: 16, fontWeight: '500', color: '#333' },

  // Navigation Tab Bar Styles
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#e0e0e0', paddingBottom: 20, paddingTop: 10 },
  tabButton: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabButtonActive: { borderBottomWidth: 3, borderColor: '#007AFF' },
  tabText: { fontSize: 16, fontWeight: '600', color: '#8e8e93' },
  tabTextActive: { color: '#007AFF' }
});