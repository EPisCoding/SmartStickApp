import React, { useEffect, useState } from 'react';
import { FlatList, NativeEventEmitter, NativeModules, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BleManager from 'react-native-ble-manager';

// 1. Tell TypeScript what a "Device" looks like
interface BluetoothDevice {
  id: string;
  name?: string;
}

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

export default function App() {
  const [isScanning, setIsScanning] = useState(false);
  // 2. Tell TypeScript this is specifically a list of BluetoothDevices
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);

  useEffect(() => {
    BleManager.start({ showAlert: false }).then(() => {
      console.log("Bluetooth Engine Started");
    });

    const discoverListener = bleManagerEmitter.addListener(
      'BleManagerDiscoverPeripheral',
      // 3. Tell TypeScript the incoming data is a BluetoothDevice
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

  const startScan = () => {
    if (!isScanning) {
      setDevices([]); // Clear old list
      setIsScanning(true);

      const serviceUUIDs: string[] = []; // ✅ Typed variable instead of inline assertion
      // @ts-ignore
      BleManager.scan(serviceUUIDs, 5, true)
        .then(() => console.log("Scanning..."))
        .catch(err => {
          console.error(err);
          setIsScanning(false);
        });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Smart Stick Controller</Text>
      
      <TouchableOpacity 
        style={[styles.button, isScanning && styles.buttonDisabled]} 
        onPress={startScan}
        disabled={isScanning}
      >
        <Text style={styles.buttonText}>
          {isScanning ? 'Scanning for Stick...' : 'Find My Smart Stick'}
        </Text>
      </TouchableOpacity>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.deviceBox}>
            <Text style={styles.deviceName}>{item.name}</Text>
            <Text style={styles.deviceId}>{item.id}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', alignItems: 'center', paddingTop: 80 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 30, color: '#333' },
  button: { backgroundColor: '#007AFF', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 10, marginBottom: 20 },
  buttonDisabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  deviceBox: { backgroundColor: '#fff', padding: 15, borderRadius: 8, marginVertical: 5, width: 300, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  deviceName: { fontSize: 16, fontWeight: 'bold' },
  deviceId: { fontSize: 12, color: '#666', marginTop: 5 }
});