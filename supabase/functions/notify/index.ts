// Supabase Edge Function: notify
// Sends Expo push notifications for:
//   • player joined     ← Database Webhook on INSERT game_players
//   • new chat message  ← Database Webhook on INSERT game_messages
//   • game in ~1 hour   ← Cron every 10 min, POST { "type": "reminders" }
//
// Deploy:  npx supabase functions deploy notify --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const SPORT: Record<string, string> = {
  football: 'Football', padel: 'Padel', basketball: 'Basketball', badminton: 'Badminton', billiards: 'Billiards',
};

type Push = { to: string; title: string; body: string; data: Record<string, unknown>; sound: 'default' };

async function sendPush(messages: Push[]) {
  const valid = messages.filter((m) => m.to?.startsWith('ExponentPushToken'));
  for (let i = 0; i < valid.length; i += 100) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(valid.slice(i, i + 100)),
    });
  }
  return valid.length;
}

/** Push tokens + names for a list of user ids */
async function tokensFor(userIds: string[]) {
  if (!userIds.length) return [] as { id: string; push_token: string | null; display_name: string | null }[];
  const { data } = await supabase
    .from('profiles').select('id, push_token, display_name').in('id', userIds);
  return data ?? [];
}

async function gameInfo(gameId: string) {
  const { data } = await supabase
    .from('games').select('id, sport, host_id, starts_at, status, courts(name)').eq('id', gameId).single();
  return data as any;
}

async function playerIds(gameId: string) {
  const { data } = await supabase.from('game_players').select('user_id').eq('game_id', gameId);
  return (data ?? []).map((r: any) => r.user_id as string);
}

/* ── player joined → notify everyone else in the game ── */
async function onPlayerJoined(row: any) {
  const g = await gameInfo(row.game_id);
  if (!g || g.status !== 'open') return 0;
  const [joiner] = await tokensFor([row.user_id]);
  const others = (await playerIds(row.game_id)).filter((id) => id !== row.user_id);
  const recips = await tokensFor(others);
  const name = joiner?.display_name ?? 'A player';
  return sendPush(recips.map((r) => ({
    to: r.push_token!, sound: 'default',
    title: `${SPORT[g.sport] ?? 'Game'} · new player`,
    body: `${name} joined your game`,
    data: { gameId: g.id, type: 'joined' },
  })));
}

/* ── new chat message → notify everyone else in the game ── */
async function onMessage(row: any) {
  const g = await gameInfo(row.game_id);
  if (!g) return 0;
  const [sender] = await tokensFor([row.user_id]);
  const ids = new Set(await playerIds(row.game_id));
  ids.add(g.host_id);
  ids.delete(row.user_id);
  const recips = await tokensFor([...ids]);
  const body = String(row.body ?? '');
  return sendPush(recips.map((r) => ({
    to: r.push_token!, sound: 'default',
    title: `${sender?.display_name ?? 'Player'} · ${SPORT[g.sport] ?? 'Game'} chat`,
    body: body.length > 120 ? body.slice(0, 117) + '…' : body,
    data: { gameId: g.id, type: 'chat' },
  })));
}

/* ── reminders: games starting 50–60 min from now (cron every 10 min) ── */
async function reminders() {
  const now = Date.now();
  const from = new Date(now + 50 * 60_000).toISOString();
  const to   = new Date(now + 60 * 60_000).toISOString();
  const { data: games } = await supabase
    .from('games').select('id, sport, starts_at, courts(name)')
    .eq('status', 'open').gt('starts_at', from).lte('starts_at', to);

  let sent = 0;
  for (const g of (games ?? []) as any[]) {
    const recips = await tokensFor(await playerIds(g.id));
    const time = new Date(g.starts_at).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai',
    });
    sent += await sendPush(recips.map((r) => ({
      to: r.push_token!, sound: 'default',
      title: `${SPORT[g.sport] ?? 'Game'} starts in 1 hour`,
      body: `${time} at ${g.courts?.name ?? 'the court'} — don't be late!`,
      data: { gameId: g.id, type: 'reminder' },
    })));
  }
  return sent;
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json().catch(() => ({}));
    let sent = 0;

    if (payload.type === 'reminders') {
      sent = await reminders();
    } else if (payload.type === 'INSERT' && payload.table === 'game_players') {
      sent = await onPlayerJoined(payload.record);
    } else if (payload.type === 'INSERT' && payload.table === 'game_messages') {
      sent = await onMessage(payload.record);
    }

    return new Response(JSON.stringify({ ok: true, sent }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
