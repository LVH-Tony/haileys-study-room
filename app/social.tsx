import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  StyleSheet, ActivityIndicator, Alert, FlatList, Image,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import type { LeaderboardEntry } from '@/lib/database.types';

const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

type Tab = 'leaderboard' | 'friends' | 'search';

interface FriendRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  user_code: string | null;
  xp: number;
  status: 'pending' | 'accepted' | 'blocked';
  direction: 'sent' | 'received';
}

interface SearchResult {
  id: string;
  display_name: string;
  avatar_url: string | null;
  user_code: string | null;
  xp: number;
}

// ── Avatar helper ─────────────────────────────────────────────────────────────
function Avatar({ uri, name, size = 38 }: { uri?: string | null; name: string; size?: number }) {
  const initials = name.split(' ').map((w) => w[0] ?? '').slice(0, 2).join('').toUpperCase();
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[avs.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[avs.text, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}
const avs = StyleSheet.create({
  circle: { backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  text:   { color: Colors.white, fontWeight: '800' },
});

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SocialScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const [tab, setTab]           = useState<Tab>('leaderboard');
  const [lbGlobal, setLbGlobal] = useState<LeaderboardEntry[]>([]);
  const [lbFriends, setLbFriends] = useState<LeaderboardEntry[]>([]);
  const [lbMode, setLbMode]     = useState<'global' | 'friends'>('global');
  const [friends, setFriends]   = useState<FriendRow[]>([]);
  const [query, setQuery]       = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [nudging, setNudging]   = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    loadAll();
  }, [profile?.id]));

  async function loadAll() {
    if (!profile?.id) return;
    setLoading(true);
    const [globalRes, friendsLbRes, friendsRes] = await Promise.all([
      supabase.rpc('get_leaderboard', { p_limit: 30 }),
      supabase.rpc('get_friends_leaderboard', { p_user_id: profile.id }),
      loadFriends(),
    ]);
    setLbGlobal((globalRes.data ?? []) as LeaderboardEntry[]);
    setLbFriends((friendsLbRes.data ?? []) as LeaderboardEntry[]);
    setLoading(false);
  }

  async function loadFriends(): Promise<void> {
    if (!profile?.id) return;
    const { data } = await supabase
      .from('friendships')
      .select(`
        id, status,
        requester_id, addressee_id,
        requester:user_profiles!friendships_requester_id_fkey(id, display_name, avatar_url, user_code, xp),
        addressee:user_profiles!friendships_addressee_id_fkey(id, display_name, avatar_url, user_code, xp)
      `)
      .or(`requester_id.eq.${profile.id},addressee_id.eq.${profile.id}`)
      .neq('status', 'blocked');

    const rows: FriendRow[] = (data ?? []).map((f: any) => {
      const isSender = f.requester_id === profile.id;
      const other = isSender ? f.addressee : f.requester;
      return {
        id: other?.id ?? '',
        display_name: other?.display_name ?? '',
        avatar_url: other?.avatar_url ?? null,
        user_code: other?.user_code ?? null,
        xp: other?.xp ?? 0,
        status: f.status,
        direction: isSender ? 'sent' : 'received',
      };
    });
    setFriends(rows);
  }

  async function doSearch() {
    const q = query.trim();
    if (!q || q.length < 2) return;
    setSearching(true);
    const { data } = await supabase.rpc('search_profiles', { p_query: q, p_limit: 20 });
    setSearchResults(((data ?? []) as SearchResult[]).filter((r) => r.id !== profile?.id));
    setSearching(false);
  }

  async function sendRequest(toId: string) {
    if (!profile?.id) return;
    const { error } = await supabase.from('friendships').insert({ requester_id: profile.id, addressee_id: toId });
    if (error) Alert.alert('Error', error.message);
    else { Alert.alert('Request sent!', 'They will see your request in Friends.'); setSearchResults((r) => r.filter((x) => x.id !== toId)); }
  }

  async function respondToRequest(friendId: string, accept: boolean) {
    if (!profile?.id) return;
    if (accept) {
      await supabase.from('friendships')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('requester_id', friendId).eq('addressee_id', profile.id);
    } else {
      await supabase.from('friendships')
        .delete()
        .or(`and(requester_id.eq.${friendId},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${friendId})`);
    }
    await loadFriends();
  }

  async function removeFriend(friendId: string) {
    if (!profile?.id) return;
    Alert.alert('Remove friend?', 'This will remove them from your friends list.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await supabase.from('friendships')
          .delete()
          .or(`and(requester_id.eq.${profile.id},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${profile.id})`);
        await loadFriends();
      }},
    ]);
  }

  async function nudgeFriend(friendId: string) {
    if (!profile?.id) return;
    setNudging(friendId);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token ?? ANON_KEY;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/nudge-friend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendId }),
      });
      const data = await res.json();
      if (data.sent) Alert.alert('Nudge sent! 🔥', 'Your friend got the challenge!');
      else Alert.alert('Could not nudge', data.error ?? 'Try again later');
    } catch (e: any) { Alert.alert('Error', e.message); }
    setNudging(null);
  }

  const pendingReceived = friends.filter((f) => f.status === 'pending' && f.direction === 'received');
  const pendingSent     = friends.filter((f) => f.status === 'pending' && f.direction === 'sent');
  const accepted        = friends.filter((f) => f.status === 'accepted');

  const leaderboard = lbMode === 'global' ? lbGlobal : lbFriends;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Social</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* My user code banner */}
      {profile?.user_code && (
        <View style={styles.myCodeBanner}>
          <Text style={styles.myCodeLabel}>Your ID</Text>
          <Text style={styles.myCode}>#{profile.user_code}</Text>
          <Text style={styles.myCodeHint}>Share this so friends can find you</Text>
        </View>
      )}

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['leaderboard', 'friends', 'search'] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'leaderboard' ? '🏆 Board' : t === 'friends' ? `👥 Friends${pendingReceived.length > 0 ? ` (${pendingReceived.length})` : ''}` : '🔍 Find'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── LEADERBOARD TAB ── */}
      {tab === 'leaderboard' && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Global / Friends toggle */}
          <View style={styles.lbToggle}>
            <TouchableOpacity style={[styles.lbBtn, lbMode === 'global' && styles.lbBtnActive]} onPress={() => setLbMode('global')}>
              <Text style={[styles.lbBtnText, lbMode === 'global' && styles.lbBtnTextActive]}>Global</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.lbBtn, lbMode === 'friends' && styles.lbBtnActive]} onPress={() => setLbMode('friends')}>
              <Text style={[styles.lbBtnText, lbMode === 'friends' && styles.lbBtnTextActive]}>Friends</Text>
            </TouchableOpacity>
          </View>

          {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 30 }} /> : (
            leaderboard.length === 0
              ? <Text style={styles.empty}>{lbMode === 'friends' ? 'Add friends to see a friends leaderboard!' : 'No data yet'}</Text>
              : leaderboard.map((entry, i) => {
                const isSelf = entry.id === profile?.id || (entry as any).is_self;
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                return (
                  <View key={entry.id} style={[styles.lbRow, isSelf && styles.lbRowSelf]}>
                    <Text style={styles.lbRank}>{medal ?? `#${entry.rank}`}</Text>
                    <Avatar uri={entry.avatar_url} name={entry.display_name} size={38} />
                    <View style={styles.lbMeta}>
                      <Text style={styles.lbName} numberOfLines={1}>{entry.display_name}{isSelf ? ' (you)' : ''}</Text>
                      <Text style={styles.lbCode}>#{entry.user_code}</Text>
                    </View>
                    <View style={styles.lbRight}>
                      <Text style={styles.lbXp}>⭐ {entry.xp}</Text>
                      {entry.streak_days > 0 && <Text style={styles.lbStreak}>🔥 {entry.streak_days}</Text>}
                    </View>
                  </View>
                );
              })
          )}
        </ScrollView>
      )}

      {/* ── FRIENDS TAB ── */}
      {tab === 'friends' && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Incoming requests */}
          {pendingReceived.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Friend Requests</Text>
              {pendingReceived.map((f) => (
                <View key={f.id} style={styles.friendRow}>
                  <Avatar uri={f.avatar_url} name={f.display_name} />
                  <View style={styles.friendMeta}>
                    <Text style={styles.friendName}>{f.display_name}</Text>
                    <Text style={styles.friendCode}>#{f.user_code}</Text>
                  </View>
                  <View style={styles.requestBtns}>
                    <TouchableOpacity style={styles.acceptBtn} onPress={() => respondToRequest(f.id, true)}>
                      <Text style={styles.acceptBtnText}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.declineBtn} onPress={() => respondToRequest(f.id, false)}>
                      <Text style={styles.declineBtnText}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Accepted friends */}
          {accepted.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Friends · {accepted.length}</Text>
              {accepted.map((f) => (
                <View key={f.id} style={styles.friendRow}>
                  <Avatar uri={f.avatar_url} name={f.display_name} />
                  <View style={styles.friendMeta}>
                    <Text style={styles.friendName}>{f.display_name}</Text>
                    <Text style={styles.friendCode}>#{f.user_code} · ⭐ {f.xp} XP</Text>
                  </View>
                  <View style={styles.friendActions}>
                    <TouchableOpacity style={styles.nudgeBtn} onPress={() => nudgeFriend(f.id)} disabled={nudging === f.id}>
                      {nudging === f.id ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.nudgeBtnText}>🔥 Nudge</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeFriend(f.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="person-remove-outline" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Sent pending */}
          {pendingSent.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pending Sent</Text>
              {pendingSent.map((f) => (
                <View key={f.id} style={styles.friendRow}>
                  <Avatar uri={f.avatar_url} name={f.display_name} />
                  <View style={styles.friendMeta}>
                    <Text style={styles.friendName}>{f.display_name}</Text>
                    <Text style={styles.friendCode}>#{f.user_code}</Text>
                  </View>
                  <Text style={styles.pendingLabel}>Pending…</Text>
                </View>
              ))}
            </View>
          )}

          {accepted.length === 0 && pendingReceived.length === 0 && pendingSent.length === 0 && (
            <Text style={styles.empty}>No friends yet. Use Find to search for people!</Text>
          )}
        </ScrollView>
      )}

      {/* ── SEARCH TAB ── */}
      {tab === 'search' && (
        <View style={styles.searchContainer}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Name, #UserCode, or email…"
              placeholderTextColor={Colors.textMuted}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={doSearch}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(''); setSearchResults([]); }}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.searchBtn} onPress={doSearch} disabled={searching}>
            {searching ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.searchBtnText}>Search</Text>}
          </TouchableOpacity>

          <Text style={styles.searchHint}>
            Search by display name, exact email, or #UserCode (e.g. #SCP982)
          </Text>

          <FlatList
            data={searchResults}
            keyExtractor={(r) => r.id}
            style={{ flex: 1 }}
            renderItem={({ item }) => {
              const alreadyFriend = friends.some((f) => f.id === item.id);
              return (
                <View style={styles.searchResult}>
                  <Avatar uri={item.avatar_url} name={item.display_name} />
                  <View style={styles.friendMeta}>
                    <Text style={styles.friendName}>{item.display_name}</Text>
                    <Text style={styles.friendCode}>#{item.user_code} · ⭐ {item.xp}</Text>
                  </View>
                  {alreadyFriend ? (
                    <Text style={styles.alreadyFriendText}>Friends ✓</Text>
                  ) : (
                    <TouchableOpacity style={styles.addBtn} onPress={() => sendRequest(item.id)}>
                      <Ionicons name="person-add" size={16} color={Colors.white} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={query.length > 0 && !searching ? <Text style={styles.empty}>No results found</Text> : null}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.background },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.text },

  myCodeBanner: { marginHorizontal: 20, marginBottom: 12, backgroundColor: Colors.primary + '15', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.primary + '40' },
  myCodeLabel:  { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semibold },
  myCode:       { fontSize: FontSize['2xl'], fontWeight: FontWeight.extrabold, color: Colors.primary, letterSpacing: 3 },
  myCodeHint:   { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },

  tabBar:       { flexDirection: 'row', marginHorizontal: 20, backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, overflow: 'hidden', marginBottom: 12 },
  tabBtn:       { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabText:      { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  tabTextActive: { color: Colors.white },

  scroll:       { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 8 },

  lbToggle:      { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: 4 },
  lbBtn:         { flex: 1, paddingVertical: 8, alignItems: 'center' },
  lbBtnActive:   { backgroundColor: Colors.primaryDark },
  lbBtnText:     { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  lbBtnTextActive: { color: Colors.white },

  lbRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.border },
  lbRowSelf: { borderColor: Colors.primary, backgroundColor: Colors.primary + '10' },
  lbRank:   { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textSecondary, width: 36, textAlign: 'center' },
  lbMeta:   { flex: 1, gap: 2 },
  lbName:   { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.text },
  lbCode:   { fontSize: FontSize.xs, color: Colors.textMuted },
  lbRight:  { alignItems: 'flex-end', gap: 2 },
  lbXp:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.xp },
  lbStreak: { fontSize: FontSize.xs, color: Colors.textSecondary },

  section:      { gap: 8 },
  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.textSecondary, marginTop: 8 },

  friendRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.border },
  friendMeta:  { flex: 1, gap: 2 },
  friendName:  { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.text },
  friendCode:  { fontSize: FontSize.xs, color: Colors.textMuted },
  friendActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  requestBtns: { flexDirection: 'row', gap: 6 },
  acceptBtn:   { backgroundColor: Colors.success, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  acceptBtnText: { color: Colors.white, fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  declineBtn:  { backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: Colors.border },
  declineBtnText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  nudgeBtn:    { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, minWidth: 72, alignItems: 'center' },
  nudgeBtnText: { color: Colors.white, fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  pendingLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontStyle: 'italic' },

  searchContainer: { flex: 1, paddingHorizontal: 20, gap: 10 },
  searchBox:   { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: 12, gap: 8, height: 46 },
  searchInput: { flex: 1, fontSize: FontSize.base, color: Colors.text },
  searchBtn:   { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  searchBtnText: { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.base },
  searchHint:  { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center' },
  searchResult: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 8 },
  addBtn:      { backgroundColor: Colors.primary, borderRadius: 20, padding: 8 },
  alreadyFriendText: { fontSize: FontSize.xs, color: Colors.success, fontWeight: FontWeight.bold },

  empty: { textAlign: 'center', color: Colors.textMuted, fontSize: FontSize.base, marginTop: 40, paddingHorizontal: 20 },
});
