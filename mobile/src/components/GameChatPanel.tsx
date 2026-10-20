import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { supabase } from '../lib/supabase';
import { C, themed } from '../lib/palette';

type Msg = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles: { display_name: string; avatar_url: string | null } | null;
};

type Props = {
  gameId: string;
  uid: string | undefined;
  hostId: string;
  canRead: boolean;   // joined or host
  closed: boolean;    // cancelled or started
  hideInput?: boolean; // input rendered elsewhere (floating bar)
  refreshKey?: number; // bump to force reload
  onMessages?: () => void; // called after messages load (mark seen)
};

const MAX_LEN = 500;
const CHAT_HEIGHT = Math.round(Dimensions.get('window').height * 0.55);

function timeLabel(iso: string) {
  const d = new Date(iso);
  const today = d.toDateString() === new Date().toDateString();
  const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  return today ? t : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${t}`;
}

/** Inline game chat — lives inside the game preview "Game Chat" tab. */
export default function GameChatPanel({ gameId, uid, hostId, canRead, closed, hideInput, refreshKey, onMessages }: Props) {
  const [msgs, setMsgs]       = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText]       = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const isHost = uid === hostId;
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('game_messages')
      .select('id, user_id, body, created_at, profiles(display_name, avatar_url)')
      .eq('game_id', gameId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (err) { setError(err.message); return; }
    setError(null);
    setMsgs(((data ?? []) as any[]).reverse()); // oldest → newest
    onMessages?.();
  }, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canRead) { setLoading(false); return; }
    load().finally(() => setLoading(false));
  }, [load, canRead, refreshKey]);

  // Realtime — unique channel name per mount (avoids the "after subscribe()" crash)
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    if (!canRead) return;
    const channel = supabase
      .channel(`game_chat_${gameId}_${Date.now()}_${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_messages', filter: `game_id=eq.${gameId}` },
        () => { loadRef.current(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [gameId, canRead]);

  async function send() {
    const body = text.trim();
    if (!body || !uid || sending) return;
    setSending(true);
    const { error: err } = await supabase.from('game_messages').insert({ game_id: gameId, user_id: uid, body });
    setSending(false);
    if (err) { Alert.alert('Could not send', err.message); return; }
    setText('');
    await load();
  }

  function confirmDelete(m: Msg) {
    if (m.user_id !== uid && !isHost) return;
    Alert.alert('Delete message?', m.body.slice(0, 80), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error: err } = await supabase.from('game_messages').delete().eq('id', m.id);
          if (err) Alert.alert('Could not delete', err.message);
          await load();
        },
      },
    ]);
  }

  /* ── Not a member ── */
  if (!canRead) {
    return (
      <View style={styles.stateBox}>
        <Ionicons name="lock-closed-outline" size={32} color={C.border2} />
        <Text style={styles.stateTitle}>Join to chat</Text>
        <Text style={styles.stateHint}>Only players in this game can see the chat.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height: CHAT_HEIGHT }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
      {loading ? (
        <View style={styles.stateBox}><ActivityIndicator color={C.primary} /></View>
      ) : error ? (
        <View style={styles.stateBox}>
          <Ionicons name="alert-circle-outline" size={32} color={C.border2} />
          <Text style={styles.stateTitle}>Chat unavailable</Text>
          <Text style={styles.stateHint}>{error}</Text>
        </View>
      ) : msgs.length === 0 ? (
        <View style={styles.stateBox}>
          <Ionicons name="chatbubbles-outline" size={32} color={C.border2} />
          <Text style={styles.stateTitle}>No messages yet</Text>
          <Text style={styles.stateHint}>Say hi to your teammates.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {msgs.map((m) => {
            const mine     = m.user_id === uid;
            const name     = m.profiles?.display_name ?? 'Player';
            const avatar   = m.profiles?.avatar_url ?? null;
            const fromHost = m.user_id === hostId;
            return (
              <Pressable
                key={m.id}
                onLongPress={() => confirmDelete(m)}
                style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowOther]}
              >
                {!mine && (
                  avatar ? (
                    <ExpoImage source={{ uri: avatar }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarInitial}>{name.charAt(0).toUpperCase()}</Text>
                    </View>
                  )
                )}
                <View style={{ maxWidth: '78%' }}>
                  {!mine && (
                    <View style={styles.nameRow}>
                      <Text style={styles.senderName}>{name}</Text>
                      {fromHost && <Ionicons name="star" size={10} color={C.primary} style={{ marginLeft: 4 }} />}
                    </View>
                  )}
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                    <Text style={[styles.bubbleText, mine && { color: C.onPrimary }]}>{m.body}</Text>
                  </View>
                  <Text style={[styles.time, mine && { textAlign: 'right' }]}>{timeLabel(m.created_at)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      </ScrollView>

      {/* ── Input (docked to bottom of chat card) ── */}
      {hideInput ? null : closed ? (
        <View style={styles.closedBar}>
          <Ionicons name="lock-closed-outline" size={14} color={C.faint} style={{ marginRight: 6 }} />
          <Text style={styles.closedText}>Chat closed</Text>
        </View>
      ) : (
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Message…"
            placeholderTextColor={C.faint}
            value={text}
            onChangeText={setText}
            maxLength={MAX_LEN}
            multiline
          />
          <Pressable
            style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
            onPress={send}
            disabled={!text.trim() || sending}
          >
            {sending
              ? <ActivityIndicator size="small" color={C.onPrimary} />
              : <Ionicons name="send" size={16} color={C.onAccent} />}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: {
    marginTop: 8, marginBottom: 16,
    backgroundColor: C.card, borderRadius: 20,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden',
    shadowColor: '#001645', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  scroll:        { flex: 1, backgroundColor: C.surface2 },
  scrollContent: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 12, paddingVertical: 12 },
  list: { paddingVertical: 4 },

  stateBox:   { alignItems: 'center', paddingVertical: 32, gap: 6 },
  stateTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginTop: 4 },
  stateHint:  { fontSize: 13, color: C.faint, textAlign: 'center', paddingHorizontal: 20 },

  msgRow:      { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 4, gap: 8 },
  msgRowMine:  { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },

  avatar:         { width: 28, height: 28, borderRadius: 14, marginBottom: 18 },
  avatarFallback: { backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center' },
  avatarInitial:  { fontSize: 12, fontWeight: '700', color: C.muted },

  nameRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 2, marginLeft: 4 },
  senderName: { fontSize: 11, fontWeight: '700', color: C.muted },

  bubble:      { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  bubbleMine:  { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: C.surface, borderBottomLeftRadius: 4 },
  bubbleText:  { fontSize: 14, color: C.text, lineHeight: 19 },
  time:        { fontSize: 10, color: C.faint, marginTop: 2, marginHorizontal: 4 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 10, paddingVertical: 10,
    backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border,
  },
  input: {
    flex: 1, minHeight: 42, maxHeight: 110,
    backgroundColor: C.surface, borderRadius: 21,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11,
    fontSize: 14, color: C.text,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: C.accent,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#001645', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
  },

  closedBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, backgroundColor: C.surface2,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  closedText: { fontSize: 13, fontWeight: '600', color: C.faint },
}));

/** Floating message input — sits above the game's bottom action button. */
export function GameChatInput({ gameId, uid, onSent }: { gameId: string; uid: string | undefined; onSent?: () => void }) {
  const [text, setText]       = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    const body = text.trim();
    if (!body || !uid || sending) return;
    setSending(true);
    const { error: err } = await supabase.from('game_messages').insert({ game_id: gameId, user_id: uid, body });
    setSending(false);
    if (err) { Alert.alert('Could not send', err.message); return; }
    setText('');
    onSent?.();
  }

  return (
    <View style={floatStyles.bar}>
      <TextInput
        style={floatStyles.input}
        placeholder="Message the group…"
        placeholderTextColor={C.faint}
        value={text}
        onChangeText={setText}
        maxLength={MAX_LEN}
        multiline
      />
      <Pressable
        style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
        onPress={send}
        disabled={!text.trim() || sending}
      >
        {sending
          ? <ActivityIndicator size="small" color={C.onPrimary} />
          : <Ionicons name="send" size={16} color={C.onAccent} />}
      </Pressable>
    </View>
  );
}

const floatStyles = themed(() => StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    backgroundColor: C.card, borderRadius: 26,
    paddingLeft: 6, paddingRight: 6, paddingVertical: 6,
    marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#001645', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12, shadowRadius: 14, elevation: 8,
  },
  input: {
    flex: 1, minHeight: 42, maxHeight: 110,
    paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11,
    fontSize: 14, color: C.text,
  },
}));
