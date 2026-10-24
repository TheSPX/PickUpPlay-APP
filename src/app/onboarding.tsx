import { useRouter } from 'expo-router';
import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import Pressable from '../components/PressableScale';
import { Ionicons } from '@expo/vector-icons';
import AppIcon from '../components/AppIcon';
import { useAuth } from '../lib/auth';
import {
  Skill, SKILL_COLOR, SKILL_DESC, SKILL_ICON, SKILL_LABEL,
  Sport, SPORT_LABEL, SPORTS,
} from '../lib/constants';
import {
  EvalAnswers, EXPERIENCE_OPTS, FREQUENCY_OPTS, LEVEL_OPTS, ROLES,
  SKILL_CHECK, SKILL_CHECK_ICONS, allowedSkills, computeScore, scoreToSkill,
} from '../lib/evaluation';
import { supabase } from '../lib/supabase';
import { C, themed } from '../lib/palette';

const { width: SCREEN_W } = Dimensions.get('window');

const SPORT_ACCENT: Record<Sport, string> = themed(() => ({
  football:   C.blueFg,
  padel:      C.greenFg,
  basketball: C.amberFg,
  badminton:  C.purpleFg,
  billiards: C.tealFg,
}));
const SPORT_TINT: Record<Sport, string> = themed(() => ({
  football:   C.blueBg,
  padel:      C.greenBg,
  basketball: C.amberBg,
  badminton:  C.purpleBg,
  billiards: C.tealBg,
}));
const SPORT_ICON: Record<Sport, string> = {
  football:   'football-outline',
  padel:      'tennisball-outline',
  basketball: 'basketball-outline',
  badminton:  'medal-outline',
  billiards: 'billiards-8',
};

type Step = 'welcome' | 'sports' | 'skills' | 'done';

