import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Pressable from '../../components/PressableScale';
import KeyboardScroll from '../../components/KeyboardScroll';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../../components/ScreenHeader';
import AppIcon from '../../components/AppIcon';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../lib/auth';
import {
  SKILLS, SKILL_LABEL, SKILL_ICON, SKILL_DESC, SKILL_COLOR,
  Sport, SPORTS, SPORT_LABEL, skillRangeText, GAME_TYPES,
} from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { C, themed } from '../../lib/palette';
import { useTheme } from '../../lib/themeContext';
import { getGameWeather, GameWeather } from '../../lib/weather';

/* ─── Sport icon + color map ─────────────────────────────── */
const SPORT_ICON: Record<Sport, string> = {
  padel:      'tennisball-outline',
  football:   'football-outline',
  basketball: 'basketball-outline',
  badminton:  'medal-outline',
  billiards: 'billiards-8',
};
const SPORT_ACCENT: Record<Sport, string> = themed(() => ({
  padel:      C.greenFg,
  football:   C.blueFg,
  basketball: C.amberFg,
  badminton:  C.purpleFg,
  billiards: C.tealFg,
}));
const SPORT_LIGHT: Record<Sport, string> = themed(() => ({
  padel:      C.greenBg,
  football:   C.blueBg,
  basketball: C.amberBg,
  badminton:  C.purpleBg,
  billiards: C.tealBg,
}));

type Court = { id: string; name: string; address: string; sports: Sport[]; lat?: number | null; lng?: number | null };

const schema = z.object({
  sport:    z.enum(SPORTS),
  court_id: z.string().min(1, 'Select a court'),
  starts_at: z.date().refine((v) => v > new Date(), 'Start time must be in the future'),
  min_skill: z.enum(SKILLS),
  max_skill: z.enum(SKILLS),
  capacity: z
    .number()
    .min(2, 'Min 2 players')
    .max(30, 'Max 30 players'),
  notes: z.string().max(500).optional(),
  game_type: z.string().optional(),
}).refine(
  (d) => SKILLS.indexOf(d.min_skill) <= SKILLS.indexOf(d.max_skill),
  { message: 'Min skill cannot exceed max', path: ['max_skill'] }
).refine(
  (d) => d.sport !== 'billiards' || !!d.game_type,
  { message: 'Pick a game type', path: ['game_type'] }
);

