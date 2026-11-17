import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Camera, CameraType } from 'expo-camera';
import { Audio } from 'expo-av';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const CONSENT_VERSION = '1.0';
const CONSENT_TEXT = `
Vireo Finance Biometric Data Consent

By enrolling, you authorize Vireo Finance to:
• Collect and process your facial and/or voice biometric data
• Store encrypted biometric templates for identity verification
• Use your biometrics to authorize payments at merchant terminals
• Retain your data until you revoke consent or close your account

You have the right to:
• Revoke consent at any time through the app settings
• Request deletion of all biometric data
• Access logs of biometric verification attempts

Your biometric data is encrypted, never shared with third parties, and used only for authentication purposes.
`;

type EnrollmentType = 'face' | 'voice' | null;

export default function BiometricEnrollScreen({ navigation }: any) {
  const { token, apiBaseUrl } = useAuth();
  const [consentGranted, setConsentGranted] = useState(false);
  const [consentId, setConsentId] = useState<string | null>(null);
  const [enrollmentType, setEnrollmentType] = useState<EnrollmentType>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraPermission, requestCameraPermission] = Camera.useCameraPermissions();
  const [audioPermission, requestAudioPermission] = Audio.usePermissions();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);

  const grantConsent = async () => {
    setIsProcessing(true);
    try {
      const response = await axios.post(
        `${apiBaseUrl}/api/v1/biometrics/consent`,
        {
          consentVersion: CONSENT_VERSION,
          metadata: {
            deviceId: 'unknown', // TODO: Get actual device ID
          },
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setConsentId(response.data.id);
      setConsentGranted(true);
      Alert.alert('Success', 'Consent granted. You can now enroll your biometrics.');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to grant consent');
    } finally {
      setIsProcessing(false);
    }
  };

  const startFaceCapture = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Camera permission is required for face enrollment');
        return;
      }
    }
    setEnrollmentType('face');
    setIsCapturing(true);
  };

  const captureFace = async (cameraRef: Camera) => {
    if (!cameraRef || isProcessing) return;

    setIsProcessing(true);
    try {
      const photo = await cameraRef.takePictureAsync({ base64: true, quality: 0.8 });
      
      if (!photo.base64) {
        throw new Error('Failed to capture image');
      }

      await enrollBiometric('face', photo.base64);
      setIsCapturing(false);
      setEnrollmentType(null);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to enroll face');
    } finally {
      setIsProcessing(false);
    }
  };

  const startVoiceCapture = async () => {
    if (!audioPermission?.granted) {
      const result = await requestAudioPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Microphone permission is required for voice enrollment');
        return;
      }
    }
    setEnrollmentType('voice');
    setIsCapturing(true);
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
        await enrollBiometric('voice', base64);
        setIsCapturing(false);
        setEnrollmentType(null);
      };
      
      reader.readAsDataURL(blob);
      setRecording(null);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to enroll voice');
      setIsProcessing(false);
    }
  };

  const enrollBiometric = async (type: 'face' | 'voice', sampleBase64: string) => {
    try {
      const response = await axios.post(
        `${apiBaseUrl}/api/v1/biometrics/enroll`,
        {
          type,
          sampleBase64,
          consentId,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      Alert.alert(
        'Success',
        `${type === 'face' ? 'Face' : 'Voice'} enrolled successfully! Quality score: ${response.data.qualityScore}/100`,
        [
          {
            text: 'Done',
            onPress: () => navigation.goBack(),
          },
        ],
      );
    } catch (error: any) {
      throw error;
    }
  };

  if (!consentGranted) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Biometric Enrollment</Text>
          <Text style={styles.subtitle}>
            Enable device-less payments at merchant terminals
          </Text>

          <View style={styles.consentBox}>
            <Text style={styles.consentTitle}>Consent Required</Text>
            <ScrollView style={styles.consentScroll}>
              <Text style={styles.consentText}>{CONSENT_TEXT}</Text>
            </ScrollView>
          </View>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={grantConsent}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>I Agree - Grant Consent</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (isCapturing && enrollmentType === 'face') {
    let cameraRef: Camera | null = null;

    return (
      <View style={styles.container}>
        <Camera
          style={styles.camera}
          type={CameraType.front}
          ref={(ref) => (cameraRef = ref)}
        >
          <View style={styles.cameraOverlay}>
            <View style={styles.faceGuide} />
            <Text style={styles.cameraInstructions}>
              Position your face within the circle
            </Text>
          </View>
        </Camera>

        <View style={styles.cameraControls}>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => {
              setIsCapturing(false);
              setEnrollmentType(null);
            }}
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
              <Text style={styles.buttonText}>Capture</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isCapturing && enrollmentType === 'voice') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Voice Enrollment</Text>
          <Text style={styles.voiceInstructions}>
            Please read the following phrase clearly:
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
              <Text style={styles.instructions}>Tap the button to start recording</Text>
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
                setIsCapturing(false);
                setEnrollmentType(null);
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
                  {recording ? 'Stop & Submit' : 'Start Recording'}
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
        <Text style={styles.title}>Biometric Enrollment</Text>
        <Text style={styles.subtitle}>Choose what to enroll</Text>

        <View style={styles.optionsContainer}>
          <TouchableOpacity
            style={styles.optionCard}
            onPress={startFaceCapture}
            disabled={isProcessing}
          >
            <Text style={styles.optionIcon}>👤</Text>
            <Text style={styles.optionTitle}>Face</Text>
            <Text style={styles.optionDescription}>
              Enroll your face for quick verification at terminals
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
              Enroll your voice as an additional security factor
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton, { marginTop: 20 }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.secondaryButtonText}>Back to Wallet</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
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
    marginBottom: 24,
  },
  consentBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  consentTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  consentScroll: {
    maxHeight: 300,
  },
  consentText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  optionsContainer: {
    gap: 16,
  },
  optionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  optionIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  optionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
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
    marginBottom: 12,
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
    flex: 1,
  },
  recordButton: {
    backgroundColor: '#FF3B30',
    flex: 1,
  },
  stopButton: {
    backgroundColor: '#FF9500',
    flex: 1,
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
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  faceGuide: {
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 3,
    borderColor: '#fff',
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
});
