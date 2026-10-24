import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Pressable from '../../components/PressableScale';
import KeyboardScroll from '../../components/KeyboardScroll';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { C, themed } from '../../lib/palette';

const schema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type FormData = z.infer<typeof schema>;

export default function SignIn() {
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(data: FormData) {
    setBusy(true);
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email.trim(),
      password: data.password,
    });
    setBusy(false);
    if (error) {
      const msg =
        error.message.includes('network') || error.message.includes('fetch')
          ? 'Network error. Please check your internet connection.'
          : error.message;
      setAuthError(msg);
      Alert.alert('Sign in failed', msg);
    }
  }

  return (
    <LinearGradient
      colors={['#0c2a5e', C.primary, '#00081d']}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.flex}
    >
        <KeyboardScroll
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo Image */}
          <Image
            source={require('../../../assets/images/logo-glow.png')}
            style={styles.logoImage}
            contentFit="contain"
          />

          {/* Fields */}
          <View style={styles.fieldsWrapper}>
            {authError ? (
              <Text style={styles.errorBanner}>{authError}</Text>
            ) : null}

            {/* Label row */}
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Login</Text>
              <Link href="/sign-up" style={styles.newUserLink}>New to PickUp? SignUp</Link>
            </View>

            {/* Email */}
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  style={[styles.input, errors.email && styles.inputError]}
                  placeholder="Email"
                  placeholderTextColor="rgba(255,255,255,0.55)"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={value}
                  onChangeText={onChange}
                />
              )}
            />
            {errors.email ? (
              <Text style={styles.errorText}>{errors.email.message}</Text>
            ) : null}

            {/* Password */}
            <View style={[styles.passwordContainer, errors.password && styles.inputError]}>
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Password"
                    placeholderTextColor="rgba(255,255,255,0.55)"
                    secureTextEntry={!showPassword}
                    value={value}
                    onChangeText={onChange}
                  />
                )}
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color="rgba(255,255,255,0.6)"
                />
              </Pressable>
            </View>
            {errors.password ? (
              <Text style={styles.errorText}>{errors.password.message}</Text>
            ) : null}

            {/* Login button */}
            <Pressable
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={handleSubmit(onSubmit)}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={C.primary} />
              ) : (
                <Text style={styles.buttonText}>LOGIN</Text>
              )}
            </Pressable>

            {/* Offline practice — works without an account or internet */}
            <Link href={'/demo' as any} style={styles.demoLink}>Try a demo match (offline)</Link>
          </View>
        </KeyboardScroll>
          </LinearGradient>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  logoImage: {
    width: 280,
    height: 115,
    marginBottom: 32,
  },
  fieldsWrapper: {
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: C.onPrimary,
  },
  demoLink: {
    marginTop: 18, textAlign: 'center', fontSize: 13, fontWeight: '700',
    color: 'rgba(255,255,255,0.8)', textDecorationLine: 'underline',
  },
  newUserLink: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
  },
  input: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 15,
    color: C.onPrimary,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  inputError: {
    borderColor: '#f87171',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 15,
    color: C.onPrimary,
  },
  eyeButton: { paddingHorizontal: 14 },
  button: {
    backgroundColor: C.card,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: C.primary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    marginBottom: 8,
    marginTop: -6,
    paddingLeft: 8,
  },
  errorBanner: {
    backgroundColor: 'rgba(248,113,113,0.15)',
    color: '#f87171',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 14,
  },
}));
