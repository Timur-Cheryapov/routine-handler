import axios from 'axios';
import { config } from './config.js';
import { writeFileSync } from 'fs';

const BASE_URL = `https://${config.platrum.host}.platrum.ru`;

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Api-key': config.platrum.apiKey,
    'Content-Type': 'application/json',
  },
});

const output: string[] = [];
function log(...args: any[]) {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  console.log(...args);
  output.push(message);
}

async function testUserListAPI() {
  log('\n=== Testing User List API ===');
  try {
    const response = await client.post('/user/api/profile/list', {});
    log('Status:', response.data?.status);
    
    if (response.data?.data) {
      const data = response.data.data;
      if (data.list && Array.isArray(data.list)) {
        log(`Found ${data.list.length} users in data.list`);
        log('First user sample:', JSON.stringify(data.list[0], null, 2));
      } else if (Array.isArray(data)) {
        log(`Found ${data.length} users in data (array)`);
        log('First user sample:', JSON.stringify(data[0], null, 2));
      } else {
        log('Data is object, keys:', Object.keys(data));
        log(`Found ${Object.keys(data).length} users`);
        const firstUser = Object.values(data)[0];
        log('First user sample:', JSON.stringify(firstUser, null, 2));
      }
    }
  } catch (error: any) {
    log('Error:', error?.response?.data || error.message);
  }
}

async function testTaskListAPI() {
  log('\n=== Testing Task List API ===');
  
  // Test 1: Get all tasks without filter
  log('\n--- Test 1: All tasks (no filter) ---');
  try {
    const response = await client.post('/tasks/api/task/list', {});
    log('Status:', response.data?.status);
    
    if (response.data?.data) {
      const data = response.data.data;
      if (data.list && Array.isArray(data.list)) {
        log(`Found ${data.list.length} tasks`);
        log('First task sample:', JSON.stringify(data.list[0], null, 2));
      } else if (Array.isArray(data)) {
        log(`Found ${data.length} tasks`);
        log('First task sample:', JSON.stringify(data[0], null, 2));
      }
    }
  } catch (error: any) {
    log('Error:', error?.response?.data || error.message);
  }

  // Test 2: Get with is_finished filter
  log('\n--- Test 2: With is_finished filter ---');
  try {
    const response = await client.post('/tasks/api/task/list', {
      filter: [['is_finished', '=', false]]
    });
    log('Status:', response.data?.status);
    
    if (response.data?.data) {
      const data = response.data.data;
      const tasks = data.list || data;
      if (Array.isArray(tasks)) {
        log(`Found ${tasks.length} unfinished tasks`);
      }
    }
  } catch (error: any) {
    log('Error:', error?.response?.data || error.message);
  }
}

async function testCalendarAPI() {
  log('\n=== Testing Calendar/Queue API ===');
  
  // Look for calendar or queue-related endpoints
  const endpoints = [
    '/tasks/api/calendar/list',
    '/tasks/api/queue/list',
    '/tasks/api/panel/list',
    '/tasks/api/board/list',
  ];

  for (const endpoint of endpoints) {
    log(`\n--- Testing ${endpoint} ---`);
    try {
      const response = await client.post(endpoint, {});
      log('Status:', response.data?.status);
      log('Response:', JSON.stringify(response.data, null, 2).substring(0, 500));
    } catch (error: any) {
      log('Error:', error?.response?.status, error?.response?.statusText);
    }
  }
}

