import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/* Unread game-chat tracking — stored locally per device (no DB change). */

const key = (gameId: string) => `chat_seen_${gameId}`;

export async function markChatSeen(gameId: string) {
  try { await AsyncStorage.setItem(key(gameId), new Date().toISOString()); } catch {}
}

async function getSeen(gameId: string): Promise<string> {
  try { return (await AsyncStorage.getItem(key(gameId))) ?? '1970-01-01T00:00:00Z'; }
  catch { return '1970-01-01T00:00:00Z'; }
}

/** Messages from other players newer than the last time this device opened the chat. */
export async function unreadCount(gameId: string, uid: string): Promise<number> {
  const seen = await getSeen(gameId);
  const { count, error } = await supabase
    .from('game_messages')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .neq('user_id', uid)
    .gt('created_at', seen);
  if (error) return 0;
  return count ?? 0;
}

export async function unreadCounts(gameIds: string[], uid: string): Promise<Record<string, number>> {
  const entries = await Promise.all(gameIds.map(async (id) => [id, await unreadCount(id, uid)] as const));
  return Object.fromEntries(entries);
}