export default function Onboarding() {
  const { session } = useAuth();
  const router = useRouter();

  const [step, setStep]           = useState<Step>('welcome');
  const [selected, setSelected]   = useState<Set<Sport>>(new Set());
  const [skills, setSkills]       = useState<Partial<Record<Sport, Skill>>>({});
  const [answers, setAnswers]     = useState<Partial<Record<Sport, EvalAnswers>>>({});
  const [saving, setSaving]       = useState(false);
  const [sportIdx, setSportIdx]   = useState(0);   // which selected sport we're evaluating
  const [qIdx, setQIdx]           = useState(0);   // 0 exp · 1 freq · 2 level · 3 check · 4 role · 5 result
  const qFade = useRef(new Animated.Value(1)).current;
  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Reset the evaluation wizard when arriving at the skills step
  useEffect(() => {
    if (step === 'skills') { setSportIdx(0); setQIdx(0); }
  }, [step]);

  const TOTAL_Q = 5; // questions before the result card

  function fadeQ(fn: () => void) {
    Animated.timing(qFade, { toValue: 0, duration: 110, useNativeDriver: true }).start(() => {
      fn();
      Animated.timing(qFade, { toValue: 1, duration: 170, useNativeDriver: true }).start();
    });
  }

  function answer(sport: Sport, patch: EvalAnswers) {
    const merged = { ...(answers[sport] ?? {}), ...patch };
    setAnswers((prev) => ({ ...prev, [sport]: merged }));
    if (qIdx === TOTAL_Q - 1) {
      // last question → compute tier and show result
      setSkills((prev) => ({ ...prev, [sport]: scoreToSkill(computeScore(merged)) }));
    }
    setTimeout(() => fadeQ(() => setQIdx((q) => q + 1)), 180);
  }

  function evalBack() {
    if (qIdx > 0) { fadeQ(() => setQIdx((q) => q - 1)); return; }
    if (sportIdx > 0) { fadeQ(() => { setSportIdx((i) => i - 1); setQIdx(TOTAL_Q); }); return; }
    animateTransition('sports');
  }

  function nextSport() {
    if (sportIdx < sportsArr.length - 1) {
      fadeQ(() => { setSportIdx((i) => i + 1); setQIdx(0); });
    } else {
      finish();
    }
  }

  function animateTransition(next: Step) {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -30, duration: 160, useNativeDriver: true }),
    ]).start(() => {
      setStep(next);
      slideAnim.setValue(30);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  }

  function toggleSport(s: Sport) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(s)) {
        next.delete(s);
        setSkills((p) => { const c = { ...p }; delete c[s]; return c; });
        setAnswers((p) => { const c = { ...p }; delete c[s]; return c; });
      }
      else next.add(s);
      return next;
    });
  }

  async function finish() {
    if (!session?.user.id) return;
    setSaving(true);
    const uid = session.user.id;

    const now = new Date().toISOString();
    const rows = [...selected].map((sport) => {
      const a = answers[sport] ?? {};
      const skill = skills[sport] ?? 'beginner';
      return {
        user_id: uid,
        sport,
        skill: skill === 'competitive' ? 'advanced' : skill,
        experience:    a.experience ?? null,
        frequency:     a.frequency ?? null,
        highest_level: a.highest_level ?? null,
        skill_check:   a.skill_check ?? null,
        role:          a.role ?? null,
        score:         computeScore(a),
        evaluated_at:  now,
      };
    });

    if (rows.length > 0) {
      const { error: upErr } = await supabase.from('player_sports')
        .upsert(rows, { onConflict: 'user_id,sport' });
      if (upErr) { setSaving(false); alert(`Could not save: ${upErr.message}`); return; }
    }

    // Mark onboarding done in profile metadata
    await supabase.from('profiles')
      .update({ onboarding_done: true })
      .eq('id', uid);

    setSaving(false);
    router.replace('/');
  }

  const sportsArr = [...selected] as Sport[];

  return (
    <View style={styles.root}>
      {/* Progress dots */}
      <View style={styles.dotsRow}>
        {(['welcome', 'sports', 'skills'] as Step[]).map((s) => (
          <View
            key={s}
            style={[styles.dot, step === s && styles.dotActive,
              (step === 'skills' && s !== 'skills') || (step === 'sports' && s === 'welcome')
                ? styles.dotDone : null
            ]}
          />
        ))}
      </View>

      <Animated.View
        style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        {/* ── STEP 1: Welcome ── */}
        {step === 'welcome' && (
          <View style={styles.stepWrap}>
            <View style={styles.welcomeIconCircle}>
              <Ionicons name="trophy" size={48} color={C.primary} />
            </View>
            <Text style={styles.bigTitle}>Welcome to{'\n'}PickupPlay 🏆</Text>
            <Text style={styles.bigSub}>
              Find local games, join matches, and level up your game — all in one place.
            </Text>
            <Text style={styles.bigHint}>Pick your sports, then answer a few quick questions so we can match you fairly.</Text>
            <Pressable style={styles.primaryBtn} onPress={() => animateTransition('sports')}>
              <Text style={styles.primaryBtnText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={18} color={C.onPrimary} style={{ marginLeft: 8 }} />
            </Pressable>
          </View>
        )}

        {/* ── STEP 2: Pick sports ── */}
        {step === 'sports' && (
          <View style={styles.stepWrap}>
            <Text style={styles.stepTitle}>What do you play?</Text>
            <Text style={styles.stepSub}>Pick all the sports you're interested in. You can always change this later.</Text>
            <View style={styles.sportGrid}>
              {SPORTS.map((sport) => {
                const on = selected.has(sport);
                return (
                  <Pressable
                    key={sport}
                    style={[
                      styles.sportTile,
                      on && { backgroundColor: SPORT_TINT[sport], borderColor: SPORT_ACCENT[sport], borderWidth: 2 },
                    ]}
                    onPress={() => toggleSport(sport)}
                  >
                    <View style={[styles.sportTileIcon, { backgroundColor: on ? SPORT_ACCENT[sport] : C.border }]}>
                      <AppIcon name={SPORT_ICON[sport] as any} size={26} color={on ? C.onPrimary : C.muted} />
                    </View>
                    <Text style={[styles.sportTileLabel, on && { color: SPORT_ACCENT[sport], fontWeight: '800' }]}>
                      {SPORT_LABEL[sport]}
                    </Text>
                    {on && (
                      <View style={[styles.sportCheckmark, { backgroundColor: SPORT_ACCENT[sport] }]}>
                        <Ionicons name="checkmark" size={12} color={C.onPrimary} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.btnRow}>
              <Pressable style={styles.ghostBtn} onPress={() => animateTransition('welcome')}>
                <Ionicons name="arrow-back" size={18} color={C.text} />
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, { flex: 1, marginLeft: 10 }, selected.size === 0 && styles.btnDisabled]}
                onPress={() => animateTransition('skills')}
                disabled={selected.size === 0}
              >
                <Text style={styles.primaryBtnText}>
                  {selected.size === 0 ? 'Pick at least one' : `Next  (${selected.size} selected)`}
                </Text>
                <Ionicons name="arrow-forward" size={18} color={C.onPrimary} style={{ marginLeft: 8 }} />
              </Pressable>
            </View>
          </View>
        )}

        {/* ── STEP 3: Skill evaluation wizard ── */}
        {step === 'skills' && sportsArr[sportIdx] && (() => {
          const sport  = sportsArr[sportIdx];
          const accent = SPORT_ACCENT[sport];
          const tint   = SPORT_TINT[sport];
          const a      = answers[sport] ?? {};
          const isLastSport = sportIdx === sportsArr.length - 1;

          const OptionList = ({ opts, selected, onPick }: {
            opts: { key: string; label: string; icon: string }[];
            selected?: string;
            onPick: (k: string) => void;
          }) => (
            <View style={styles.optList}>
              {opts.map((o) => {
                const on = selected === o.key;
                return (
                  <Pressable
                    key={o.key}
                    style={[styles.optTile, on && { backgroundColor: tint, borderColor: accent }]}
                    onPress={() => onPick(o.key)}
                  >
                    <View style={[styles.optIcon, { backgroundColor: on ? accent : C.border }]}>
                      <AppIcon name={o.icon as any} size={18} color={on ? C.onPrimary : C.muted} />
                    </View>
                    <Text style={[styles.optLabel, on && { color: accent }]}>{o.label}</Text>
                    {on && <Ionicons name="checkmark-circle" size={20} color={accent} />}
                  </Pressable>
                );
              })}
            </View>
          );

          let title = '';
          let body: ReactNode = null;
          if (qIdx === 0) {
            title = `How long have you played ${SPORT_LABEL[sport].toLowerCase()}?`;
            body = <OptionList opts={EXPERIENCE_OPTS.map((o) => ({ key: o.value, label: o.label, icon: o.icon }))}
              selected={a.experience} onPick={(k) => answer(sport, { experience: k as any })} />;
          } else if (qIdx === 1) {
            title = 'How often do you play?';
            body = <OptionList opts={FREQUENCY_OPTS.map((o) => ({ key: o.value, label: o.label, icon: o.icon }))}
              selected={a.frequency} onPick={(k) => answer(sport, { frequency: k as any })} />;
          } else if (qIdx === 2) {
            title = "What's the highest level you've played at?";
            body = <OptionList opts={LEVEL_OPTS.map((o) => ({ key: o.value, label: o.label, icon: o.icon }))}
              selected={a.highest_level} onPick={(k) => answer(sport, { highest_level: k as any })} />;
          } else if (qIdx === 3) {
            title = SKILL_CHECK[sport].question;
            body = <OptionList
              opts={SKILL_CHECK[sport].options.map((label, i) => ({ key: String(i), label, icon: SKILL_CHECK_ICONS[i] }))}
              selected={a.skill_check !== undefined ? String(a.skill_check) : undefined}
              onPick={(k) => answer(sport, { skill_check: Number(k) as any })} />;
          } else if (qIdx === 4) {
            title = 'What is your playing role?';
            body = <OptionList opts={ROLES[sport].map((r) => ({ key: r.value, label: r.label, icon: r.icon }))}
              selected={a.role} onPick={(k) => answer(sport, { role: k })} />;
          }

          /* ── Result card ── */
          if (qIdx >= TOTAL_Q) {
            const score    = computeScore(a);
            const computed = scoreToSkill(score);
            const current  = skills[sport] ?? computed;
            const col      = SKILL_COLOR[current];
            return (
              <View style={styles.stepWrap}>
                <View style={[styles.evalSportPill, { backgroundColor: tint }]}>
                  <AppIcon name={SPORT_ICON[sport] as any} size={14} color={accent} />
                  <Text style={[styles.evalSportPillText, { color: accent }]}>
                    {SPORT_LABEL[sport]} · {sportIdx + 1}/{sportsArr.length}
                  </Text>
                </View>
                <Animated.View style={{ opacity: qFade }}>
                  <View style={[styles.resultCard, { backgroundColor: col.bg }]}>
                    <View style={styles.resultIcon}>
                      <Ionicons name={SKILL_ICON[current] as any} size={34} color={col.text} />
                    </View>
                    <Text style={[styles.resultSmall, { color: col.text }]}>Your level</Text>
                    <Text style={[styles.resultTier, { color: col.text }]}>{SKILL_LABEL[current]}</Text>
                    <Text style={[styles.resultDesc, { color: col.text }]}>{SKILL_DESC[current]}</Text>
                    <View style={styles.scoreTrack}>
                      <View style={[styles.scoreFill, { width: `${Math.max(score, 4)}%`, backgroundColor: col.text }]} />
                    </View>
                    <Text style={[styles.scoreText, { color: col.text }]}>Score {score} / 100</Text>
                  </View>

                  <Text style={styles.adjustLabel}>Feels off? Adjust by one level</Text>
                  <View style={styles.adjustRow}>
                    {allowedSkills(computed).map((sk) => {
                      const on = current === sk;
                      const c = SKILL_COLOR[sk];
                      return (
                        <Pressable
                          key={sk}
                          style={[styles.adjustChip, on && { backgroundColor: c.bg, borderColor: c.text }]}
                          onPress={() => setSkills((p) => ({ ...p, [sport]: sk }))}
                        >
                          <Ionicons name={SKILL_ICON[sk] as any} size={14} color={on ? c.text : C.faint} />
                          <Text style={[styles.adjustChipText, on && { color: c.text }]}>{SKILL_LABEL[sk]}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={styles.lockNote}>
                    <Ionicons name="lock-closed-outline" size={11} color={C.faint} /> Your level is locked after setup and updates from players' ratings after games.
                  </Text>
                </Animated.View>

                <View style={[styles.btnRow, { marginTop: 'auto' }]}>
                  <Pressable style={styles.ghostBtn} onPress={evalBack}>
                    <Ionicons name="arrow-back" size={18} color={C.text} />
                  </Pressable>
                  <Pressable
                    style={[styles.primaryBtn, { flex: 1, marginLeft: 10 }, saving && { opacity: 0.7 }]}
                    onPress={nextSport}
                    disabled={saving}
                  >
                    {saving
                      ? <ActivityIndicator color={C.onPrimary} size="small" />
                      : <>
                          <Text style={styles.primaryBtnText}>
                            {isLastSport ? "Let's Play!" : `Next: ${SPORT_LABEL[sportsArr[sportIdx + 1]]}`}
                          </Text>
                          <Ionicons name={isLastSport ? 'rocket-outline' : 'arrow-forward'} size={18} color={C.onPrimary} style={{ marginLeft: 8 }} />
                        </>}
                  </Pressable>
                </View>
              </View>
            );
          }

          /* ── Question screen ── */
          return (
            <View style={styles.stepWrap}>
              <View style={[styles.evalSportPill, { backgroundColor: tint }]}>
                <AppIcon name={SPORT_ICON[sport] as any} size={14} color={accent} />
                <Text style={[styles.evalSportPillText, { color: accent }]}>
                  {SPORT_LABEL[sport]} · {sportIdx + 1}/{sportsArr.length}
                </Text>
              </View>

              {/* question progress bar */}
              <View style={styles.qBarRow}>
                {Array.from({ length: TOTAL_Q }).map((_, i) => (
                  <View key={i} style={[styles.qBar, { backgroundColor: i <= qIdx ? accent : C.border }]} />
                ))}
              </View>

              <Animated.View style={{ opacity: qFade, flex: 1 }}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.qCounter}>Question {qIdx + 1} of {TOTAL_Q}</Text>
                  <Text style={styles.qTitle}>{title}</Text>
                  {body}
                </ScrollView>
              </Animated.View>

              <View style={styles.btnRow}>
                <Pressable style={styles.ghostBtn} onPress={evalBack}>
                  <Ionicons name="arrow-back" size={18} color={C.text} />
                </Pressable>
                <Text style={styles.tapHint}>Tap an answer to continue</Text>
              </View>
            </View>
          );
        })()}
      </Animated.View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.card },

  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 60,
    marginBottom: 8,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.border,
  },
  dotActive: { backgroundColor: C.accent, width: 24 },
  dotDone:   { backgroundColor: C.accent },

  content: { flex: 1 },
  stepWrap: { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },

  /* Welcome */
  welcomeIconCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: C.blueBg,
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 28, marginTop: 16,
  },
  bigTitle: {
    fontSize: 34, fontWeight: '900', color: C.text,
    textAlign: 'center', lineHeight: 42, marginBottom: 14,
  },
  bigSub: {
    fontSize: 16, color: C.muted, textAlign: 'center',
    lineHeight: 24, marginBottom: 12,
  },
  bigHint: {
    fontSize: 14, color: C.faint, textAlign: 'center',
    marginBottom: 36,
  },

  /* Step header */
  stepTitle: { fontSize: 26, fontWeight: '900', color: C.text, marginBottom: 8 },
  stepSub:   { fontSize: 14, color: C.muted, lineHeight: 20, marginBottom: 24 },

  /* Sport grid */
  sportGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 14,
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  sportTile: {
    width: (SCREEN_W - 48 - 14) / 2,
    borderRadius: 20,
    borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.surface2,
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 10,
    position: 'relative',
  },
  sportTileIcon: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 10,
  },
  sportTileLabel: { fontSize: 15, fontWeight: '600', color: C.text2 },
  sportCheckmark: {
    position: 'absolute', top: 10, right: 10,
    width: 22, height: 22, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center',
  },

  /* Skill step */
  sportTabsScroll: { marginBottom: 20 },
  sportTab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.surface2, marginRight: 8,
    position: 'relative',
  },
  sportTabText: { fontSize: 13, fontWeight: '600', color: C.muted },
  donePin: {
    position: 'absolute', top: -4, right: -4,
    width: 16, height: 16, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: C.card,
  },

  skillCardGrid: { gap: 10, marginBottom: 16 },
  skillTile: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 16, borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.surface2,
    padding: 16,
    position: 'relative',
  },
  skillTileLabel: { fontSize: 15, fontWeight: '700', color: C.faint },
  skillTileDesc:  { fontSize: 12, color: C.faint, marginTop: 1, flex: 1 },
  skillCheck: {
    position: 'absolute', top: 12, right: 12,
    width: 20, height: 20, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },

  skillProgress: {
    fontSize: 12, color: C.faint, textAlign: 'center',
    marginBottom: 20,
  },
  skipHint: {
    fontSize: 12, color: C.faint, textAlign: 'center',
    marginTop: 12,
  },

  /* Evaluation wizard */
  evalSportPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginBottom: 14,
  },
  evalSportPillText: { fontSize: 12, fontWeight: '800' },
  qBarRow: { flexDirection: 'row', gap: 6, marginBottom: 22 },
  qBar:    { flex: 1, height: 4, borderRadius: 2 },
  qCounter: { fontSize: 12, fontWeight: '700', color: C.faint, marginBottom: 6, letterSpacing: 0.4 },
  qTitle:   { fontSize: 22, fontWeight: '900', color: C.text, lineHeight: 29, marginBottom: 20 },
  optList:  { gap: 10, paddingBottom: 16 },
  optTile: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.surface2, paddingVertical: 14, paddingHorizontal: 14,
  },
  optIcon:  { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  optLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: C.text2 },
  tapHint:  { flex: 1, textAlign: 'center', fontSize: 12, color: C.faint, marginRight: 50 },

  resultCard: { borderRadius: 22, alignItems: 'center', paddingVertical: 26, paddingHorizontal: 20, marginBottom: 22 },
  resultIcon: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(0,0,0,0.06)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  resultSmall: { fontSize: 12, fontWeight: '700', opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.6 },
  resultTier:  { fontSize: 30, fontWeight: '900', marginTop: 2 },
  resultDesc:  { fontSize: 13, opacity: 0.75, marginTop: 2, marginBottom: 16 },
  scoreTrack:  { width: '100%', height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.07)', overflow: 'hidden' },
  scoreFill:   { height: 8, borderRadius: 4 },
  scoreText:   { fontSize: 12, fontWeight: '700', marginTop: 6, opacity: 0.8 },

  adjustLabel: { fontSize: 13, fontWeight: '700', color: C.muted, marginBottom: 10, textAlign: 'center' },
  adjustRow:   { flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
  adjustChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface2,
  },
  adjustChipText: { fontSize: 13, fontWeight: '700', color: C.faint },
  lockNote: { fontSize: 11, color: C.faint, textAlign: 'center', lineHeight: 16, paddingHorizontal: 10 },

  /* Buttons */
  btnRow: { flexDirection: 'row', alignItems: 'center' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.primary,
    borderRadius: 30, paddingVertical: 15, paddingHorizontal: 24,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '800', color: C.onPrimary },
  btnDisabled: { backgroundColor: C.faint },
  ghostBtn: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: C.surface,
    justifyContent: 'center', alignItems: 'center',
  },
}));
