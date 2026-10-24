import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Keyboard, KeyboardEvent, Platform, ScrollView, ScrollViewProps, TextInput, View } from 'react-native';

/* ─────────────────────────────────────────────────────────────
   Drop-in <ScrollView> that keeps the focused text box above the
   keyboard. Pure JS (works in Expo Go), no KeyboardAvoidingView
   (which made the screen jump on Android while typing).
   - Adds bottom space only as tall as the keyboard actually covers.
   - Scrolls the focused input into view on open and on every tap.
   ───────────────────────────────────────────────────────────── */

const GAP = 24; // space between the input and the keyboard

const KeyboardScroll = forwardRef<ScrollView, ScrollViewProps>(function KeyboardScroll(
  { contentContainerStyle, onScroll, onTouchEnd, children, ...rest }, ref,
) {
  const scroll = useRef<ScrollView>(null);
  const box = useRef<View>(null);
  const offset = useRef(0);
  const kbTop = useRef<number | null>(null);
  const [pad, setPad] = useState(0);
  useImperativeHandle(ref, () => scroll.current as ScrollView);

  function reveal() {
    const input: any = (TextInput as any).State?.currentlyFocusedInput?.();
    const top = kbTop.current;
    if (!input || top == null || !scroll.current) return;
    input.measureInWindow?.((_x: number, y: number, _w: number, h: number) => {
      const overlap = y + h + GAP - top;
      if (overlap > 0) scroll.current?.scrollTo({ y: offset.current + overlap, animated: true });
    });
  }

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, (e: KeyboardEvent) => {
      const top = e.endCoordinates.screenY;
      kbTop.current = top;
      // only pad by the part of this scroll view the keyboard really covers
      box.current?.measureInWindow((_x, y, _w, h) => {
        const covered = Math.max(0, y + h - top);
        setPad((p) => (Math.abs(p - covered) > 1 ? covered : p));
        setTimeout(reveal, Platform.OS === 'ios' ? 260 : 60);
      });
    });
    const h = Keyboard.addListener(hideEvt, () => { kbTop.current = null; setPad(0); });
    return () => { s.remove(); h.remove(); };
  }, []);

  return (
    <View ref={box} style={{ flex: 1 }} collapsable={false}>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        scrollEventThrottle={16}
        {...rest}
        contentContainerStyle={[contentContainerStyle, pad ? { paddingBottom: pad + GAP } : null]}
        onScroll={(e) => { offset.current = e.nativeEvent.contentOffset.y; onScroll?.(e); }}
        onTouchEnd={(e) => { setTimeout(reveal, 120); onTouchEnd?.(e); }}
      >
        {children}
      </ScrollView>
    </View>
  );
});

export default KeyboardScroll;
