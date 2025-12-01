import dotenv from 'dotenv';

dotenv.config();

export const config = {
  platrum: {
    host: process.env.PLATRUM_HOST || '', // e.g., 'abrands'
    apiKey: process.env.PLATRUM_API_KEY || '',
    queueColumnName: process.env.PLATRUM_QUEUE_COLUMN_NAME || 'Очередь', // Name of the column to check
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    threadId: process.env.TELEGRAM_THREAD_ID ? parseInt(process.env.TELEGRAM_THREAD_ID) : undefined,
  },
  schedule: {
    cron: '0 7 * * 1-5', // At 10:00 on every day-of-week from Monday through Friday.
  }
};

if (!config.platrum.host || !config.platrum.apiKey || !config.telegram.botToken || !config.telegram.chatId) {
  console.warn('Warning: Some environment variables are missing. Please check .env or secrets.');
}

