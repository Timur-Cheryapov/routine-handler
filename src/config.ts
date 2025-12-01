import dotenv from 'dotenv';

dotenv.config();

export const config = {
  platrum: {
    host: process.env.PLATRUM_HOST || '',
    apiKey: process.env.PLATRUM_API_KEY || '',
    usersNotToTrack: process.env.PLATRUM_USERS_NOT_TO_TRACK
      ? process.env.PLATRUM_USERS_NOT_TO_TRACK.split(',')
          .map(id => id.trim())
          .filter(Boolean)
      : [],
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

