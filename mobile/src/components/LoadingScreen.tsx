import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { C, themed } from '../lib/palette';

export default function LoadingScreen() {
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [scaleAnim] = useState(() => new Animated.Value(0.8));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.content,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        {/* PickUp Logo Image */}
        <Image
          source={require('../../assets/images/logo-glow.png')}
          style={styles.logoImage}
          contentFit="contain"
        />

        {/* Tagline */}
        <Text style={styles.tagline}>
          Find Your Team{'\n'}Favorite Sport With Us
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
  },
  logoImage: {
    width: 300,
    height: 130,
  },
  tagline: {
    marginTop: 20,
    fontSize: 18,
    color: C.border,
    textAlign: 'center',
    lineHeight: 28,
    fontWeight: '500',
  },
}));
