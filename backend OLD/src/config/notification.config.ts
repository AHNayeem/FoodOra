import { registerAs } from '@nestjs/config';

import { loadEnvironment } from './environment';

export const notificationConfig = registerAs('notification', () => {
  const env = loadEnvironment();
  return {
    firebase: {
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      /** Secret managers store the PEM with literal \n; restore the newlines. */
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      get configured(): boolean {
        return Boolean(env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL);
      },
    },
    webPush: {
      publicKey: env.WEB_PUSH_VAPID_PUBLIC_KEY,
      privateKey: env.WEB_PUSH_VAPID_PRIVATE_KEY,
    },
    smtp: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.SMTP_FROM,
      /** Mailpit locally speaks plain SMTP on 1025. */
      secure: env.SMTP_PORT === 465,
    },
    sms: {
      provider: env.SMS_PROVIDER,
      apiKey: env.SMS_API_KEY,
      senderId: env.SMS_SENDER_ID,
    },
  } as const;
});

export type NotificationConfig = ReturnType<typeof notificationConfig>;
