import { StyleSheet } from 'react-native';
import { C, themed } from './palette';

export const ui = themed(() => StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: C.surface },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 4, color: C.text },
  subtitle: { fontSize: 14, color: C.text2, marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: C.card,
    color: C.text,
  },
  button: {
    backgroundColor: C.text2,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: C.onPrimary, fontSize: 16, fontWeight: '600' },
  link: { marginTop: 16, textAlign: 'center', color: C.text2 },
}));
