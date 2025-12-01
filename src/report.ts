import type { PlatrumTask, PlatrumUser, EmployeeStats } from './types.js';
import { isPast, parseISO, isValid } from 'date-fns';

export class ReportGenerator {
  
  generateReport(users: PlatrumUser[], tasks: PlatrumTask[]): string {
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

    return this.formatMessage(stats);
  }

  private formatMessage(stats: EmployeeStats[]): string {
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
