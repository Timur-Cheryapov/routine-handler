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
    console.log('Fetching all tasks from Platrum...');
    
    try {
      // Fetch all tasks (filter doesn't work in the API)
      const response = await client.post('/tasks/api/task/list', {});
      
      if (response.data?.status === 'success') {
        let tasks: PlatrumTask[] = [];
        const data = response.data.data;

        if (data?.list && Array.isArray(data.list)) {
          tasks = data.list;
        } else if (Array.isArray(data)) {
          tasks = data;
        }

        console.log(`Fetched ${tasks.length} total tasks.`);

        // Filter client-side for unfinished tasks only
        const activeTasks = tasks.filter(t => 
          !t.is_finished && 
          !t.deletion_date &&
          t.responsible_user_ids && 
          t.responsible_user_ids.length > 0
        );

        console.log(`Filtered to ${activeTasks.length} active tasks with responsible users.`);
        return activeTasks;
      } else {
        console.error('Failed to fetch tasks:', response.data);
      }
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
