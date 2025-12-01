import TelegramBot from 'node-telegram-bot-api';
import { config } from './config.js';

export class TelegramService {
  private bot: TelegramBot;

  constructor() {
    this.bot = new TelegramBot(config.telegram.botToken, { polling: false });
  }

  async sendReport(report: string): Promise<void> {
    try {
      const chatId = config.telegram.chatId;
      const threadId = config.telegram.threadId;

      const options: TelegramBot.SendMessageOptions = {
        parse_mode: 'Markdown',
      };

      if (threadId) {
        options.message_thread_id = threadId;
      }

      await this.bot.sendMessage(chatId, report, options);
      console.log('Report sent successfully to Telegram');
    } catch (error) {
      console.error('Error sending report to Telegram:', error);
      throw error;
    }
  }
}

