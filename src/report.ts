import type { PlatrumTask, PlatrumUser, EmployeeStats } from './types.js';
import { isPast, parseISO, isValid } from 'date-fns';
import OpenAI from 'openai';
import { config } from './config.js';
import type { ReportStats } from './stats.js';

export class ReportGenerator {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }
  
  async generateReportWithStats(users: PlatrumUser[], tasks: PlatrumTask[], previousStats?: ReportStats | null): Promise<{ report: string; employeeStats: EmployeeStats[] }> {
    const employeeStats = this.calculateStats(users, tasks);
    const report = await this.formatMessageWithAI(employeeStats, previousStats);
    return { report, employeeStats };
  }

  async generateReport(users: PlatrumUser[], tasks: PlatrumTask[], previousStats?: ReportStats | null): Promise<string> {
    const employeeStats = this.calculateStats(users, tasks);
    return this.formatMessageWithAI(employeeStats, previousStats);
  }

  private calculateStats(users: PlatrumUser[], tasks: PlatrumTask[]): EmployeeStats[] {
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

    return stats;
  }

  private async formatMessageWithAI(stats: EmployeeStats[], previousStats?: ReportStats | null): Promise<string> {
    const now = new Date();
    const dateStr = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    
    const totalOverdue = stats.reduce((sum, s) => sum + s.overdueCount, 0);

    // Prepare data for AI
    const employeeData = stats.map(stat => ({
      name: stat.user.user_name || stat.user.name || `User ${stat.user.user_id}`,
      overdue: stat.overdueCount,
      noDeadline: stat.noDeadlineCount
    }));

    // Calculate improvement if previous stats exist
    let comparisonText = '';
    if (previousStats) {
      const prevTotal = previousStats.totalOverdue;
      const change = prevTotal - totalOverdue;
      const percent = prevTotal > 0 ? Math.abs(Math.round((change / prevTotal) * 100)) : 0;
      
      if (change > 0) {
        comparisonText = `\n\nСравнение с прошлым отчётом (${previousStats.date}):
- Было просроченных задач: ${prevTotal}
- Стало просроченных задач: ${totalOverdue}
- Улучшение на ${percent}%! 🎉`;
      } else if (change < 0) {
        comparisonText = `\n\nСравнение с прошлым отчётом (${previousStats.date}):
- Было просроченных задач: ${prevTotal}
- Стало просроченных задач: ${totalOverdue}
- Увеличение на ${percent}%`;
      } else {
        comparisonText = `\n\nСравнение с прошлым отчётом (${previousStats.date}):
- Просроченных задач осталось столько же: ${totalOverdue}`;
      }
    }

    const systemPrompt = `Ты — опытный менеджер проектов, который создаёт мотивирующие отчёты по задачам команды.
Сформируй отчёт СТРОГО в следующей структуре (те же заголовки и порядок), на русском языке, с дружелюбным тоном и эмодзи. Форматирование должно быть поддерживаемым в Telegram.

1) Заголовок:
   «📊 Отчёт по задачам команды - {дата}»

2) Короткое приветствие одной строкой.

3) Блок «📈 Общая картина:» с маркерами «•»:
   • «Всего просроченных задач: {totalOverdue}»
   • Если есть данные прошлого отчёта: «Это на {percent}% {меньше/больше}, чем в прошлый раз (было {prevTotal})! 🎉»
   • «Сотрудников проанализировано: {employeesCount}»

4) Блок «🏆 Результаты по команде:» и строка «(от лучших показателей к тем, где нужно больше внимания)».
   Разбей сотрудников по категориям и выведи в указанном порядке:
   - «✅ Топ-исполнители (0-3 просроченных)»
   - «👍 Хорошо (4-10 просроченных)»
   - «📋 Требует внимания (11+ просроченных)»
   В каждой категории выведи строки вида:
   • «{Имя} - просрочено: X, без сроков: Y» (можно добавить позитивный смайлик по желанию)

5) Блок «💪 Позитивные тренды:» — 2-3 пункта, если есть что отметить.

6) Блок «🎯 Цель на эту неделю:» — «Снизить общее количество просроченных задач ещё на 25% (с {totalOverdue} до {targetOverdue})».

7) Блок «💡 Рекомендации:» — 2-3 практичных пункта.

8) Строка «❗ Если нужна помощь или перераспределение задач — пишите в чат!»

9) Воодушевляющее закрытие одной строкой (например, «Команда, отличная динамика! Вместе мы справимся! 🚀»).

Требования:
- используй ровно эти заголовки и порядок;
- не добавляй технических комментариев;
- сортируй сотрудников по возрастанию просрочек внутри категорий;`;

    const employeesCount = employeeData.length;
    const targetOverdue = Math.max(0, Math.round(totalOverdue * 0.75));
    const prevTotalForPrompt = previousStats ? String(previousStats.totalOverdue) : '';

    const userPrompt = `Данные для отчёта на ${dateStr}:

Дата: ${dateStr}
Всего просроченных задач (сейчас): ${totalOverdue}
Сотрудников проанализировано: ${employeesCount}
${previousStats ? `Предыдущее значение просроченных задач: ${prevTotalForPrompt} (дата: ${previousStats.date})` : 'Предыдущее значение: нет данных'}
Целевое значение на неделю (-25%): ${targetOverdue}

Список сотрудников (отсортирован по возрастанию просрочек, для категоризации):
${employeeData.map(e => `${e.name}: просрочено ${e.overdue}, без сроков ${e.noDeadline}`).join('\n')}

Сформируй конечный отчёт строго по указанной выше структуре.`;

    try {
      const response = await this.openai.responses.create({
        model: 'gpt-4o-mini',
        instructions: systemPrompt,
        input: userPrompt,
        temperature: 0.9,
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
