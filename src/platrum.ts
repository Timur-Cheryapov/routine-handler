import axios from 'axios';
import { config } from './config.js';
import type { PlatrumTask, PlatrumUser } from './types.js';

const BASE_URL = `https://${config.platrum.host}.platrum.ru`;

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Api-key': config.platrum.apiKey,
    'Content-Type': 'application/json',
  },
});

interface PlatrumResponse<T> {
  status: string;
  data: T;
}

interface PlatrumListResponse<T> {
  status: string;
  data: {
    list: T[];
    total?: number;
  };
}

// Response structure from /tasks/api/calendar/panel/tasks
interface CalendarPanelResponse {
  status: string;
  data: {
    backlog_planner: PlatrumTask[];        // Очередь задач (overdue tasks)
    assignment_unplanned: PlatrumTask[];   // Поручения без сроков (tasks without deadlines)
    assignment_planned: PlatrumTask[];     // Поручения со сроками (tasks with deadlines)
    assignment_finished: PlatrumTask[];    // Завершенные задачи (finished tasks)
  };
}

export class PlatrumService {
  
  async getUsers(): Promise<PlatrumUser[]> {
    const endpoint = '/user/api/profile/list';
    try {
      const response = await client.post(endpoint, {});
      if (response.data?.status === 'success' && response.data.data) {
        const data = response.data.data;
        
        // API returns an object with user_id as keys
        if (typeof data === 'object' && !Array.isArray(data)) {
          const users = Object.values(data) as PlatrumUser[];
          // Filter out deleted/disabled users and those with firing dates
          return users.filter(user => 
            !user.is_deleted && 
            !user.is_disabled && 
            !user.firing_date
          );
        }
        
        // Fallback for array response
        if (Array.isArray(data)) {
          return data.filter(user => 
            !user.is_deleted && 
            !user.is_disabled && 
            !user.firing_date
          );
        }
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
    return [];
  }

  async getUserById(id: string): Promise<PlatrumUser | null> {
    try {
      const response = await client.post('/user/api/profile/get', { user_id: id });
      if (response.data?.status === 'success' && response.data?.data) {
        return response.data.data as PlatrumUser;
      }
    } catch (error) {
      // Ignore errors - user might not exist
    }
    return null;
  }

  async getTasks(): Promise<PlatrumTask[]> {
    console.log('Fetching tasks from Platrum calendar panel...');
    
    try {
      // First, get all active users
      const users = await this.getUsers();
      if (users.length === 0) {
        console.error('No users found. Cannot fetch tasks.');
        return [];
      }

      // Filter users that do not need to be tracked
      const usersNotToTrack = [
        'd197eea0c734e56c35ffdf0079779a44', // Timur
        '7c8c51fe41165056dadbaa8aeb0bb8d1', // Aleksandr
        '483f7ed3f1b1533a5ce37f47c6e01dc4', // Railya Tinbakova
        'bd068078cd7c0cd4e9469ff1d2e38de0', // Denis Isaev
        'f1f8573d51c1f96fb371d9dd92cf588a', // Tatyana Koryukina
      ]

      const usersToTrack = users.filter(user => !usersNotToTrack.includes(user.user_id));

      console.log(`Fetching calendar tasks for ${users.length} active users...`);
      
      // Use a Map to deduplicate tasks by ID (same task might appear in multiple user views)
      const taskMap = new Map<number, PlatrumTask>();
      
      // Fetch tasks for each user
      // Note: Each user has their own calendar view with tasks they're responsible for
      for (const user of usersToTrack) {
        console.log(`Fetching tasks for ${user.user_name} (${user.user_id})...`);
        
        const requestBody = {
          user_id: user.user_id, // Must specify a specific user (null doesn't work)
          panel_limits: {
            // Очередь задач (backlog/queue) - overdue tasks and tasks without deadlines
            backlog_planner: {
              limit: 5000,
              offset: 0,
              order: [
                { column: 'order.calendar_page_backlog_planner_none', direction: 'asc' },
                { column: 'id', direction: 'desc' }
              ],
              filter: []
            },
            // Поручения без сроков (assignments without planned dates)
            assignment_unplanned: {
              limit: 0,
              offset: 0,
              order: [
                // { column: 'responsible_user_ids', direction: 'asc' },
                // { column: 'order.calendar_page_assignment_unplanned_responsible_user_id', direction: 'asc' },
                // { column: 'id', direction: 'desc' }
              ],
              filter: []
            },
            // Поручения со сроками (assignments with planned dates) - we don't need these for our report
            assignment_planned: {
              limit: 0, // Don't fetch these
              offset: 0,
              order: [],
              filter: []
            },
            // Завершенные задачи (finished tasks) - we don't need these
            assignment_finished: {
              limit: 0, // Don't fetch these
              offset: 0,
              order: [],
              filter: []
            }
          }
        };

        try {
          const response = await client.post<CalendarPanelResponse>(
            'tasks/api/calendar/panel/tasks',
            requestBody
          );
          
          if (response.data?.status === 'success') {
            const data = response.data.data;
            
            // Combine backlog_planner and assignment_unplanned
            // These represent the "Очередь задач" (task queue) that we want to report on
            const backlogTasks = data.backlog_planner || [];
            //const unplannedTasks = data.assignment_unplanned || [];
            
            //const userTasks = [...backlogTasks, ...unplannedTasks];
            const userTasks = backlogTasks;
            
            // Add to map (deduplicates by task ID)
            for (const task of userTasks) {
              if (!task.deletion_date && task.responsible_user_ids?.length > 0) {
                taskMap.set(task.id, task);
              }
            }
            
            console.log(`  Found ${backlogTasks.length} backlog = ${userTasks.length} tasks for ${user.user_name}`);
          }
        } catch (error: any) {
          console.error(`  Error fetching tasks for ${user.user_name}:`, error?.response?.data?.message || error.message);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
      }

      const allTasks = Array.from(taskMap.values());
      console.log(`Total unique tasks across all users: ${allTasks.length}`);
      
      return allTasks;
    } catch (error: any) {
      console.error('Error fetching tasks:', error?.response?.data || error.message);
    }

    return [];
  }

  async extractUsersFromTasks(tasks: PlatrumTask[]): Promise<PlatrumUser[]> {
    const userMap = new Map<string, PlatrumUser>();
    const userIdsToResolve = new Set<string>();

    for (const task of tasks) {
      if (task.responsible_user_ids) {
        for (const userId of task.responsible_user_ids) {
          userIdsToResolve.add(userId);
        }
      }
    }

    console.log(`Extracting ${userIdsToResolve.size} unique users from tasks...`);
    
    for (const userId of userIdsToResolve) {
      await new Promise(r => setTimeout(r, 50)); // Rate limiting
      const user = await this.getUserById(userId);
      
      if (user && !user.is_deleted && !user.is_disabled && !user.firing_date) {
        userMap.set(userId, user);
      } else if (user) {
        // User exists but is deleted/disabled - skip them
        console.log(`Skipping disabled/deleted user: ${user.user_name}`);
      } else {
        // User not found - create placeholder (shouldn't happen often)
        userMap.set(userId, {
          user_id: userId,
          user_name: `Unknown User ${userId}`,
          name: `Unknown User ${userId}`,
          user_email: '',
          is_disabled: false,
          is_deleted: false,
        });
      }
    }
    
    return Array.from(userMap.values());
  }
}
