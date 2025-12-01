import type { PlatrumTask, PlatrumUser, EmployeeStats } from './types.js';
import { isPast, parseISO, isValid } from 'date-fns';
import OpenAI from 'openai';
import { config } from './config.js';

export class ReportGenerator {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }
  
  async generateReport(users: PlatrumUser[], tasks: PlatrumTask[]): Promise<string> {
    const stats: EmployeeStats[] = [];

    for (const user of users) {
      // Skip deleted/disabled users (should already be filtered, but double-check)
      if (user.is_deleted || user.is_disabled || user.firing_date) continue;

      // Filter tasks where user is responsible
      const userTasks = tasks.filter(task => 
        task.responsible_user_ids && 
        task.responsible_user_ids.includes(user.user_id) &&
        !task.is_finished
      );

      let overdueCount = 0;
      let noDeadlineCount = 0;

      for (const task of userTasks) {
        if (!task.finish_date) {
          noDeadlineCount++;
        } else {
          // Handle ISO format "2025-12-02T20:59:59Z" from Platrum
          const deadline = parseISO(task.finish_date);
          if (isValid(deadline) && isPast(deadline)) {
            overdueCount++;
          }
        }
      }

      stats.push({
        user,
        overdueCount,
        noDeadlineCount
      });
    }

    // Sort: least overdue first
    stats.sort((a, b) => a.overdueCount - b.overdueCount);

    return this.formatMessageWithAI(stats);
  }

  private async formatMessageWithAI(stats: EmployeeStats[]): Promise<string> {
    const now = new Date();
    const dateStr = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    
    const totalOverdue = stats.reduce((sum, s) => sum + s.overdueCount, 0);

    // Prepare data for AI
    const employeeData = stats.map(stat => ({
      name: stat.user.user_name || stat.user.name || `User ${stat.user.user_id}`,
      overdue: stat.overdueCount,
      noDeadline: stat.noDeadlineCount
    }));

    const systemPrompt = `Ты — опытный менеджер проектов, который создаёт мотивирующие отчёты по задачам команды.
Твоя задача — создать позитивный, структурированный отчёт, который:
1. Начинается с приветствия и общей статистики
2. Отмечает достижения (кто без просрочек, кто улучшил показатели)
3. Группирует сотрудников по категориям:
   - ✅ Лидеры (0 просрочек)
   - ✅ Отлично (1-3 просрочки)
   - ✅ Хорошо (4-5 просрочек)
   - 📋 Требует внимания (6+ просрочек)
4. Даёт конструктивные рекомендации
5. Ставит цель на неделю (снижение на 25%)
6. Заканчивается призывом к действию и поддержкой

Используй эмодзи для визуального оформления. Тон должен быть поддерживающим и мотивирующим, а не критическим.`;

    const userPrompt = `Создай мотивирующий отчёт по задачам команды на ${dateStr}.

Данные по сотрудникам (отсортированы от лучших к требующим внимания):
${employeeData.map(e => `${e.name}: просрочено ${e.overdue}, без сроков ${e.noDeadline}`).join('\n')}

Всего просроченных задач в команде: ${totalOverdue}

Создай отчёт в стиле примера, который я предоставлял. Отчёт должен быть на русском языке, мотивирующим и структурированным.`;

    try {
      const response = await this.openai.responses.create({
        model: 'gpt-4o-mini',
        instructions: systemPrompt,
        input: userPrompt,
        temperature: 0.7,
        max_output_tokens: 1500,
      });

      const aiResponse = response.output_text?.trim();
      
      if (aiResponse) {
        return aiResponse;
      } else {
        console.warn('OpenAI returned empty response, falling back to basic format');
        return this.formatMessageBasic(stats);
      }
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      console.log('Falling back to basic format');
      return this.formatMessageBasic(stats);
    }
  }

  private formatMessageBasic(stats: EmployeeStats[]): string {
    const now = new Date();
    const dateStr = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    
    const totalOverdue = stats.reduce((sum, s) => sum + s.overdueCount, 0);

    const lines: string[] = [];
    lines.push(`📊 *Отчет по задачам команды — ${dateStr}*`);
    lines.push('');
    lines.push(`Всего просроченных задач: ${totalOverdue}`);
    lines.push('');

    for (const stat of stats) {
      const { user, overdueCount, noDeadlineCount } = stat;
      let icon = '🏆';
      if (overdueCount >= 11) icon = '⚠️';
      else if (overdueCount >= 4) icon = '✅';

      const name = user.user_name || user.name || `User ${user.user_id}`;
      
      lines.push(`${icon} ${name} — просроченных: ${overdueCount}, без сроков: ${noDeadlineCount}`);
    }

    lines.push('');
    lines.push('Цель: сократить общее количество просрочек на 25%');
    lines.push('Если нужна помощь или перераспределение задач — пишите в чат');
    lines.push('Команда, вместе мы справимся! 💪');

    return lines.join('\n');
  }
}
