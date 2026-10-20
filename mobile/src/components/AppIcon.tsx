import { Ionicons } from '@expo/vector-icons';
import { ComponentProps } from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';

/* Ionicons + custom vectors the icon set doesn't have.
   Use exactly like <Ionicons />; custom names: 'billiards-8'. */

type IonName = ComponentProps<typeof Ionicons>['name'];
type Props = {
  name: IonName | 'billiards-8' | string;
  size?: number;
  color?: string;
  style?: StyleProp<any>;
};

/** Outline 8-ball: outer ring + inner ring with an "8", drawn to match Ionicons' outline weight. */
export function EightBall({ size = 24, color = '#000', style }: { size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const stroke = Math.max(1.5, size * 0.085);
  const outer = size * 0.86;           // Ionicons leave ~7% padding
  const inner = outer * 0.52;
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <View
        style={{
          width: outer, height: outer, borderRadius: outer / 2,
          borderWidth: stroke, borderColor: color,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: inner, height: inner, borderRadius: inner / 2,
            borderWidth: stroke * 0.8, borderColor: color,
            alignItems: 'center', justifyContent: 'center',
            marginTop: -outer * 0.06, marginLeft: outer * 0.06,  // slight off-centre, like a real 8-ball
          }}
        >
          <Text
            allowFontScaling={false}
            style={{
              color, fontWeight: '900',
              fontSize: inner * 0.62, lineHeight: inner * 0.72,
              includeFontPadding: false, textAlign: 'center',
            }}
          >
            8
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function AppIcon({ name, size = 24, color = '#000', style }: Props) {
  if (name === 'billiards-8') return <EightBall size={size} color={color} style={style} />;
  return <Ionicons name={name as IonName} size={size} color={color} style={style} />;
}
