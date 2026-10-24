import {
  StyleSheet,
  Text,
} from 'react-native';
import Pressable from './PressableScale';
import { theme } from '../lib/theme';

type Props = { label: string; selected?: boolean; onPress: () => void };

export function Chip({ label, selected, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipOn]}>
      <Text style={[styles.text, selected && styles.textOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    marginRight: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  chipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  text: { fontSize: theme.fontSizes.sm, color: theme.colors.text },
  textOn: { color: theme.colors.primaryDark, fontWeight: '600' },
});
