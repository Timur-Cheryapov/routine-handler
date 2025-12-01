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
  console.log('\n=== Testing User List API ===');
  try {
    const response = await client.post('/user/api/profile/list', {});
    console.log('Status:', response.data?.status);
    console.log('Response structure:', JSON.stringify(response.data, null, 2));
    
    if (response.data?.data) {
      const data = response.data.data;
      if (data.list && Array.isArray(data.list)) {
        console.log(`Found ${data.list.length} users in data.list`);
        console.log('First user sample:', JSON.stringify(data.list[0], null, 2));
      } else if (Array.isArray(data)) {
        console.log(`Found ${data.length} users in data (array)`);
        console.log('First user sample:', JSON.stringify(data[0], null, 2));
      } else {
        console.log('Data is object, keys:', Object.keys(data));
      }
    }
  } catch (error: any) {
    console.error('Error:', error?.response?.data || error.message);
  }
}

async function testTaskListAPI() {
  console.log('\n=== Testing Task List API ===');
  
  // Test 1: Get all tasks without filter
  console.log('\n--- Test 1: All tasks (no filter) ---');
  try {
    const response = await client.post('/tasks/api/task/list', {});
    console.log('Status:', response.data?.status);
    
    if (response.data?.data) {
      const data = response.data.data;
      if (data.list && Array.isArray(data.list)) {
        console.log(`Found ${data.list.length} tasks`);
        console.log('First task sample:', JSON.stringify(data.list[0], null, 2));
      } else if (Array.isArray(data)) {
        console.log(`Found ${data.length} tasks`);
        console.log('First task sample:', JSON.stringify(data[0], null, 2));
      }
    }
  } catch (error: any) {
    console.error('Error:', error?.response?.data || error.message);
  }

  // Test 2: Get with is_finished filter
  console.log('\n--- Test 2: With is_finished filter ---');
  try {
    const response = await client.post('/tasks/api/task/list', {
      filter: [['is_finished', '=', false]]
    });
    console.log('Status:', response.data?.status);
    
    if (response.data?.data) {
      const data = response.data.data;
      const tasks = data.list || data;
      if (Array.isArray(tasks)) {
        console.log(`Found ${tasks.length} unfinished tasks`);
      }
    }
  } catch (error: any) {
    console.error('Error:', error?.response?.data || error.message);
  }
}

async function testCalendarAPI() {
  console.log('\n=== Testing Calendar/Queue API ===');
  
  // Look for calendar or queue-related endpoints
  const endpoints = [
    '/tasks/api/calendar/list',
    '/tasks/api/queue/list',
    '/tasks/api/panel/list',
    '/tasks/api/board/list',
  ];

  for (const endpoint of endpoints) {
    console.log(`\n--- Testing ${endpoint} ---`);
    try {
      const response = await client.post(endpoint, {});
      console.log('Status:', response.data?.status);
      console.log('Response:', JSON.stringify(response.data, null, 2).substring(0, 500));
    } catch (error: any) {
      console.error('Error:', error?.response?.status, error?.response?.statusText);
    }
  }
}

async function testUserGetById() {
  console.log('\n=== Testing User Get By ID ===');
  
  // First get a user ID from the list
  try {
    const listResponse = await client.post('/user/api/profile/list', {});
    if (listResponse.data?.status === 'success' && listResponse.data?.data) {
      const data = listResponse.data.data;
      const users = data.list || data;
      
      if (Array.isArray(users) && users.length > 0) {
        const firstUser = users[0];
        console.log('First user from list:', JSON.stringify(firstUser, null, 2));
        
        // Try to get this user by ID
        const userId = firstUser.user_id || firstUser.id;
        if (userId) {
          console.log(`\nTrying to get user by ID: ${userId}`);
          try {
            const userResponse = await client.post('/user/api/user/get', { id: userId });
            console.log('Get by ID Status:', userResponse.data?.status);
            console.log('User data:', JSON.stringify(userResponse.data?.data, null, 2));
          } catch (error: any) {
            console.error('Error getting user by ID:', error?.response?.data || error.message);
          }
        }
      }
    }
  } catch (error: any) {
    console.error('Error:', error?.response?.data || error.message);
  }
}

async function main() {
  log('Testing Platrum API...');
  log('Base URL:', BASE_URL);
  
  await testUserListAPI();
  await testUserGetById();
  await testTaskListAPI();
  await testCalendarAPI();
  
  log('\n=== Tests Complete ===');
  
  // Save output to file
  writeFileSync('test-output.txt', output.join('\n'), 'utf-8');
  console.log('\n✅ Output saved to test-output.txt');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

