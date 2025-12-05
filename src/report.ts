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

    const targetOverdue = Math.max(0, Math.round(totalOverdue * 0.75));

    // Build the hardcoded structured report
    const lines: string[] = [];
    
    // Header
    lines.push(`📊 Отчёт по задачам команды - ${dateStr}`);
    lines.push('');
    lines.push('Привет, команда! 😊');
    lines.push('');
    
    // General overview
    lines.push('📈 Общая картина:');
    lines.push(`• Всего просроченных задач: ${totalOverdue}`);
    
    // Comparison with previous report
    if (previousStats) {
      const prevTotal = previousStats.totalOverdue;
      const change = prevTotal - totalOverdue;
      const absChange = Math.abs(change);
      
      if (change > 0) {
        lines.push(`• 🟢 Просроченных задач стало меньше на ${absChange} (было ${prevTotal})! 🎉`);
      } else if (change < 0) {
        lines.push(`• 🔴 Просроченных задач стало больше на ${absChange} (было ${prevTotal})`);
      } else {
        lines.push(`• Просроченных задач осталось столько же: ${totalOverdue}`);
      }
    }
    
    lines.push('');
    
    // Team results
    lines.push('🏆 Результаты по команде: (от лучших показателей к тем, где нужно больше внимания)');
    
    // Categorize employees and build formatted string for AI
    const topPerformers = stats.filter(s => s.overdueCount <= 3);
    const needsAttention = stats.filter(s => s.overdueCount > 3);
    
    const employeeDataLines: string[] = [];
    
    if (topPerformers.length > 0) {
      lines.push('✅ Топ-исполнители (0-3 просроченных)');
      employeeDataLines.push('✅ Топ-исполнители (0-3 просроченных)');
      topPerformers.forEach(stat => {
        const name = stat.user.user_name || stat.user.name || `User ${stat.user.user_id}`;
        const employeeLine = `• ${name} - просрочено: ${stat.overdueCount}, без сроков: ${stat.noDeadlineCount}`;
        lines.push(employeeLine);
        employeeDataLines.push(employeeLine);
      });
      lines.push('');
    }
    
    if (needsAttention.length > 0) {
      lines.push('📋 Требует внимания (4+ просроченных)');
      employeeDataLines.push('📋 Требует внимания (4+ просроченных)');
      needsAttention.forEach(stat => {
        const name = stat.user.user_name || stat.user.name || `User ${stat.user.user_id}`;
        const employeeLine = `• ${name} - просрочено: ${stat.overdueCount}, без сроков: ${stat.noDeadlineCount}`;
        lines.push(employeeLine);
        employeeDataLines.push(employeeLine);
      });
      lines.push('');
    }
    
    // Prepare formatted employee data string for AI
    const employeeDataString = employeeDataLines.join('\n');
    
    // Generate AI content for specific sections
    const aiContent = await this.generateAISections(employeeDataString, totalOverdue, previousStats);
    
    // AI-generated positive trends
    lines.push('💪 Позитивные тренды:');
    lines.push(aiContent.positiveTrends);
    lines.push('');
    
    // Goal
    lines.push(`🎯 Цель на эту неделю: Снизить общее количество просроченных задач ещё на 25% (с ${totalOverdue} до ${targetOverdue}).`);
    lines.push('');
    
    // AI-generated recommendations
    lines.push('💡 Рекомендации:');
    lines.push(aiContent.recommendations);
    lines.push('');
    
    // Call to action
    lines.push('❗ Если нужна помощь или перераспределение задач — пишите в чат!');
    lines.push('');
    
    // AI-generated closing
    lines.push(aiContent.closing);
    
    return lines.join('\n');
  }

  private async generateAISections(
    employeeDataString: string,
    totalOverdue: number,
    previousStats?: ReportStats | null
  ): Promise<{ positiveTrends: string; recommendations: string; closing: string }> {
    const systemPrompt = `Ты — опытный менеджер проектов, создающий мотивирующие отчёты для команды.
Твоя задача — сгенерировать три секции отчёта на русском языке с дружелюбным, но профессиональным тоном, для сотрудников в чате, основываясь на количестве текущих задач с просроченным сроком.

Требования:
- Не добавляй заголовки секций (они уже есть в отчёте)
- Используй маркеры «•» для списков
- Будь конкретным и упоминай имена сотрудников где уместно
- Используй эмодзи для настроения`;

    const userPrompt = `Данные команды:
Всего просроченных задач: ${totalOverdue}
${previousStats ? `Предыдущее значение: ${previousStats.totalOverdue}` : 'Предыдущие данные: нет'}

Сотрудники:
${employeeDataString}

Сгенерируй три секции в следующем формате:

1. Позитивные тренды (2-3 пункта для сотрудников в чате с маркерами «•»):
[отметь успехи сотрудников с наименьшими просрочками, позитивные изменения]

2. Рекомендации (2-3 практичных совета для сотрудников в чате с маркерами «•»):
[конкретные действия для улучшения работы с задачами]

3. Закрытие (одна воодушевляющая строка):
[мотивирующее сообщение с эмодзи]

Важно: каждая секция должна быть на новой строке, без заголовков секций, только содержимое.`;

    try {
      const response = await this.openai.responses.create({
        model: 'gpt-4o-mini',
        instructions: systemPrompt,
        input: userPrompt,
        temperature: 0.8,
        max_output_tokens: 500,
      });

      const aiResponse = response.output_text?.trim();
      
      if (aiResponse) {
        // Parse the AI response into three sections
        const sections = aiResponse.split(/\n\n+/);
        
        // Find sections by looking for patterns
        let positiveTrends = '';
        let recommendations = '';
        let closing = '';
        
        for (let i = 0; i < sections.length; i++) {
          const section = sections[i]?.trim();
          if (!section) continue;
          
          // First section with bullets -> positive trends
          if (!positiveTrends && section.includes('•')) {
            positiveTrends = section;
          } 
          // Second section with bullets -> recommendations
          else if (positiveTrends && !recommendations && section.includes('•')) {
            recommendations = section;
          }
          // Last non-empty section without bullets or very short -> closing
          else if (!closing && (!section.includes('•') || section.length < 100)) {
            closing = section;
          }
        }
        
        return {
          positiveTrends: positiveTrends || this.getDefaultPositiveTrends(),
          recommendations: recommendations || this.getDefaultRecommendations(),
          closing: closing || 'Команда, отличная динамика! Вместе мы справимся! 🚀'
        };
      } else {
        console.warn('OpenAI returned empty response, using defaults');
        return this.getDefaultAISections();
      }
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      console.log('Using default AI sections');
      return this.getDefaultAISections();
    }
  }

  private getDefaultAISections(): 
    { positiveTrends: string; recommendations: string; closing: string } {
    return {
      positiveTrends: this.getDefaultPositiveTrends(),
      recommendations: this.getDefaultRecommendations(),
      closing: 'Команда, отличная динамика! Вместе мы справимся! 🚀'
    };
  }

  private getDefaultPositiveTrends(): string {
    return '• Команда активно работает над задачами.\n• Есть сотрудники с отличными показателями по просроченным задачам.\n• Продолжайте в том же духе!';
  }

  private getDefaultRecommendations(): string {
    return '• Проверяйте свои задачи каждый день, чтобы заранее выявлять возможные просрочки.\n• Обсуждайте с командой сложные задачи, чтобы избежать задержек.\n• Ставьте напоминания для контроля сроков выполнения задач.';
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