export default function CreateGame() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const router = useRouter();

  const [courts, setCourts] = useState<Court[]>([]);
  const [loadingCourts, setLoadingCourts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [initialDate] = useState(() => new Date(Date.now() + 7200000));

  const { control, handleSubmit, setValue, watch, formState: { errors } } = useForm<any>({
    resolver: zodResolver(schema),
    defaultValues: {
      sport: 'padel', court_id: '', game_type: undefined,
      starts_at: initialDate,
      min_skill: 'beginner', max_skill: 'competitive',
      capacity: 10, notes: '',
    },
  });

  const selectedSport   = useWatch({ control, name: 'sport' });

  // Pre-select a sport when opened from Home's "no games" prompt
  const { sport: sportParam, court: courtParam } = useLocalSearchParams<{ sport?: string; court?: string }>();
  useEffect(() => {
    if (sportParam && (SPORTS as readonly string[]).includes(sportParam)) {
      setValue('sport', sportParam as Sport);
    }
  }, [sportParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-select a court when opened from the Nearby Courts map ("Host here")
  useEffect(() => {
    if (courtParam && courts.some((c) => c.id === courtParam)) setValue('court_id', courtParam);
  }, [courtParam, courts]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedCourtId = useWatch({ control, name: 'court_id' });
  const startsAtDate    = useWatch({ control, name: 'starts_at' });
  const gameType        = useWatch({ control, name: 'game_type' });
  const courtId         = useWatch({ control, name: 'court_id' });

  // Expected weather for the chosen court + start time
  const [forecast, setForecast] = useState<GameWeather | null | undefined>(undefined);
  useEffect(() => {
    const court = courts.find((c) => c.id === courtId);
    const when = startsAtDate ? new Date(startsAtDate as any) : null;
    if (!when || isNaN(when.getTime())) { setForecast(null); return; }
    let alive = true;
    setForecast(undefined);
    const t = setTimeout(() => {
      getGameWeather(Number(court?.lat ?? 32.1147), Number(court?.lng ?? 118.9343), when.toISOString())
        .then((w) => { if (alive) setForecast(w); });
    }, 300); // wait for the picker to settle
    return () => { alive = false; clearTimeout(t); };
  }, [courtId, startsAtDate, courts]);
  useEffect(() => {
    if (selectedSport !== 'billiards') setValue('game_type', undefined);
  }, [selectedSport]); // eslint-disable-line react-hooks/exhaustive-deps
  // Picker helpers — always start from a valid date, keep the other half intact
  const { mode: themeMode } = useTheme();
  const pickerVariant: 'light' | 'dark' = themeMode === 'dark' ? 'dark' : 'light';
  const baseDate = (() => {
    const d = startsAtDate ? new Date(startsAtDate as any) : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  })();
  function applyDate(d: Date) {
    const next = new Date(d);
    next.setHours(baseDate.getHours(), baseDate.getMinutes(), 0, 0);
    setValue('starts_at', next, { shouldValidate: true });
  }
  function applyTime(t: Date) {
    const next = new Date(baseDate);
    next.setHours(t.getHours(), t.getMinutes(), 0, 0);
    setValue('starts_at', next, { shouldValidate: true });
  }

  const minSkill        = useWatch({ control, name: 'min_skill' });
  const maxSkill        = useWatch({ control, name: 'max_skill' });
  const capacity        = useWatch({ control, name: 'capacity' });

  useEffect(() => {
    async function loadCourts() {
      setLoadingCourts(true);
      const { data, error } = await supabase
        .from('courts').select('*').contains('sports', [selectedSport]);
      if (error) { Alert.alert('Error', error.message); }
      else {
        const list = (data ?? []) as Court[];
        setCourts(list);
        if (!list.some((c) => c.id === selectedCourtId)) setValue('court_id', '');
      }
      setLoadingCourts(false);
    }
    loadCourts();
  }, [selectedSport]);

  function handleSkillTap(s: typeof SKILLS[number]) {
    const minI = SKILLS.indexOf(minSkill);
    const maxI = SKILLS.indexOf(maxSkill);
    const tapI = SKILLS.indexOf(s);
    if (tapI < minI)                          setValue('min_skill', s);
    else if (tapI > maxI)                     setValue('max_skill', s);
    else if (tapI === minI && minI === maxI)  { /* can't deselect all */ }
    else if (tapI === minI)                   setValue('min_skill', SKILLS[minI + 1]);
    else if (tapI === maxI)                   setValue('max_skill', SKILLS[maxI - 1]);
  }

  // DB enum uses 'advanced' but UI uses 'competitive'
  const toDbSkill = (s: string) => s === 'competitive' ? 'advanced' : s;

  async function onSubmit(data: any) {
    if (!uid) return;
    setBusy(true); setDbError(null);
    const { error } = await supabase.from('games').insert({
      host_id: uid, court_id: data.court_id, sport: data.sport,
      starts_at: data.starts_at.toISOString(),
      min_skill: toDbSkill(data.min_skill), max_skill: toDbSkill(data.max_skill),
      capacity: data.capacity,
      notes: data.notes?.trim() || null, status: 'open',
      ...(data.sport === 'billiards' ? { game_type: data.game_type } : {}),
    });
    setBusy(false);
    if (error) { setDbError(error.message); Alert.alert('Failed', error.message); }
    else router.replace('/my-games');
  }

  const minIdx = SKILLS.indexOf(minSkill);
  const maxIdx = SKILLS.indexOf(maxSkill);
  const sportAccent = SPORT_ACCENT[selectedSport as Sport] ?? C.primary;
  const sportLight  = SPORT_LIGHT[selectedSport as Sport] ?? C.accentSoft;

  /* ── Formatted date strings ── */
  const dateStr = startsAtDate
    ? new Date(startsAtDate).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
    : 'Pick a date';
  const timeStr = startsAtDate
    ? new Date(startsAtDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Pick a time';

  return (
    <View style={styles.rootWrap}>
    <ScreenHeader title="Create Game" subtitle="Host a new pickup match" />
    <KeyboardScroll
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {dbError
        ? <View style={styles.errBanner}><Ionicons name="alert-circle-outline" size={16} color="#dc2626" style={{ marginRight: 6 }} /><Text style={styles.errBannerText}>{dbError}</Text></View>
        : null}

      {/* ══ SECTION 1 — Sport ══ */}
      <SectionCard icon="basketball-outline" title="Sport" accent={C.primary}>
        <View style={styles.sportGrid}>
          {SPORTS.map((s) => {
            const on = selectedSport === s;
            return (
              <Pressable
                key={s}
                style={[styles.sportTile, on && { backgroundColor: SPORT_LIGHT[s], borderColor: SPORT_ACCENT[s], borderWidth: 2 }]}
                onPress={() => setValue('sport', s)}
              >
                <View style={[styles.sportIconCircle, { backgroundColor: on ? SPORT_ACCENT[s] : C.surface }]}>
                  <AppIcon name={SPORT_ICON[s] as any} size={22} color={on ? C.onPrimary : C.faint} />
                </View>
                <Text style={[styles.sportTileLabel, on && { color: SPORT_ACCENT[s], fontWeight: '700' }]}>
                  {SPORT_LABEL[s]}
                </Text>
                {on && <View style={[styles.sportTileDot, { backgroundColor: SPORT_ACCENT[s] }]} />}
              </Pressable>
            );
          })}
        </View>
      </SectionCard>

      {/* ══ SECTION 1b — Game type (billiards only) ══ */}
      {selectedSport === 'billiards' && (
        <SectionCard icon="layers-outline" title="Game Type" accent={SPORT_ACCENT.billiards}>
          <View style={styles.typeGrid}>
            {GAME_TYPES.billiards.map((t) => {
              const on = gameType === t.value;
              const acc = SPORT_ACCENT.billiards;
              return (
                <Pressable
                  key={t.value}
                  style={[styles.typeTile, on && { backgroundColor: SPORT_LIGHT.billiards, borderColor: acc }]}
                  onPress={() => setValue('game_type', t.value, { shouldValidate: true })}
                >
                  <AppIcon name={t.icon} size={22} color={on ? acc : C.faint} />
                  <Text style={[styles.typeLabel, on && { color: acc, fontWeight: '800' }]}>{t.label}</Text>
                  <Text style={styles.typeDesc} numberOfLines={2}>{t.desc}</Text>
                </Pressable>
              );
            })}
          </View>
          {errors.game_type ? <Text style={styles.fieldErr}>{errors.game_type.message as string}</Text> : null}
        </SectionCard>
      )}

      {/* ══ SECTION 2 — Court ══ */}
      <SectionCard icon="location-outline" title="Court" accent={C.primary}>
        {loadingCourts ? (
          <ActivityIndicator color={C.primary} style={{ marginVertical: 8 }} />
        ) : courts.length === 0 ? (
          <View style={styles.emptyCourtBox}>
            <Ionicons name="location-outline" size={28} color={C.border2} />
            <Text style={styles.emptyCourtText}>No courts for this sport yet</Text>
          </View>
        ) : (
          <View style={styles.courtList}>
            {courts.map((c) => {
              const on = selectedCourtId === c.id;
              return (
                <Pressable
                  key={c.id}
                  style={[styles.courtRow, on && styles.courtRowOn]}
                  onPress={() => setValue('court_id', c.id)}
                >
                  <View style={[styles.courtRadio, on && { borderColor: C.primary, backgroundColor: C.primary }]}>
                    {on && <Ionicons name="checkmark" size={12} color={C.onPrimary} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.courtName, on && { color: C.primary, fontWeight: '700' }]}>{c.name}</Text>
                    {c.address ? <Text style={styles.courtAddr}>{c.address}</Text> : null}
                  </View>
                  {on && <Ionicons name="chevron-forward" size={16} color={C.primary} />}
                </Pressable>
              );
            })}
          </View>
        )}
        {errors.court_id ? <Text style={styles.fieldErr}>{errors.court_id.message as string}</Text> : null}
      </SectionCard>

      {/* ══ SECTION 3 — Date & Time ══ */}
      <SectionCard icon="calendar-outline" title="Date & Time" accent={C.primary}>
        <View style={styles.dtRow}>
          <Pressable style={styles.dtBtn} onPress={() => setDatePickerOpen(true)}>
            <Ionicons name="calendar-outline" size={18} color={C.primary} style={{ marginBottom: 4 }} />
            <Text style={styles.dtBtnLabel}>Date</Text>
            <Text style={styles.dtBtnValue}>{dateStr}</Text>
          </Pressable>
          <View style={styles.dtDivider} />
          <Pressable style={styles.dtBtn} onPress={() => setTimePickerOpen(true)}>
            <Ionicons name="time-outline" size={18} color={C.primary} style={{ marginBottom: 4 }} />
            <Text style={styles.dtBtnLabel}>Time</Text>
            <Text style={styles.dtBtnValue}>{timeStr}</Text>
          </Pressable>
        </View>
        {/* Expected weather */}
        <View style={styles.wxRow}>
          {forecast === undefined ? (
            <>
              <ActivityIndicator size="small" color={C.faint} />
              <Text style={styles.wxMuted}>Checking forecast…</Text>
            </>
          ) : forecast ? (
            <>
              <Ionicons name={forecast.icon as any} size={15} color={C.primary} />
              <Text style={styles.wxText}>{forecast.tempC}℃ · {forecast.label}</Text>
              {forecast.rainChance !== null && forecast.rainChance >= 20 && (
                <View style={styles.wxRain}>
                  <Ionicons name="water-outline" size={12} color={C.blueFg} />
                  <Text style={styles.wxRainText}>{forecast.rainChance}%</Text>
                </View>
              )}
              <Text style={styles.wxMuted}>expected</Text>
            </>
          ) : (
            <>
              <Ionicons name="cloud-offline-outline" size={15} color={C.faint} />
              <Text style={styles.wxMuted}>No forecast yet for this date</Text>
            </>
          )}
        </View>
        {errors.starts_at ? <Text style={styles.fieldErr}>{errors.starts_at.message as string}</Text> : null}
      </SectionCard>

      {/* ── Date / time pickers ──
           Android: native dialog (no sheet). iOS: spinner in a themed bottom sheet. */}
      {Platform.OS === 'android' ? (
        <>
          {datePickerOpen && (
            <DateTimePicker
              value={baseDate}
              mode="date"
              display="calendar"
              minimumDate={new Date()}
              onChange={(evt, d) => {
                setDatePickerOpen(false);
                if (evt.type === 'set' && d) applyDate(d);
              }}
            />
          )}
          {timePickerOpen && (
            <DateTimePicker
              value={baseDate}
              mode="time"
              display="clock"
              is24Hour
              onChange={(evt, t) => {
                setTimePickerOpen(false);
                if (evt.type === 'set' && t) applyTime(t);
              }}
            />
          )}
        </>
      ) : (
        <>
          <Modal transparent animationType="slide" visible={datePickerOpen} onRequestClose={() => setDatePickerOpen(false)}>
            <Pressable style={styles.pickerBackdrop} onPress={() => setDatePickerOpen(false)} />
            <View style={styles.pickerSheet}>
              <View style={styles.pickerSheetHeader}>
                <Text style={styles.pickerSheetTitle}>Pick a Date</Text>
                <Pressable onPress={() => setDatePickerOpen(false)}>
                  <Text style={styles.pickerDone}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={baseDate}
                mode="date"
                minimumDate={new Date()}
                display="spinner"
                themeVariant={pickerVariant}
                textColor={C.text}
                onChange={(_evt, d) => { if (d) applyDate(d); }}
              />
            </View>
          </Modal>

          <Modal transparent animationType="slide" visible={timePickerOpen} onRequestClose={() => setTimePickerOpen(false)}>
            <Pressable style={styles.pickerBackdrop} onPress={() => setTimePickerOpen(false)} />
            <View style={styles.pickerSheet}>
              <View style={styles.pickerSheetHeader}>
                <Text style={styles.pickerSheetTitle}>Pick a Time</Text>
                <Pressable onPress={() => setTimePickerOpen(false)}>
                  <Text style={styles.pickerDone}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={baseDate}
                mode="time"
                display="spinner"
                themeVariant={pickerVariant}
                textColor={C.text}
                onChange={(_evt, t) => { if (t) applyTime(t); }}
              />
            </View>
          </Modal>
        </>
      )}

      {/* ══ SECTION 4 — Skill Level ══ */}
      <SectionCard icon="podium-outline" title="Skill Level" accent={C.primary}>
        <View style={styles.skillSummaryRow}>
          <Ionicons name="people-outline" size={13} color={C.muted} />
          <Text style={styles.skillSummaryText}>
            {'  '}Open to:{' '}
            <Text style={styles.skillSummaryBold}>{skillRangeText(minSkill, maxSkill)}</Text>
          </Text>
        </View>
        <View style={styles.skillTiles}>
          {SKILLS.map((s, i) => {
            const inRange = i >= minIdx && i <= maxIdx;
            const c = SKILL_COLOR[s];
            return (
              <Pressable
                key={s}
                style={[
                  styles.skillTile,
                  inRange
                    ? { backgroundColor: c.bg, borderColor: c.border, borderWidth: 2 }
                    : styles.skillTileOff,
                ]}
                onPress={() => handleSkillTap(s)}
              >
                <View style={[
                  styles.skillIconCircle,
                  inRange ? { backgroundColor: c.border } : { backgroundColor: C.surface },
                ]}>
                  <Ionicons name={SKILL_ICON[s] as any} size={18} color={inRange ? c.text : C.border2} />
                </View>
                <Text style={[styles.skillTileLabel, inRange ? { color: c.text } : { color: C.faint }]}>
                  {SKILL_LABEL[s]}
                </Text>
                <Text style={[styles.skillTileDesc, inRange ? { color: c.text, opacity: 0.75 } : { color: C.border2 }]}>
                  {SKILL_DESC[s]}
                </Text>
                {inRange && (
                  <View style={[styles.skillCheck, { backgroundColor: c.border }]}>
                    <Ionicons name="checkmark" size={9} color={c.text} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.skillHint}>Tap a level to add or remove it from the range</Text>
        {errors.max_skill ? <Text style={styles.fieldErr}>{errors.max_skill.message as string}</Text> : null}
      </SectionCard>

      {/* ══ SECTION 5 — Players ══ */}
      <SectionCard icon="people-outline" title="Players" accent={C.primary}>
        <View style={styles.stepperRow}>
          <Pressable
            style={[styles.stepperBtn, capacity <= 2 && styles.stepperBtnDisabled]}
            onPress={() => capacity > 2 && setValue('capacity', capacity - 1)}
          >
            <Ionicons name="remove" size={20} color={capacity <= 2 ? C.border2 : C.primary} />
          </Pressable>
          <View style={styles.stepperValueBox}>
            <Text style={styles.stepperValue}>{capacity}</Text>
            <Text style={styles.stepperValueLabel}>players</Text>
          </View>
          <Pressable
            style={[styles.stepperBtn, capacity >= 30 && styles.stepperBtnDisabled]}
            onPress={() => capacity < 30 && setValue('capacity', capacity + 1)}
          >
            <Ionicons name="add" size={20} color={capacity >= 30 ? C.border2 : C.primary} />
          </Pressable>
        </View>
        <View style={styles.stepperTrack}>
          <View style={[styles.stepperFill, { width: `${((capacity - 2) / 28) * 100}%` as any }]} />
        </View>
        <Text style={styles.stepperHint}>2 – 30 players</Text>
        {errors.capacity ? <Text style={styles.fieldErr}>{errors.capacity.message as string}</Text> : null}
      </SectionCard>

      {/* ══ SECTION 6 — Notes ══ */}
      <SectionCard icon="create-outline" title="Notes" accent={C.primary} optional>
        <Controller
          control={control}
          name="notes"
          render={({ field: { onChange, value } }) => (
            <TextInput
              style={styles.notesInput}
              multiline
              maxLength={500}
              value={value}
              onChangeText={onChange}
              placeholder="Any extra info for players — e.g. bring light & dark tops, balls provided…"
              placeholderTextColor={C.faint}
              textAlignVertical="top"
            />
          )}
        />
        {errors.notes ? <Text style={styles.fieldErr}>{errors.notes.message as string}</Text> : null}
      </SectionCard>

    </KeyboardScroll>

    {/* ── Sticky publish button ── */}
    <LinearGradient
      colors={[C.surface + '00', C.surface + 'eb', C.surface]}
      style={styles.stickyBar}
      pointerEvents="box-none"
    >
      <Pressable style={styles.publishBtn} onPress={handleSubmit(onSubmit)} disabled={busy}>
        {busy
          ? <ActivityIndicator color={C.onPrimary} />
          : <>
              <Ionicons name="flag" size={18} color={C.onPrimary} style={{ marginRight: 10 }} />
              <Text style={styles.publishBtnText}>Publish Game</Text>
            </>}
      </Pressable>
    </LinearGradient>
    </View>
  );
}

/* ─── Section card wrapper ─────────────────────────────────── */
function SectionCard({
  icon, title, accent, optional, children,
}: {
  icon: string; title: string; accent: string; optional?: boolean; children: React.ReactNode;
}) {
  return (
    <View style={cardStyles.wrap}>
      <View style={cardStyles.titleRow}>
        <View style={[cardStyles.iconCircle, { backgroundColor: accent }]}>
          <AppIcon name={icon as any} size={14} color={C.onPrimary} />
        </View>
        <Text style={cardStyles.title}>{title}</Text>
        {optional && <Text style={cardStyles.optional}>optional</Text>}
      </View>
      {children}
    </View>
  );
}

const cardStyles = themed(() => StyleSheet.create({
  wrap: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  titleRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 14,
  },
  iconCircle: {
    width: 26, height: 26, borderRadius: 13,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 8,
  },
  title: { fontSize: 14, fontWeight: '700', color: C.text, flex: 1 },
  optional: { fontSize: 11, color: C.faint, fontWeight: '500' },
}));

const styles = themed(() => StyleSheet.create({
  rootWrap: { flex: 1, backgroundColor: C.surface },
  root: { flex: 1 },
  content: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 16 },
  stickyBar: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 28,
  },

  /* Header */
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.card, justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: C.text },
  headerSub:   { fontSize: 13, color: C.muted, marginTop: 1 },

  errBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.dangerBg, borderRadius: 12,
    padding: 12, marginBottom: 14,
  },
  errBannerText: { fontSize: 13, color: '#dc2626', flex: 1 },

  /* Sport grid */
  sportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  wxRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    marginTop: 12, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: C.surface2, borderRadius: 12, alignSelf: 'flex-start',
  },
  wxText:     { fontSize: 13, fontWeight: '700', color: C.text },
  wxMuted:    { fontSize: 12, color: C.faint },
  wxRain:     { flexDirection: 'row', alignItems: 'center', gap: 2 },
  wxRainText: { fontSize: 12, fontWeight: '700', color: C.blueFg },
  typeGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeTile: {
    width: '47.5%', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8,
    borderRadius: 16, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface2,
  },
  typeLabel: { fontSize: 14, fontWeight: '700', color: C.text2, marginTop: 6 },
  typeDesc:  { fontSize: 11, color: C.muted, marginTop: 2, textAlign: 'center' },
  sportTile: {
    width: '47%',
    backgroundColor: C.surface2,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    padding: 14,
    alignItems: 'center',
    gap: 8,
    position: 'relative',
  },
  sportIconCircle: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center',
  },
  sportTileLabel: { fontSize: 13, color: C.muted, fontWeight: '600' },
  sportTileDot: {
    position: 'absolute', top: 10, right: 10,
    width: 8, height: 8, borderRadius: 4,
  },

  /* Court list */
  courtList: { gap: 8 },
  courtRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 12,
    borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.surface2, gap: 12,
  },
  courtRowOn: {
    borderColor: C.primary,
    backgroundColor: C.blueBg,
  },
  courtRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: C.border2,
    justifyContent: 'center', alignItems: 'center',
  },
  courtName: { fontSize: 14, color: C.text2, fontWeight: '600' },
  courtAddr: { fontSize: 12, color: C.faint, marginTop: 2 },
  emptyCourtBox: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyCourtText: { fontSize: 13, color: C.faint },

  /* Date & Time */
  dtRow: { flexDirection: 'row', alignItems: 'stretch' },
  dtBtn: {
    flex: 1, alignItems: 'center',
    paddingVertical: 18, paddingHorizontal: 8,
    backgroundColor: C.surface2, borderRadius: 14,
    borderWidth: 1.5, borderColor: C.blueBd,
  },
  dtDivider: { width: 10 },
  dtBtnLabel: { fontSize: 11, color: C.muted, fontWeight: '600', marginBottom: 4 },
  dtBtnValue: { fontSize: 15, color: C.primary, fontWeight: '800', textAlign: 'center' },

  /* Skill */
  skillSummaryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  skillSummaryText: { fontSize: 13, color: C.muted },
  skillSummaryBold: { fontWeight: '700', color: C.text },
  skillTiles: { flexDirection: 'row', gap: 8 },
  skillTile: {
    flex: 1, borderRadius: 14, padding: 10,
    alignItems: 'center', position: 'relative',
    minHeight: 105, justifyContent: 'center', gap: 4,
  },
  skillTileOff: {
    backgroundColor: C.surface2, borderWidth: 1.5, borderColor: C.border,
  },
  skillIconCircle: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginBottom: 2,
  },
  skillTileLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  skillTileDesc:  { fontSize: 9, textAlign: 'center', lineHeight: 12 },
  skillCheck: {
    position: 'absolute', top: 6, right: 6,
    width: 16, height: 16, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  skillHint: { fontSize: 11, color: C.faint, textAlign: 'center', marginTop: 10 },

  /* Stepper */
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 14 },
  stepperBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.surface,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: C.border,
  },
  stepperBtnDisabled: { borderColor: C.surface },
  stepperValueBox: { alignItems: 'center', minWidth: 60 },
  stepperValue: { fontSize: 32, fontWeight: '800', color: C.primary },
  stepperValueLabel: { fontSize: 12, color: C.faint, fontWeight: '500' },
  stepperTrack: {
    height: 6, backgroundColor: C.surface, borderRadius: 3,
    overflow: 'hidden', marginBottom: 6,
  },
  stepperFill: { height: 6, backgroundColor: C.primary, borderRadius: 3 },
  stepperHint: { fontSize: 11, color: C.faint, textAlign: 'center' },

  /* Notes */
  notesInput: {
    backgroundColor: C.surface2, borderRadius: 12,
    borderWidth: 1.5, borderColor: C.border,
    padding: 14, fontSize: 14, color: C.text,
    minHeight: 90,
  },

  /* Picker modal */
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerSheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34,
  },
  pickerSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.surface,
  },
  pickerSheetTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  pickerDone: { fontSize: 15, fontWeight: '700', color: C.primary },

  /* Errors */
  fieldErr: { fontSize: 12, color: '#dc2626', marginTop: 6 },

  /* Publish */
  publishBtn: {
    backgroundColor: C.primary,
    borderRadius: 16, paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 6, marginBottom: 8,
    shadowColor: '#001645',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  publishBtnText: { color: C.onPrimary, fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
}));
