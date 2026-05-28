import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export type NotificationType =
  | 'invite_received'
  | 'invite_accepted'
  | 'trip_updated'
  | 'itinerary_updated'
  | 'expense_updated'
  | 'attraction_updated'
  | 'attraction_photo_added'
  | 'member_left';

export type AppNotification = {
  id: string;
  userId: string;
  groupId?: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type NotificationRow = {
  id: string;
  user_id: string;
  group_id: string | null;
  type: string;
  title: string;
  message: string;
  read: boolean | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type NotificationRealtimeState =
  | { available: true; status: string }
  | { available: false; status: string; message: string };

export type NotificationSubscription = {
  remove: () => void;
};

type NotificationRealtimeEntry = {
  userId: string;
  channel: RealtimeChannel;
  listeners: Set<() => void>;
  statusListeners: Set<(state: NotificationRealtimeState) => void>;
  lastState?: NotificationRealtimeState;
};

const notificationChannels = new Map<string, NotificationRealtimeEntry>();

const isNotificationType = (value: string): value is NotificationType =>
  [
    'invite_received',
    'invite_accepted',
    'trip_updated',
    'itinerary_updated',
    'expense_updated',
    'attraction_updated',
    'attraction_photo_added',
    'member_left',
  ].includes(value);

const toNotification = (row: NotificationRow): AppNotification => ({
  id: row.id,
  userId: row.user_id,
  groupId: row.group_id ?? undefined,
  type: isNotificationType(row.type) ? row.type : 'trip_updated',
  title: row.title,
  message: row.message,
  read: Boolean(row.read),
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
});

async function syncInviteNotifications() {
  const { error } = await supabase.rpc('sync_pending_invite_notifications');
  if (error) throw error;
}

export async function getNotifications(): Promise<AppNotification[]> {
  await syncInviteNotifications().catch(() => null);

  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, group_id, type, title, message, read, metadata, created_at')
    .order('read', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(80);

  if (error) throw error;
  return ((data ?? []) as NotificationRow[]).map(toNotification);
}

export async function getUnreadNotificationCount() {
  await syncInviteNotifications().catch(() => null);

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('read', false);

  if (error) throw error;
  return count ?? 0;
}

function notifyStatus(
  entry: NotificationRealtimeEntry,
  state: NotificationRealtimeState,
) {
  entry.lastState = state;
  entry.statusListeners.forEach((listener) => {
    try {
      listener(state);
    } catch (error) {
      console.warn('Erro em listener de status realtime de notificacoes.', error);
    }
  });
}

function removeStaleNotificationChannels(userId: string) {
  const topics = new Set([
    `realtime:notifications:${userId}`,
    `realtime:notifications-${userId}`,
  ]);

  supabase.getChannels()
    .filter((channel) => topics.has(channel.topic))
    .forEach((channel) => {
      void supabase.removeChannel(channel);
    });
}

function getOrCreateNotificationChannel(userId: string): NotificationRealtimeEntry | null {
  const currentEntry = notificationChannels.get(userId);
  if (currentEntry) return currentEntry;

  try {
    removeStaleNotificationChannels(userId);

    const entry: NotificationRealtimeEntry = {
      userId,
      channel: supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          () => {
            const activeEntry = notificationChannels.get(userId);
            activeEntry?.listeners.forEach((listener) => {
              try {
                listener();
              } catch (error) {
                console.warn('Erro em listener realtime de notificacoes.', error);
              }
            });
          },
        ),
      listeners: new Set(),
      statusListeners: new Set(),
      lastState: undefined,
    };

    notificationChannels.set(userId, entry);

    entry.channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        notifyStatus(entry, { available: true, status });
        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        notifyStatus(entry, {
          available: false,
          status,
          message: 'Notificacoes em tempo real indisponiveis no momento.',
        });
      }
    });

    return entry;
  } catch (error) {
    notificationChannels.delete(userId);
    console.warn('Nao foi possivel iniciar realtime de notificacoes.', error);
    return null;
  }
}

export function subscribeNotifications(
  userId: string | undefined,
  onChange: () => void,
  onStatus?: (state: NotificationRealtimeState) => void,
): NotificationSubscription {
  if (!userId) {
    onStatus?.({
      available: false,
      status: 'NO_USER',
      message: 'Notificacoes em tempo real indisponiveis no momento.',
    });
    return { remove: () => undefined };
  }

  const entry = getOrCreateNotificationChannel(userId);
  if (!entry) {
    onStatus?.({
      available: false,
      status: 'INIT_ERROR',
      message: 'Notificacoes em tempo real indisponiveis no momento.',
    });
    return { remove: () => undefined };
  }

  entry.listeners.add(onChange);
  if (onStatus) {
    entry.statusListeners.add(onStatus);
    if (entry.lastState) {
      try {
        onStatus(entry.lastState);
      } catch (error) {
        console.warn('Erro em listener de status realtime de notificacoes.', error);
      }
    }
  }

  return {
    remove: () => {
      entry.listeners.delete(onChange);
      if (onStatus) entry.statusListeners.delete(onStatus);

      if (entry.listeners.size === 0 && entry.statusListeners.size === 0) {
        notificationChannels.delete(entry.userId);
        void supabase.removeChannel(entry.channel);
      }
    },
  };
}

export async function markNotificationAsRead(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);

  if (error) throw error;
}

export async function clearReadNotifications() {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('read', true);

  if (error) throw error;
}

export async function createNotification({
  userId,
  groupId,
  type,
  title,
  message,
  metadata = {},
}: {
  userId: string;
  groupId?: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await supabase.rpc('create_notification', {
    target_user_id: userId,
    target_group_id: groupId ?? null,
    notification_type: type,
    notification_title: title,
    notification_message: message,
    notification_metadata: metadata,
  });

  if (error) throw error;
  return toNotification(data as NotificationRow);
}

export async function notifyGroupMembers({
  groupId,
  type,
  title,
  message,
  metadata = {},
}: {
  groupId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabase.rpc('notify_group_members', {
    target_group_id: groupId,
    notification_type: type,
    notification_title: title,
    notification_message: message,
    notification_metadata: metadata,
  });

  if (error) throw error;
}
