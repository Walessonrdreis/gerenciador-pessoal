import webpush from 'web-push';
import { prisma } from '@/lib/db';

let configured = false;

export function ensureVapid() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com';
  if (!publicKey || !privateKey) {
    throw new Error('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configurados');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  id: string;
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  ensureVapid();
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      )
    )
  );
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  return { sent: ok, total: subs.length };
}
