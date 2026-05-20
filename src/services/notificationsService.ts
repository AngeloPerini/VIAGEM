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

export function subscribeNotifications(userId: string, onChange: () => void): RealtimeChannel {
  return supabase
    .channel(`notifications-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      onChange,
    )
    .subscribe();
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
