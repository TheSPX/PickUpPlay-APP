import { useEffect, useRef } from 'react';
import { Animated, StyleProp, TextStyle } from 'react-native';

/* A number that pops (grows + settles) whenever its value changes — scores, XP, counts. */
export default function ScorePop({ value, style, pop = 1.28 }: { value: number | string; style?: StyleProp<TextStyle>; pop?: number }) {
  const s = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    s.setValue(pop);
    Animated.spring(s, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Animated.Text style={[style, { transform: [{ scale: s }] }]}>{value}</Animated.Text>;
}
