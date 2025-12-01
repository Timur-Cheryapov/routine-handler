import { PlatrumService } from './platrum.js';
import { ReportGenerator } from './report.js';
import { TelegramService } from './telegram.js';
import { StatsManager } from './stats.js';
import { config } from './config.js';

async function main() {
  console.log('Starting Daily Task Report Agent...');

  const platrum = new PlatrumService();
  const telegram = new TelegramService();
  const generator = new ReportGenerator();
  const statsManager = new StatsManager();

  // 1. Fetch Tasks first
  console.log('Fetching tasks...');
  const tasks = await platrum.getTasks();
  console.log(`Found ${tasks.length} active tasks.`);

  if (tasks.length === 0) {
    console.log('No active tasks found.');
    return;
  }

  // 2. Fetch Users
  console.log('Fetching users...');
  let users = await platrum.getUsers();
  const excludedUsers = new Set<string>(config.platrum.usersNotToTrack);
  let reportUsers = users.filter(user => !excludedUsers.has(user.user_id));
  
  if (users.length === 0) {
    console.log('User List API unavailable. Extracting users from tasks and resolving names...');
    // Await the async extraction which now fetches details
    users = await platrum.extractUsersFromTasks(tasks);
    reportUsers = users.filter(user => !excludedUsers.has(user.user_id));
  }
  
  console.log(`Found ${users.length} unique users (${reportUsers.length} tracked).`);

  if (reportUsers.length === 0) {
    console.log('No users found. Exiting.');
    return;
  }

  // 3. Load previous stats for comparison
  console.log('Loading previous stats...');
  const previousStats = await statsManager.loadPreviousStats();

  // 4. Generate Report
  console.log('Generating report...');
  const stats = await generator.generateReportWithStats(reportUsers, tasks, previousStats);
  const report = stats.report;

  // 5. Save current stats for next time
  console.log('Saving current stats...');
  await statsManager.saveStats(stats.employeeStats);

  // 6. Send to Telegram
  console.log('Sending report to Telegram...');
  
  if (process.env.DRY_RUN) {
    console.log('DRY RUN MODE. Report content:');
    console.log('---');
    console.log(report);
    console.log('---');
  } else {
    await telegram.sendReport(report);
  }

  console.log('Done.');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
