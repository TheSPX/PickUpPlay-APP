import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { Skill, SKILL_COLOR, SKILL_ICON, SKILL_LABEL, Sport } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { C, themed } from '../lib/palette';

export type RatePlayer = {
  user_id: string;
  name: string;
  avatar_url: string | null;
  skill?: Skill;
};

type Vote = -1 | 0 | 1;

const VOTE_OPTS: { v: Vote; label: string; icon: string; color: string; bg: string }[] = themed(() => [
  { v: -1, label: 'Lower',    icon: 'arrow-down',       color: C.amberFg, bg: C.amberBg },
  { v:  0, label: 'Accurate', icon: 'checkmark',        color: C.greenFg, bg: C.greenBg },
  { v:  1, label: 'Higher',   icon: 'arrow-up',         color: C.blueFg, bg: C.blueBg },
]);

type Props = {
  visible: boolean;
  onClose: () => void;
  gameId: string;
  sport: Sport;
  uid: string;
  players: RatePlayer[];      // teammates, excluding me
  onDone?: (ratedCount: number) => void;
};

/** "Was their level accurate?" — one vote per teammate per game. */
export default function RateTeammates({ visible, onClose, gameId, sport, uid, players, onDone }: Props) {
  const [votes, setVotes]   = useState<Record<string, Vote>>({});
  const [locked, setLocked] = useState<Record<string, boolean>>({}); // already submitted earlier
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    supabase
      .from('skill_votes')
      .select('target_id, vote')
      .eq('game_id', gameId)
      .eq('voter_id', uid)
      .then(({ data }) => {
        const v: Record<string, Vote> = {};
        const l: Record<string, boolean> = {};
        (data ?? []).forEach((r: any) => { v[r.target_id] = r.vote; l[r.target_id] = true; });
        setVotes(v);
        setLocked(l);
      });
  }, [visible, gameId, uid]);

  const pending = players.filter((p) => votes[p.user_id] !== undefined && !locked[p.user_id]);

  async function submit() {
    if (!pending.length) { onClose(); return; }
    setSaving(true);
    const rows = pending.map((p) => ({
      game_id: gameId, voter_id: uid, target_id: p.user_id, sport, vote: votes[p.user_id],
    }));
    const { error } = await supabase.from('skill_votes').insert(rows);
    setSaving(false);
    if (error) { Alert.alert('Could not save ratings', error.message); return; }
    onDone?.(Object.keys(locked).length + pending.length);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.bg} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Rate your teammates</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={C.muted} />
            </Pressable>
          </View>
          <Text style={styles.sub}>Was each player's level accurate? Ratings are anonymous and help keep games fair.</Text>

          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {players.length === 0 && <Text style={styles.empty}>No teammates to rate.</Text>}
            {players.map((p) => {
              const sel = votes[p.user_id];
              const isLocked = !!locked[p.user_id];
              const col = p.skill ? SKILL_COLOR[p.skill] : null;
              return (
                <View key={p.user_id} style={styles.row}>
                  <View style={styles.who}>
                    {p.avatar_url ? (
                      <ExpoImage source={{ uri: p.avatar_url }} style={styles.avatar} contentFit="cover" />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.initial}>{p.name.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                      {p.skill && col && (
                        <View style={[styles.levelChip, { backgroundColor: col.bg }]}>
                          <Ionicons name={SKILL_ICON[p.skill] as any} size={11} color={col.text} />
                          <Text style={[styles.levelText, { color: col.text }]}>{SKILL_LABEL[p.skill]}</Text>
                        </View>
                      )}
                    </View>
                    {isLocked && <Ionicons name="lock-closed" size={13} color={C.faint} />}
                  </View>
                  <View style={styles.voteRow}>
                    {VOTE_OPTS.map((o) => {
                      const on = sel === o.v;
                      return (
                        <Pressable
                          key={o.v}
                          disabled={isLocked}
                          onPress={() => setVotes((prev) => ({ ...prev, [p.user_id]: o.v }))}
                          style={[
                            styles.voteBtn,
                            on && { backgroundColor: o.bg, borderColor: o.color },
                            isLocked && !on && { opacity: 0.35 },
                          ]}
                        >
                          <Ionicons name={o.icon as any} size={14} color={on ? o.color : C.faint} />
                          <Text style={[styles.voteText, on && { color: o.color }]}>{o.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <Pressable style={[styles.submit, saving && { opacity: 0.7 }]} onPress={submit} disabled={saving}>
            {saving
              ? <ActivityIndicator color={C.onPrimary} />
              : <Text style={styles.submitText}>{pending.length ? `Submit ${pending.length} rating${pending.length > 1 ? 's' : ''}` : 'Close'}</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  bg:    { flex: 1, backgroundColor: 'rgba(0,22,69,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card, borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:  { fontSize: 19, fontWeight: '900', color: C.text },
  sub:    { fontSize: 13, color: C.muted, marginTop: 4, marginBottom: 14, lineHeight: 18 },
  empty:  { fontSize: 13, color: C.faint, textAlign: 'center', paddingVertical: 20 },

  row: { backgroundColor: C.surface2, borderRadius: 16, padding: 12, marginBottom: 10 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar:         { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { backgroundColor: C.border, justifyContent: 'center', alignItems: 'center' },
  initial:        { fontSize: 14, fontWeight: '800', color: C.muted },
  name:           { fontSize: 14, fontWeight: '800', color: C.text },
  levelChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginTop: 2,
  },
  levelText: { fontSize: 10, fontWeight: '800' },

  voteRow: { flexDirection: 'row', gap: 6 },
  voteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card,
  },
  voteText: { fontSize: 12, fontWeight: '700', color: C.muted },

  submit: {
    marginTop: 6, backgroundColor: C.primary, borderRadius: 16,
    paddingVertical: 15, alignItems: 'center',
  },
  submitText: { color: C.onPrimary, fontSize: 15, fontWeight: '800' },
}));
