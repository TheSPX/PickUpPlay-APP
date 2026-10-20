import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { C, themed } from '../../lib/palette';

const schema = z.object({
  displayName: z.string().min(1, 'Name is required').max(50, 'Name cannot exceed 50 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Please confirm your password'),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type FormData = z.infer<typeof schema>;

export default function SignUp() {
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: '', email: '', password: '', confirmPassword: '' },
  });

  async function onSubmit(data: FormData) {
    setBusy(true);
    setAuthError(null);
    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email.trim(),
      password: data.password,
      options: { data: { display_name: data.displayName.trim() } },
    });
    setBusy(false);

    if (error) {
      const msg = error.message.includes('network') || error.message.includes('fetch')
        ? 'Network error. Please check your internet connection.'
        : error.message;
      setAuthError(msg);
      Alert.alert('Sign up failed', msg);
      return;
    }
    if (!authData.session) {
      Alert.alert('Check your email', 'Confirm your address, then sign in.');
    }
  }

  return (
    <LinearGradient
      colors={['#0c2a5e', C.primary, '#00081d']}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.flex}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo Image */}
          <Image
            source={require('../../../assets/images/logo-glow.png')}
            style={styles.logoImage}
            contentFit="contain"
          />

          <View style={styles.card}>
            {authError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{authError}</Text>
              </View>
            ) : null}

            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  style={[styles.input, errors.email && styles.inputError]}
                  placeholder="Email"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={value}
                  onChangeText={onChange}
                />
              )}
            />
            {errors.email ? <Text style={styles.errorText}>{errors.email.message}</Text> : null}

            <Controller
              control={control}
              name="displayName"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  style={[styles.input, errors.displayName && styles.inputError]}
                  placeholder="Username"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={value}
                  onChangeText={onChange}
                />
              )}
            />
            {errors.displayName ? <Text style={styles.errorText}>{errors.displayName.message}</Text> : null}

            <View style={[styles.passwordContainer, errors.password && styles.inputError]}>
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="New Password"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    secureTextEntry={!showPassword}
                    value={value}
                    onChangeText={onChange}
                  />
                )}
              />
              <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeButton}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="rgba(255,255,255,0.6)" />
              </Pressable>
            </View>
            {errors.password ? <Text style={styles.errorText}>{errors.password.message}</Text> : null}

            <View style={[styles.passwordContainer, errors.confirmPassword && styles.inputError]}>
              <Controller
                control={control}
                name="confirmPassword"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Confirm password"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    secureTextEntry={!showConfirm}
                    value={value}
                    onChangeText={onChange}
                  />
                )}
              />
              <Pressable onPress={() => setShowConfirm((v) => !v)} style={styles.eyeButton}>
                <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={22} color="rgba(255,255,255,0.6)" />
              </Pressable>
            </View>
            {errors.confirmPassword ? <Text style={styles.errorText}>{errors.confirmPassword.message}</Text> : null}

            <Pressable
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={handleSubmit(onSubmit)}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={C.primary} />
              ) : (
                <Text style={styles.buttonText}>SignUp Now</Text>
              )}
            </Pressable>

            <View style={styles.loginRow}>
              <Text style={styles.loginText}>Already have an account? </Text>
              <Link href="/sign-in" style={styles.loginLink}>Login Now</Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    marginBottom: 28,
  },
  card: { width: '100%' },
  input: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 15,
    color: C.onPrimary,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 12,
  },
  inputError: { borderColor: '#f87171' },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.06)',
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
    marginBottom: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: C.primary, fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  loginText: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  loginLink: { color: C.onPrimary, fontSize: 14, fontWeight: '700' },
  errorText: { color: '#f87171', fontSize: 13, marginBottom: 8, marginTop: -6, paddingLeft: 8 },
  errorBanner: { backgroundColor: 'rgba(248,113,113,0.15)', borderRadius: 12, padding: 12, marginBottom: 16 },
  errorBannerText: { color: '#f87171', fontSize: 14 },
}));
