import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import AppIcon from '../../components/AppIcon';
import { Chip } from '../../components/Chip';
import { useAuth } from '../../lib/auth';
import {
  Skill, SKILL_LABEL, SKILL_ICON, SKILL_COLOR, SKILL_DESC,
  SKILLS, Sport, SPORTS, SPORT_LABEL, fromDbSkill,
} from '../../lib/constants';
import { experienceLabel, roleIcon, roleLabel, FREQUENCY_OPTS, LEVEL_OPTS } from '../../lib/evaluation';
import { supabase } from '../../lib/supabase';
import { theme } from '../../lib/theme';
import { C, themed, ThemeMode } from '../../lib/palette';
import { useTheme } from '../../lib/themeContext';

type Skills = Partial<Record<Sport, Skill>>;

const MAX_AVATAR_BYTES = 1 * 1024 * 1024; // 1 MB

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

const feedbackSchema = z.object({
  message: z.string().min(1, 'Feedback cannot be empty').max(2000),
});
type FeedbackForm = z.infer<typeof feedbackSchema>;

export default function Profile() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const router = useRouter();
  const { mode, setMode } = useTheme();

  function switchTheme(m: ThemeMode) {
    if (m === mode) return;
    setMode(m);
    // screens remount with the new palette — come back to this tab
    setTimeout(() => router.replace('/(tabs)/profile' as any), 0);
  }

  const [name, setName]               = useState('');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName]     = useState('');
  const [avatarUrl, setAvatarUrl]     = useState<string | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [savingName, setSavingName]   = useState(false);
  const [skills, setSkills]           = useState<Skills>({});
  const [evals, setEvals]             = useState<Record<string, any>>({});
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent]           = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FeedbackForm>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: { message: '' },
  });

  const loadProfile = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setError(null);
    try {
      const [profile, mine] = await Promise.all([
        supabase.from('profiles').select('display_name, avatar_url').eq('id', uid).single(),
        supabase.from('player_sports').select('sport, skill, experience, frequency, highest_level, role, score, evaluated_at').eq('user_id', uid),
      ]);
      if (profile.error) throw profile.error;
      if (mine.error) throw mine.error;
      if (profile.data) {
        setName(profile.data.display_name ?? '');
        setAvatarUrl(profile.data.avatar_url ?? null);
      }
      if (mine.data)
        setSkills(Object.fromEntries(
          mine.data.map((r: any) => [r.sport, fromDbSkill(r.skill)])
        ));
      if (mine.data)
        setEvals(Object.fromEntries(mine.data.map((r: any) => [r.sport, r])));
    } catch (err: any) {
      setError(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useFocusEffect(useCallback(() => { loadProfile(); }, [loadProfile]));

  /* ── Avatar pick & upload ── */
  async function pickAvatar() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo access to change your avatar.');
        return;
      }
    } catch (e: any) {
      Alert.alert(
        'Not supported in Expo Go',
        'Avatar upload requires a development build. Run: npx expo run:android or npx expo run:ios'
      );
      return;
    }

    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
    } catch (e: any) {
      Alert.alert('Could not open photo library', e?.message ?? 'Unknown error');
      return;
    }

    if (result!.canceled || !result!.assets[0]) return;
    const asset = result!.assets[0];

    // Size check — fileSize may be undefined on some devices; use rough estimate
    const bytes = asset.fileSize ?? asset.width * asset.height * 3;
    if (bytes > MAX_AVATAR_BYTES) {
      Alert.alert(
        'Image too large',
        'Please choose an image under 1 MB. Try a smaller or more compressed photo.'
      );
      return;
    }

    setUploading(true);
    try {
      // Build file extension
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
      const filePath = `${uid}/avatar.${ext}`;

      // Fetch blob from local URI
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      // Double-check blob size
      if (blob.size > MAX_AVATAR_BYTES) {
        Alert.alert('Image too large', 'Please choose an image under 1 MB.');
        setUploading(false);
        return;
      }

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, { contentType: mime, upsert: true });

      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Add cache-buster so ExpoImage doesn't show stale version
      const freshUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: profErr } = await supabase
        .from('profiles')
        .update({ avatar_url: freshUrl })
        .eq('id', uid!);

      if (profErr) throw profErr;

      setAvatarUrl(freshUrl);
    } catch (err: any) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setUploading(false);
    }
  }

  /* ── Save display name ── */
  async function saveName() {
    if (!uid || !draftName.trim()) return;
    setSavingName(true);
    const { error: err } = await supabase
      .from('profiles')
      .update({ display_name: draftName.trim() })
      .eq('id', uid);
    setSavingName(false);
    if (err) {
      Alert.alert('Save failed', err.message);
    } else {
      setName(draftName.trim());
      setEditingName(false);
    }
  }

  /* ── Sport skill ── */
  async function setSkill(sport: Sport, skill: Skill | null) {
    if (!uid) return;
    const previous = skills;
    const next = { ...skills };
    if (skill) next[sport] = skill; else delete next[sport];
    setSkills(next);

    const dbSkill = skill === 'competitive' ? 'advanced' : skill;
    const { error: saveErr } = skill
      ? await supabase.from('player_sports')
          .upsert({ user_id: uid, sport, skill: dbSkill }, { onConflict: 'user_id,sport' })
      : await supabase.from('player_sports')
          .delete().eq('user_id', uid).eq('sport', sport);

    if (saveErr) { setSkills(previous); Alert.alert("Couldn't save", saveErr.message); }
  }

  /* ── Feedback ── */
  async function onSendFeedback(data: FeedbackForm) {
    if (!uid) return;
    setSubmittingFeedback(true);
    const { error: fbErr } = await supabase.from('feedback').insert({
      user_id: uid, message: data.message.trim(),
    });
    setSubmittingFeedback(false);
    if (fbErr) Alert.alert('Error', fbErr.message);
    else { setFeedbackSent(true); reset(); }
  }

  /* ── Initials fallback ── */
  const initials = name
    ? name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.colors.navy} />
    </View>
  );

  if (error) return (
    <View style={styles.center}>
      <Text style={styles.errorTextCentered}>{error}</Text>
      <Pressable style={styles.retryBtn} onPress={loadProfile}>
        <Text style={styles.retryBtnText}>Retry</Text>
      </Pressable>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Header ── */}
      <View style={styles.headerBar}>
        <Pressable style={styles.backCircle} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={C.muted} />
        </Pressable>
        <Text style={styles.headerTitle}>Account</Text>
      </View>

      {/* ── Avatar + name ── */}
      <View style={styles.profileCenter}>
        <Pressable style={styles.avatarWrap} onPress={pickAvatar} disabled={uploading}>
          {/* Circular clip for the photo only — badge sits outside it */}
          <View style={styles.avatarClip}>
            {avatarUrl ? (
              <ExpoImage
                source={{ uri: avatarUrl }}
                style={styles.avatarImg}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
          </View>
          {/* Camera badge — overlaps the rim, above the photo */}
          <View style={styles.cameraBadge}>
            {uploading
              ? <ActivityIndicator size="small" color={C.onAccent} />
              : <Ionicons name="camera" size={15} color={C.onAccent} />
            }
          </View>
        </Pressable>
        <Text style={styles.avatarHint}>
          {uploading ? 'Uploading…' : 'Tap to change · max 1 MB'}
        </Text>

        {/* Name row */}
        {editingName ? (
          <View style={styles.nameEditRow}>
            <TextInput
              style={styles.nameInput}
              value={draftName}
              onChangeText={setDraftName}
              autoFocus
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={saveName}
            />
            <Pressable
              style={[styles.nameActionBtn, styles.nameSaveBtn]}
              onPress={saveName}
              disabled={savingName}
            >
              {savingName
                ? <ActivityIndicator size="small" color={C.onPrimary} />
                : <Ionicons name="checkmark" size={18} color={C.onPrimary} />
              }
            </Pressable>
            <Pressable
              style={[styles.nameActionBtn, styles.nameCancelBtn]}
              onPress={() => setEditingName(false)}
            >
              <Ionicons name="close" size={18} color={C.muted} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.nameDisplayRow}
            onPress={() => { setDraftName(name); setEditingName(true); }}
          >
            <Text style={styles.profileName}>{name || 'Set your name'}</Text>
            <Ionicons name="pencil-outline" size={15} color={C.faint} style={{ marginLeft: 6, marginTop: 2 }} />
          </Pressable>
        )}

        <Text style={styles.profileEmail}>{session?.user.email ?? ''}</Text>
      </View>

      {/* ── Info card ── */}
      <Text style={styles.sectionLabel}>Profile</Text>
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <View style={styles.infoLeft}>
            <Ionicons name="person-outline" size={18} color={C.faint} />
            <Text style={styles.infoKey}>Display name</Text>
          </View>
          <Text style={styles.infoValue} numberOfLines={1}>{name || '—'}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.infoRow}>
          <View style={styles.infoLeft}>
            <Ionicons name="mail-outline" size={18} color={C.faint} />
            <Text style={styles.infoKey}>Email</Text>
          </View>
          <Text style={styles.infoValue} numberOfLines={1}>{session?.user.email ?? '—'}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.infoRow}>
          <View style={styles.infoLeft}>
            <Ionicons name="football-outline" size={18} color={C.faint} />
            <Text style={styles.infoKey}>Sports</Text>
          </View>
          <Text style={styles.infoValue}>
            {Object.keys(skills).length > 0
              ? Object.keys(skills).map((s) => SPORT_LABEL[s as Sport]).join(', ')
              : 'None set'}
          </Text>
        </View>
      </View>

      {/* ── Sports & skill level (locked) ── */}
      <View style={styles.lockedHeaderRow}>
        <Text style={[styles.sectionLabel, { marginBottom: 0 }]}>My sports & skill level</Text>
        <View style={styles.lockedPill}>
          <Ionicons name="lock-closed" size={10} color={C.muted} />
          <Text style={styles.lockedPillText}>Locked</Text>
        </View>
      </View>
      {SPORTS.map((sport) => {
        const accent = SPORT_ACCENT[sport];
        const tint   = SPORT_TINT[sport];
        const active = skills[sport];
        const ev     = evals[sport];
        if (!active) {
          return (
            <View key={sport} style={[styles.lockCard, styles.lockCardOff]}>
              <View style={[styles.sportIconCircle, { backgroundColor: C.border }]}>
                <AppIcon name={SPORT_ICON[sport] as any} size={16} color={C.faint} />
              </View>
              <Text style={[styles.sportName, { color: C.faint, flex: 1 }]}>{SPORT_LABEL[sport]}</Text>
              <Text style={styles.notPlayingText}>Not playing</Text>
            </View>
          );
        }
        const col   = SKILL_COLOR[active];
        const role  = roleLabel(sport, ev?.role);
        const exp   = experienceLabel(ev?.experience);
        const freq  = FREQUENCY_OPTS.find((o) => o.value === ev?.frequency)?.label;
        const lvl   = LEVEL_OPTS.find((o) => o.value === ev?.highest_level)?.label;
        const score = typeof ev?.score === 'number' ? ev.score : null;
        return (
          <View key={sport} style={[styles.lockCard, { backgroundColor: tint }]}>
            <View style={styles.lockTop}>
              <View style={[styles.sportIconCircle, { backgroundColor: accent }]}>
                <AppIcon name={SPORT_ICON[sport] as any} size={16} color={C.onPrimary} />
              </View>
              <Text style={[styles.sportName, { color: accent, flex: 1 }]}>{SPORT_LABEL[sport]}</Text>
              <View style={[styles.tierBadge, { backgroundColor: col.bg }]}>
                <Ionicons name={SKILL_ICON[active] as any} size={14} color={col.text} />
                <Text style={[styles.tierBadgeText, { color: col.text }]}>{SKILL_LABEL[active]}</Text>
              </View>
            </View>

            {score !== null && (
              <View style={styles.lockScoreWrap}>
                <View style={styles.lockScoreTrack}>
                  <View style={[styles.lockScoreFill, { width: `${Math.max(score, 4)}%`, backgroundColor: accent }]} />
                </View>
                <Text style={[styles.lockScoreText, { color: accent }]}>{score}</Text>
              </View>
            )}

            {ev?.evaluated_at ? (
              <View style={styles.factGrid}>
                {role && (
                  <View style={styles.fact}>
                    <AppIcon name={roleIcon(sport, ev.role) as any} size={14} color={accent} />
                    <Text style={styles.factText}>{role}</Text>
                  </View>
                )}
                {exp && (
                  <View style={styles.fact}>
                    <Ionicons name="time-outline" size={14} color={accent} />
                    <Text style={styles.factText}>{exp}</Text>
                  </View>
                )}
                {freq && (
                  <View style={styles.fact}>
                    <Ionicons name="repeat-outline" size={14} color={accent} />
                    <Text style={styles.factText}>{freq}</Text>
                  </View>
                )}
                {lvl && (
                  <View style={styles.fact}>
                    <Ionicons name="shield-outline" size={14} color={accent} />
                    <Text style={styles.factText}>{lvl}</Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.notEvaluated}>Not evaluated yet — complete the skill evaluation to unlock your role and score.</Text>
            )}
          </View>
        );
      })}
      <Text style={styles.lockFootnote}>
        Levels are set by your evaluation and adjust from other players' ratings after games.
      </Text>

      {/* ── Appearance ── */}
      <Text style={styles.sectionLabel}>Appearance</Text>
      <View style={styles.themeRow}>
        {([
          { m: 'light',  label: 'Light',  icon: 'sunny-outline',  swatch: ['#ffffff', '#001645'] },
          { m: 'dark',   label: 'Dark',   icon: 'moon-outline',   swatch: ['#0b1220', '#5b8cff'] },
          { m: 'pickup', label: 'PickUp', icon: 'flash-outline',  swatch: ['#001645', '#afd43a'] },
        ] as const).map((o) => {
          const on = mode === o.m;
          return (
            <Pressable
              key={o.m}
              style={[styles.themeOpt, on && { borderColor: C.accent, backgroundColor: C.accentSoft }]}
              onPress={() => switchTheme(o.m)}
            >
              <View style={styles.swatch}>
                <View style={[styles.swatchHalf, { backgroundColor: o.swatch[0] }]} />
                <View style={[styles.swatchHalf, { backgroundColor: o.swatch[1] }]} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
                <AppIcon name={o.icon} size={13} color={on ? C.text : C.muted} />
                <Text style={[styles.themeLabel, on && { color: C.text, fontWeight: '800' }]}>{o.label}</Text>
              </View>
              {on && (
                <View style={[styles.themeCheck, { backgroundColor: C.accent }]}>
                  <Ionicons name="checkmark" size={10} color={C.onAccent} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* ── Feedback ── */}
      <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Feedback</Text>
      {feedbackSent && (
        <View style={styles.successBanner}>
          <Text style={styles.successText}>Thanks for your feedback!</Text>
        </View>
      )}
      <Controller
        control={control}
        name="message"
        render={({ field: { onChange, value } }) => (
          <TextInput
            style={styles.feedbackInput}
            multiline
            maxLength={2000}
            placeholder="Tell us what you think or report an issue…"
            placeholderTextColor={C.faint}
            value={value}
            onChangeText={(t) => { setFeedbackSent(false); onChange(t); }}
          />
        )}
      />
      {errors.message && <Text style={styles.errorText}>{errors.message.message}</Text>}
      <Pressable
        style={[styles.feedbackBtn, submittingFeedback && { opacity: 0.6 }]}
        onPress={handleSubmit(onSendFeedback)}
        disabled={submittingFeedback}
      >
        {submittingFeedback
          ? <ActivityIndicator color={C.onPrimary} />
          : <Text style={styles.feedbackBtnText}>Send Feedback</Text>
        }
      </Pressable>

      {/* ── Logout ── */}
      <Pressable style={styles.logoutBtn} onPress={() => supabase.auth.signOut()}>
        <Ionicons name="log-out-outline" size={18} color={C.onPrimary} style={{ marginRight: 8 }} />
        <Text style={styles.logoutBtnText}>Log out</Text>
      </Pressable>

    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.card },
  content:   { padding: 20, paddingBottom: 56 },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

  headerBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, marginTop: 8 },
  backCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.surface,
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: C.text },

  /* Avatar */
  profileCenter: { alignItems: 'center', marginBottom: 28 },
  avatarWrap: {
    width: 104, height: 104, marginBottom: 10,
    overflow: 'visible',
  },
  avatarClip: {
    width: 104, height: 104, borderRadius: 52,
    backgroundColor: C.primary, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarImg:      { width: 104, height: 104 },
  avatarFallback: { width: 104, height: 104, justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { fontSize: 36, fontWeight: '800', color: C.onPrimary },
  cameraBadge: {
    position: 'absolute', bottom: 0, right: -2, zIndex: 2,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.accent,
    borderWidth: 3, borderColor: C.bg,        // ring cuts the badge out of the photo
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18, shadowRadius: 4, elevation: 5,
  },
  avatarHint: { fontSize: 11, color: C.faint, marginBottom: 10 },

  /* Name editing */
  nameDisplayRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  profileName:    { fontSize: 22, fontWeight: '800', color: C.text },
  nameEditRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  nameInput: {
    flex: 1, fontSize: 18, fontWeight: '700', color: C.text,
    borderBottomWidth: 2, borderBottomColor: C.primary,
    paddingVertical: 4, paddingHorizontal: 2,
  },
  nameActionBtn: {
    width: 34, height: 34, borderRadius: 17,
    justifyContent: 'center', alignItems: 'center',
  },
  nameSaveBtn:   { backgroundColor: C.primary },
  nameCancelBtn: { backgroundColor: C.surface },
  profileEmail:  { fontSize: 13, color: C.faint },

  /* Info card */
  sectionLabel: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 12, marginTop: 8 },
  infoCard: {
    borderWidth: 1, borderColor: C.border,
    borderRadius: 16, overflow: 'hidden',
    marginBottom: 24, backgroundColor: C.surface2,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  infoLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  infoKey:   { fontSize: 14, fontWeight: '500', color: C.text },
  infoValue: { fontSize: 14, color: C.faint, maxWidth: '45%', textAlign: 'right' },
  divider:   { height: 1, backgroundColor: C.border },

  /* Appearance */
  themeRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  themeOpt: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16,
    borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface2,
  },
  swatch:     { flexDirection: 'row', width: 44, height: 28, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  swatchHalf: { flex: 1 },
  themeLabel: { fontSize: 12, fontWeight: '600', color: C.muted },
  themeCheck: {
    position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },

  /* Locked sports */
  lockedHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  lockedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
  },
  lockedPillText: { fontSize: 10, fontWeight: '700', color: C.muted },
  lockCard:    { borderRadius: 18, padding: 14, marginBottom: 10 },
  lockCardOff: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface2, gap: 10 },
  lockTop:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notPlayingText: { fontSize: 12, fontWeight: '600', color: C.faint },
  tierBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
  },
  tierBadgeText: { fontSize: 12, fontWeight: '800' },
  lockScoreWrap:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  lockScoreTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.07)', overflow: 'hidden' },
  lockScoreFill:  { height: 6, borderRadius: 3 },
  lockScoreText:  { fontSize: 12, fontWeight: '800', minWidth: 22, textAlign: 'right' },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  fact: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.card, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
  },
  factText:     { fontSize: 12, fontWeight: '600', color: C.text2 },
  notEvaluated: { fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 17 },
  lockFootnote: { fontSize: 11, color: C.faint, textAlign: 'center', marginTop: 2, marginBottom: 20, lineHeight: 16 },

  /* Sports & skill */
  sportBlock: { marginBottom: 20 },
  sportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  sportIconCircle: {
    width: 30, height: 30, borderRadius: 15,
    justifyContent: 'center', alignItems: 'center',
  },
  sportName: { fontSize: 15, fontWeight: '700', flex: 1 },
  activeBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20,
  },
  activeBadgeText: { fontSize: 11, fontWeight: '700', color: C.onPrimary },
  skillCards: { flexDirection: 'row', gap: 8 },
  skillCard: {
    flex: 1,
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.surface2,
    gap: 4,
  },
  skillCardNotPlayingSelected: {
    backgroundColor: C.surface,
    borderColor: C.faint,
  },
  skillCardLabel: { fontSize: 11, fontWeight: '600', color: C.faint, textAlign: 'center' },
  skillCardDesc:  { fontSize: 9, color: C.faint, textAlign: 'center', lineHeight: 13 },

  /* Feedback */
  feedbackInput: {
    borderWidth: 1, borderColor: C.border, borderRadius: 12,
    padding: 14, fontSize: 14, height: 110,
    textAlignVertical: 'top', color: C.text,
    backgroundColor: C.surface2, marginBottom: 10,
  },
  feedbackBtn: {
    backgroundColor: C.muted, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginBottom: 12,
  },
  feedbackBtnText: { color: C.onPrimary, fontSize: 15, fontWeight: '700' },
  successBanner: { backgroundColor: C.greenBg, borderRadius: 8, padding: 10, marginBottom: 10 },
  successText:   { color: C.greenFg, fontWeight: '600', fontSize: 13 },

  /* Logout */
  logoutBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    backgroundColor: C.text, borderRadius: 12,
    paddingVertical: 14, marginTop: 8,
  },
  logoutBtnText: { color: C.onPrimary, fontSize: 15, fontWeight: '700' },

  errorText:        { color: theme.colors.danger, fontSize: 13, marginBottom: 8 },
  errorTextCentered:{ color: theme.colors.danger, fontSize: 14, textAlign: 'center', marginBottom: 12 },
  retryBtn: {
    backgroundColor: theme.colors.primary, paddingHorizontal: 24,
    paddingVertical: 12, borderRadius: 10,
  },
  retryBtnText: { color: C.onPrimary, fontWeight: '600' },
}));
