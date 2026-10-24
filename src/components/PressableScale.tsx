import * as Haptics from 'expo-haptics';
import { forwardRef, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, GestureResponderEvent, Pressable, PressableProps,
  PressableStateCallbackType, StyleProp, StyleSheet, View, ViewStyle,
} from 'react-native';

/* ─────────────────────────────────────────────────────────────
   One press feel for every button in the app.
   Drop-in replacement for <Pressable>: same props, plus
     scaleTo — how far it shrinks (default 0.96, icons ~0.88)
     haptic  — 'light' | 'medium' | 'heavy' | 'success' | 'warning' | false
   Press: shrink + dim in ~80ms · Release: spring back · light haptic tick.
   Respects Reduce Motion (no scaling, haptics stay).
   ───────────────────────────────────────────────────────────── */

export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | false;

export function haptic(kind: HapticKind = 'light') {
  if (!kind) return;
  try {
    if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (kind === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else Haptics.impactAsync(
      kind === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy
        : kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    );
  } catch {}
}

let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { reduceMotion = !!v; }).catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => { reduceMotion = !!v; });

type Props = PressableProps & {
  scaleTo?: number;
  haptic?: HapticKind;
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
};

/** Styles that make up a layout region (modal backdrops, full-screen layers) never scale. */
function isLayer(style: any) {
  const f = StyleSheet.flatten(style) as any;
  if (!f) return false;
  return f.flex === 1 || (f.position === 'absolute' && f.top === 0 && f.left === 0 && f.right === 0 && f.bottom === 0);
}

const PressableScale = forwardRef<View, Props>(function PressableScale(
  { scaleTo = 0.96, haptic: hk = 'light', style, onPressIn, onPressOut, onPress, onLongPress, disabled, children, ...rest },
  ref,
) {
  const s = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);

  const resolved = (st: PressableStateCallbackType) =>
    typeof style === 'function' ? (style as any)(st) : style;

  const layer = isLayer(resolved({ pressed: false, hovered: false } as any));
  const animate = !layer && scaleTo < 1;

  useEffect(() => () => s.stopAnimation(), [s]);

  function inAnim(e: GestureResponderEvent) {
    setPressed(true);
    if (animate && !reduceMotion) {
      Animated.timing(s, { toValue: scaleTo, duration: 80, useNativeDriver: true }).start();
    }
    onPressIn?.(e);
  }
  function outAnim(e: GestureResponderEvent) {
    setPressed(false);
    if (animate && !reduceMotion) {
      Animated.spring(s, { toValue: 1, friction: 4, tension: 220, useNativeDriver: true }).start();
    }
    onPressOut?.(e);
  }

  // Split the style: layout (margins, flex sizing, absolute position) stays on the outer
  // Animated view so the button keeps its place; everything else goes on the Pressable.
  const st = StyleSheet.flatten(resolved({ pressed, hovered: false } as any)) || {};
  const {
    margin, marginTop, marginBottom, marginLeft, marginRight, marginHorizontal, marginVertical,
    position, top, left, right, bottom, zIndex, alignSelf, flex, flexGrow, flexShrink, flexBasis, width,
    ...inner
  } = st as any;
  const outer = {
    margin, marginTop, marginBottom, marginLeft, marginRight, marginHorizontal, marginVertical,
    position, top, left, right, bottom, zIndex, alignSelf, flex, flexGrow, flexShrink, flexBasis, width,
  };
  Object.keys(outer).forEach((k) => (outer as any)[k] === undefined && delete (outer as any)[k]);
  const fill = (flex != null || flexGrow != null || width != null) ? { width: '100%' as const, flex: flex != null ? 1 : undefined } : null;

  if (layer) {
    return (
      <Pressable ref={ref} style={style as any} onPressIn={onPressIn} onPressOut={onPressOut}
        onPress={onPress} onLongPress={onLongPress} disabled={disabled} {...rest}>
        {children as any}
      </Pressable>
    );
  }

  return (
    <Animated.View style={[outer, { transform: [{ scale: s }] }, pressed && animate ? { opacity: 0.92 } : null]}>
      <Pressable
        ref={ref}
        {...rest}
        disabled={disabled}
        style={[inner, fill]}
        onPressIn={inAnim}
        onPressOut={outAnim}
        onPress={(e) => { haptic(hk); onPress?.(e); }}
        onLongPress={onLongPress ? (e) => { haptic('medium'); onLongPress(e); } : undefined}
      >
        {typeof children === 'function' ? (children as any)({ pressed, hovered: false }) : children}
      </Pressable>
    </Animated.View>
  );
});

export default PressableScale;