async function testCalendarPanelTasks() {
  log('\n=== Testing Calendar Panel Tasks (Main Endpoint) ===');
  
  // First, get a user to test with
  try {
    const userResponse = await client.post('/user/api/profile/list', {});
    if (userResponse.data?.status !== 'success' || !userResponse.data.data) {
      log('Failed to fetch users for testing');
      return;
    }
    
    const userData = userResponse.data.data;
    const users = typeof userData === 'object' && !Array.isArray(userData) 
      ? Object.values(userData) 
      : Array.isArray(userData) ? userData : [];
    
    // Find first active user
    const testUser = users.find((u: any) => !u.is_deleted && !u.is_disabled && !u.firing_date);
    
    if (!testUser) {
      log('No active user found for testing');
      return;
    }
    
    log(`Testing with user: ${testUser.user_name} (${testUser.user_id})`);
    
    const requestBody = {
      user_id: testUser.user_id, // Must be a specific user_id, null doesn't work
      panel_limits: {
        backlog_planner: {
          limit: 10,
          offset: 0,
          order: [
            { column: 'order.calendar_page_backlog_planner_none', direction: 'asc' },
            { column: 'id', direction: 'desc' }
          ],
          filter: []
        },
        assignment_unplanned: {
          limit: 10,
          offset: 0,
          order: [
            { column: 'responsible_user_ids', direction: 'asc' },
            { column: 'order.calendar_page_assignment_unplanned_responsible_user_id', direction: 'asc' },
            { column: 'id', direction: 'desc' }
          ],
          filter: []
        },
        assignment_planned: {
          limit: 0,
          offset: 0,
          order: [],
          filter: []
        },
        assignment_finished: {
          limit: 0,
          offset: 0,
          order: [],
          filter: []
        }
      }
    };
    
    const response = await client.post('tasks/api/calendar/panel/tasks', requestBody);
    log('\nStatus:', response.data?.status);
    
    if (response.data?.status === 'success' && response.data?.data) {
      const data = response.data.data;
      log(`\nBacklog Planner (Очередь задач): ${data.backlog_planner?.length || 0} tasks`);
      log(`Assignment Unplanned (Без сроков): ${data.assignment_unplanned?.length || 0} tasks`);
      log(`Assignment Planned (Со сроками): ${data.assignment_planned?.length || 0} tasks`);
      log(`Assignment Finished (Завершенные): ${data.assignment_finished?.length || 0} tasks`);
      
      if (data.backlog_planner?.length > 0) {
        log('\nFirst backlog task sample:');
        const task = data.backlog_planner[0];
        log(`  ID: ${task.id}`);
        log(`  Name: ${task.name}`);
        log(`  Responsible: ${task.responsible_user_ids?.join(', ')}`);
        log(`  Finish Date: ${task.finish_date}`);
        log(`  Is Finished: ${task.is_finished}`);
      }
      
      if (data.assignment_unplanned?.length > 0) {
        log('\nFirst unplanned task sample:');
        const task = data.assignment_unplanned[0];
        log(`  ID: ${task.id}`);
        log(`  Name: ${task.name}`);
        log(`  Responsible: ${task.responsible_user_ids?.join(', ')}`);
        log(`  Finish Date: ${task.finish_date}`);
        log(`  Is Finished: ${task.is_finished}`);
      }
    }
  } catch (error: any) {
    log('Error:', error?.response?.data || error.message);
  }
}

async function testUserGetById() {
  log('\n=== Testing User Get By ID ===');
  
  // First get a user ID from the list
  try {
    const listResponse = await client.post('/user/api/profile/list', {});
    if (listResponse.data?.status === 'success' && listResponse.data?.data) {
      const data = listResponse.data.data;
      
      let firstUser;
      if (data.list && Array.isArray(data.list)) {
        firstUser = data.list[0];
      } else if (Array.isArray(data)) {
        firstUser = data[0];
      } else if (typeof data === 'object') {
        firstUser = Object.values(data)[0];
      }
      
      if (firstUser) {
        log('First user from list:', JSON.stringify(firstUser, null, 2));
        
        // Try to get this user by ID
        const userId = firstUser.user_id || firstUser.id;
        if (userId) {
          log(`\nTrying to get user by ID: ${userId}`);
          try {
            const userResponse = await client.post('/user/api/profile/get', { user_id: userId });
            log('Get by ID Status:', userResponse.data?.status);
            log('User data:', JSON.stringify(userResponse.data?.data, null, 2));
          } catch (error: any) {
            log('Error getting user by ID:', error?.response?.data || error.message);
          }
        }
      }
    }
  } catch (error: any) {
    log('Error:', error?.response?.data || error.message);
  }
}

async function main() {
  log('Testing Platrum API...');
  log('Base URL:', BASE_URL);
  
  await testUserListAPI();
  await testUserGetById();
  await testTaskListAPI();
  await testCalendarAPI();
  await testCalendarPanelTasks(); // NEW: Test the main endpoint we'll use
  
  log('\n=== Tests Complete ===');
  
  // Save output to file
  writeFileSync('test-output.txt', output.join('\n'), 'utf-8');
  console.log('\n✅ Output saved to test-output.txt');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

