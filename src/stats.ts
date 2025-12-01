import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import type { EmployeeStats } from './types.js';

export interface ReportStats {
  date: string;
  totalOverdue: number;
  totalNoDeadline: number;
  employees: Array<{
    name: string;
    overdue: number;
    noDeadline: number;
  }>;
}

const STATS_DIR = 'stats';
const STATS_FILE = join(STATS_DIR, 'latest.json');

export class StatsManager {
  
  async loadPreviousStats(): Promise<ReportStats | null> {
    try {
      const data = await fs.readFile(STATS_FILE, 'utf-8');
      const stats = JSON.parse(data) as ReportStats;

      // Ignore today's stats
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      if (stats.date === dateStr) {
        return null;
      }

      console.log(`Loaded previous stats from ${stats.date}`);
      return stats;
    } catch (error) {
      console.log('No previous stats found (first run or cache expired)');
      return null;
    }
  }

  async saveStats(stats: EmployeeStats[]): Promise<void> {
    try {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0] ?? now.toISOString(); // YYYY-MM-DD
      
      const totalOverdue = stats.reduce((sum, s) => sum + s.overdueCount, 0);
      const totalNoDeadline = stats.reduce((sum, s) => sum + s.noDeadlineCount, 0);

      const reportStats: ReportStats = {
        date: dateStr,
        totalOverdue,
        totalNoDeadline,
        employees: stats.map(s => ({
          name: s.user.user_name || s.user.name || `User ${s.user.user_id}`,
          overdue: s.overdueCount,
          noDeadline: s.noDeadlineCount
        }))
      };

      // Ensure directory exists
      await fs.mkdir(dirname(STATS_FILE), { recursive: true });
      
      // Save stats
      await fs.writeFile(STATS_FILE, JSON.stringify(reportStats, null, 2), 'utf-8');
      console.log(`Saved stats to ${STATS_FILE}`);
    } catch (error) {
      console.error('Error saving stats:', error);
    }
  }

  calculateImprovement(current: number, previous: number): { percent: number; direction: 'better' | 'worse' | 'same' } {
    if (previous === 0) {
      return { percent: 0, direction: current === 0 ? 'same' : 'worse' };
    }
    
    const change = previous - current; // Positive = improvement (fewer overdue)
    const percent = Math.abs(Math.round((change / previous) * 100));
    
    if (change > 0) return { percent, direction: 'better' };
    if (change < 0) return { percent, direction: 'worse' };
    return { percent: 0, direction: 'same' };
  }
}

