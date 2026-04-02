import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuthStore } from '../store/useAuthStore';
import { showAlert } from '../lib/webAlert';
import { Colors, Typography, Spacing, Radius } from '../theme';

export default function LoginScreen() {
  const [staffId, setStaffId] = useState('');
  const [pin, setPin] = useState('');
  const { login, loading } = useAuthStore();

  const handleLogin = async () => {
    if (!staffId || !pin) {
      showAlert('Error', 'Please enter staff ID and PIN');
      return;
    }
    if (pin.length < 4) {
      showAlert('Error', 'PIN must be at least 4 digits');
      return;
    }
    try {
      await login(staffId, pin);
    } catch (error) {
      showAlert('Login Failed', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.title}>VoyixMobile</Text>
        <Text style={styles.subtitle}>Kmart POS System</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Staff ID</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter staff ID"
          value={staffId}
          onChangeText={setStaffId}
          keyboardType="numeric"
          editable={!loading}
        />

        <Text style={styles.label}>PIN</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter PIN"
          value={pin}
          onChangeText={setPin}
          keyboardType="numeric"
          secureTextEntry
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Logging In...' : 'Login'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Demo Staff IDs: 1001, 1002, 9001</Text>
        <Text style={styles.footerText}>Any PIN ≥ 4 digits</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginTop: Spacing.xl * 2,
  },
  title: {
    ...Typography.h1,
    color: Colors.primary,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textLight,
    marginTop: Spacing.sm,
  },
  form: {
    flex: 1,
    justifyContent: 'center',
  },
  label: {
    ...Typography.button,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 16,
    marginBottom: Spacing.lg,
  },
  button: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...Typography.button,
    color: Colors.background,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: Spacing.lg,
  },
  footerText: {
    ...Typography.caption,
    color: Colors.textLight,
  },
});
