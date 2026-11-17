import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { Camera, CameraType } from 'expo-camera';
import { Audio } from 'expo-av';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../navigation';

type BiometricPaymentScreenProps = StackScreenProps<RootStackParamList, 'BiometricPayment'>;

type BiometricMode = 'idle' | 'face' | 'voice' | null;

export default function BiometricPaymentScreen({ route, navigation }: BiometricPaymentScreenProps) {
  const { orderReference, amount } = route.params;
  const { token, apiBaseUrl } = useAuth();
  
  const [customerIdentifier, setCustomerIdentifier] = useState('');
  const [biometricMode, setBiometricMode] = useState<BiometricMode>('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraPermission, requestCameraPermission] = Camera.useCameraPermissions();
  const [audioPermission, requestAudioPermission] = Audio.usePermissions();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [stepUpRequired, setStepUpRequired] = useState(false);
  const [stepUpResponse, setStepUpResponse] = useState('');
  const [capturedBiometric, setCapturedBiometric] = useState<{
    type: 'face' | 'voice';
    sample: string;
  } | null>(null);

  const startFaceCapture = async () => {
    if (!customerIdentifier.trim()) {
      Alert.alert('Required', 'Please enter customer phone number or handle first');
      return;
    }

    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Camera permission is required');
        return;
      }
    }
    setBiometricMode('face');
  };

  const captureFace = async (cameraRef: Camera) => {
    if (!cameraRef || isProcessing) return;

    setIsProcessing(true);
    try {
      const photo = await cameraRef.takePictureAsync({ base64: true, quality: 0.8 });
      
      if (!photo.base64) {
        throw new Error('Failed to capture image');
      }

      setCapturedBiometric({ type: 'face', sample: photo.base64 });
      setBiometricMode('idle');
      
      // Process payment immediately
      await processPayment('face', photo.base64);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to capture face');
      setBiometricMode('idle');
    } finally {
      setIsProcessing(false);
    }
  };

  const startVoiceCapture = async () => {
    if (!customerIdentifier.trim()) {
      Alert.alert('Required', 'Please enter customer phone number or handle first');
      return;
    }

    if (!audioPermission?.granted) {
      const result = await requestAudioPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Microphone permission is required');
        return;
      }
    }
    setBiometricMode('voice');
  };

  const startRecording = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      setRecording(recording);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to start recording: ' + error.message);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    setIsProcessing(true);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      
      if (!uri) {
        throw new Error('Failed to get recording');
      }

      // Read the audio file as base64
      const response = await fetch(uri);
      const blob = await response.blob();
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        setCapturedBiometric({ type: 'voice', sample: base64 });
        setBiometricMode('idle');
        await processPayment('voice', base64);
      };
      
      reader.readAsDataURL(blob);
      setRecording(null);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to process voice');
      setBiometricMode('idle');
      setIsProcessing(false);
    }
  };

  const processPayment = async (
    biometricType: 'face' | 'voice',
    sampleBase64: string,
    stepUp?: string,
  ) => {
    setIsProcessing(true);
    try {
      const response = await axios.post(
        `${apiBaseUrl}/api/v1/merchants/terminal-payment`,
        {
          orderReference,
          customerIdentifier: customerIdentifier.trim(),
          biometricType,
          biometricSample: sampleBase64,
          stepUpResponse: stepUp || undefined,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.data.status === 'step_up_required') {
        // Step-up challenge required
        setStepUpRequired(true);
        setIsProcessing(false);
        return;
      }

      // Payment successful
      Alert.alert(
        'Payment Successful',
        `${response.data.transfer.currency} ${response.data.transfer.amount} received from ${customerIdentifier}`,
        [
          {
            text: 'Done',
            onPress: () => navigation.navigate('Dashboard'),
          },
        ],
      );
    } catch (error: any) {
      const message = error.response?.data?.message || 'Payment failed';
      Alert.alert('Payment Failed', message);
    } finally {
      setIsProcessing(false);
    }
  };

  const submitStepUp = async () => {
    if (!stepUpResponse.trim()) {
      Alert.alert('Required', 'Please enter the step-up challenge response');
      return;
    }

    if (!capturedBiometric) {
      Alert.alert('Error', 'No biometric data captured');
      return;
    }

    setStepUpRequired(false);
    await processPayment(
      capturedBiometric.type,
      capturedBiometric.sample,
      stepUpResponse.trim(),
    );
  };

  if (biometricMode === 'face') {
    let cameraRef: Camera | null = null;

    return (
      <View style={styles.container}>
        <Camera
          style={styles.camera}
          type={CameraType.front}
          ref={(ref) => (cameraRef = ref)}
        >
          <View style={styles.cameraOverlay}>
            <Text style={styles.cameraTitle}>Customer Face Verification</Text>
            <View style={styles.faceGuide} />
            <Text style={styles.cameraInstructions}>
              Ask customer to position face within circle
            </Text>
            <Text style={styles.amountDisplay}>Amount: NGN {amount}</Text>
          </View>
        </Camera>

        <View style={styles.cameraControls}>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => setBiometricMode('idle')}
            disabled={isProcessing}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.captureButton]}
            onPress={() => cameraRef && captureFace(cameraRef)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Capture & Pay</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (biometricMode === 'voice') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Voice Verification</Text>
          <Text style={styles.subtitle}>Amount: NGN {amount}</Text>
          
          <Text style={styles.voiceInstructions}>
            Ask customer to read this phrase:
          </Text>
          <View style={styles.phraseBox}>
            <Text style={styles.phrase}>
              "My voice is my password, verify me with Vireo Finance"
            </Text>
          </View>

          <View style={styles.recordingStatus}>
            {recording ? (
              <>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>Recording...</Text>
              </>
            ) : (
              <Text style={styles.instructions}>
                {isProcessing
                  ? 'Processing payment...'
                  : 'Tap the button to start recording'}
              </Text>
            )}
          </View>

          <View style={styles.voiceControls}>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={() => {
                if (recording) {
                  recording.stopAndUnloadAsync();
                  setRecording(null);
                }
                setBiometricMode('idle');
              }}
              disabled={isProcessing}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                recording ? styles.stopButton : styles.recordButton,
              ]}
              onPress={recording ? stopRecording : startRecording}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>
                  {recording ? 'Stop & Pay' : 'Start Recording'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Biometric Payment</Text>
        <Text style={styles.subtitle}>Order: {orderReference}</Text>
        <Text style={styles.amountDisplay}>Amount: NGN {amount}</Text>

        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Customer Phone or Handle</Text>
          <TextInput
            style={styles.input}
            placeholder="+234..."
            value={customerIdentifier}
            onChangeText={setCustomerIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.optionsContainer}>
          <Text style={styles.optionsTitle}>Select verification method:</Text>

          <TouchableOpacity
            style={styles.optionCard}
            onPress={startFaceCapture}
            disabled={isProcessing}
          >
            <Text style={styles.optionIcon}>👤</Text>
            <Text style={styles.optionTitle}>Face</Text>
            <Text style={styles.optionDescription}>
              Quick face verification
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionCard}
            onPress={startVoiceCapture}
            disabled={isProcessing}
          >
            <Text style={styles.optionIcon}>🎤</Text>
            <Text style={styles.optionTitle}>Voice</Text>
            <Text style={styles.optionDescription}>
              Voice verification
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton, { marginTop: 20 }]}
          onPress={() => navigation.goBack()}
          disabled={isProcessing}
        >
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Step-up Challenge Modal */}
      <Modal visible={stepUpRequired} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Additional Verification Required</Text>
            <Text style={styles.modalSubtitle}>
              This transaction requires a step-up challenge.
            </Text>

            <Text style={styles.inputLabel}>Ask customer for their PIN or passphrase:</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter PIN or phrase"
              value={stepUpResponse}
              onChangeText={setStepUpResponse}
              secureTextEntry
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={() => {
                  setStepUpRequired(false);
                  setStepUpResponse('');
                }}
                disabled={isProcessing}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.primaryButton]}
                onPress={submitStepUp}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Submit</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  amountDisplay: {
    fontSize: 24,
    fontWeight: '600',
    color: '#34C759',
    marginBottom: 24,
  },
  inputSection: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
  },
  optionsContainer: {
    marginBottom: 16,
  },
  optionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  optionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  optionIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  captureButton: {
    backgroundColor: '#34C759',
  },
  recordButton: {
    backgroundColor: '#FF3B30',
  },
  stopButton: {
    backgroundColor: '#FF9500',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cameraTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  faceGuide: {
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 3,
    borderColor: '#34C759',
    backgroundColor: 'transparent',
  },
  cameraInstructions: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 20,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cameraControls: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    backgroundColor: '#000',
  },
  voiceInstructions: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  phraseBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  phrase: {
    fontSize: 18,
    color: '#333',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 26,
  },
  recordingStatus: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    minHeight: 40,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF3B30',
    marginRight: 8,
  },
  recordingText: {
    fontSize: 16,
    color: '#FF3B30',
    fontWeight: '600',
  },
  instructions: {
    fontSize: 14,
    color: '#999',
  },
  voiceControls: {
    flexDirection: 'row',
    gap: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
});
