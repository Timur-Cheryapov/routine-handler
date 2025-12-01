import dotenv from 'dotenv';

dotenv.config();

const defaultUsersNotToTrack = [
  'd197eea0c734e56c35ffdf0079779a44', // Timur
  '7c8c51fe41165056dadbaa8aeb0bb8d1', // Aleksandr
  '483f7ed3f1b1533a5ce37f47c6e01dc4', // Railya Tinbakova
  'bd068078cd7c0cd4e9469ff1d2e38de0', // Denis Isaev
  'f1f8573d51c1f96fb371d9dd92cf588a', // Tatyana Koryukina
] as const;

const envUsersNotToTrack = process.env.PLATRUM_USERS_NOT_TO_TRACK
  ? process.env.PLATRUM_USERS_NOT_TO_TRACK.split(',')
      .map(id => id.trim())
      .filter(Boolean)
  : undefined;

export const config = {
  platrum: {
    host: process.env.PLATRUM_HOST || '', // e.g., 'abrands'
    apiKey: process.env.PLATRUM_API_KEY || '',
    queueColumnName: process.env.PLATRUM_QUEUE_COLUMN_NAME || 'Очередь', // Name of the column to check
    usersNotToTrack: envUsersNotToTrack ?? [...defaultUsersNotToTrack],
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    threadId: process.env.TELEGRAM_THREAD_ID ? parseInt(process.env.TELEGRAM_THREAD_ID) : undefined,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },
  schedule: {
    cron: '0 7 * * 1-5', // At 10:00 on every day-of-week from Monday through Friday.
  }
};

if (!config.platrum.host || !config.platrum.apiKey || !config.telegram.botToken || !config.telegram.chatId || !config.openai.apiKey) {
  console.warn('Warning: Some environment variables are missing. Please check .env or secrets.');
}

