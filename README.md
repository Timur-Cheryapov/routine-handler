# Platrum Daily Task Report Agent

This project is an automated agent that fetches task data from Platrum, analyzes overdue tasks, and sends a motivational report to a Telegram group. It is designed to run automatically every working day via GitHub Actions.

## Features
- Fetches all active employees from Platrum.
- Fetches tasks for each employee.
- Identifies overdue tasks and tasks with no deadline.
- Uses GPT-4o-mini to generate motivating, personalized reports with statistics and encouragement.
- Sends the report to a specified Telegram chat (and topic/thread).

## Prerequisites
- Node.js (v18+)
- A Platrum account with API access.
- A Telegram Bot (create via @BotFather).
- An OpenAI API key with access to GPT-4o-mini.

## Local Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd routine-handler
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   Create a `.env` file in the root directory:
   ```env
   PLATRUM_HOST=your_company_subdomain  # e.g., 'abrands' for abrands.platrum.ru
   PLATRUM_API_KEY=your_platrum_api_key
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   TELEGRAM_CHAT_ID=your_chat_id        # e.g., -100xxxxxxx
   TELEGRAM_THREAD_ID=12345             # Optional: if sending to a specific topic
   OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx # Your OpenAI API key
   ```

4. **Test API connection (optional):**
   ```bash
   npm run test-api
   ```
   This will test the Platrum API endpoints and save the output to `test-output.txt`.

5. **Run the script:**
   ```bash
   npm start
   ```
   
   For a dry run (without sending to Telegram):
   ```bash
   DRY_RUN=true npm start
   ```

## GitHub Actions Setup

This project is configured to run automatically on GitHub.

### 1. Push code to GitHub
Push this repository to your GitHub account.

### 2. Configure Secrets
Go to your repository **Settings** > **Secrets and variables** > **Actions** and create the following **Repository secrets**:

| Name | Description |
|------|-------------|
| `PLATRUM_HOST` | Your Platrum subdomain (e.g. `abrands`). |
| `PLATRUM_API_KEY` | Your API Key from Platrum Profile settings. |
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather. |
| `TELEGRAM_CHAT_ID` | ID of the group chat (starts with `-100` for supergroups). |
| `TELEGRAM_THREAD_ID` | (Optional) ID of the topic thread if using topics. |
| `OPENAI_API_KEY` | Your OpenAI API key (starts with `sk-proj-` or `sk-`). |

### 3. Schedule
The workflow is defined in `.github/workflows/daily_report.yml`.
It is scheduled to run at **07:00 UTC** (10:00 Moscow Time) every Monday through Friday.

To change the schedule, edit the `cron` line in the workflow file:
```yaml
- cron: '0 7 * * 1-5'
```

### 4. Manual Trigger
You can manually trigger the report from the "Actions" tab in GitHub:
1. Go to **Actions**.
2. Select "Daily Task Report".
3. Click **Run workflow**.

## Project Structure
- `src/index.ts`: Main entry point.
- `src/platrum.ts`: Platrum API client.
- `src/report.ts`: Logic for generating the report text.
- `src/telegram.ts`: Telegram Bot client.
- `src/types.ts`: TypeScript interfaces.
- `src/config.ts`: Configuration management.
- `src/test-platrum-api.ts`: API testing utility.

## How It Works

The agent implements the workflow described in `prompt.txt`:

1. **Fetch Users**: Gets all active employees from Platrum (excluding disabled/deleted users)
2. **Fetch Tasks**: Retrieves all unfinished tasks with responsible users
3. **Analyze Tasks**: For each user, counts:
   - **Overdue tasks**: Tasks with `finish_date` in the past
   - **Tasks without deadline**: Tasks with no `finish_date` set
4. **Generate Report**: Uses GPT-4o-mini to create a personalized, motivational message with:
   - Friendly greeting and overall statistics
   - Celebrating top performers and achievements
   - Categorized employee list (Leaders, Excellent, Good, Needs Attention)
   - Constructive recommendations
   - Weekly goals (25% reduction target)
   - Supportive call to action
   - Falls back to basic formatting if AI is unavailable
5. **Send to Telegram**: Delivers the report to the specified chat/thread

## Troubleshooting
- **"No users found"**: Check your `PLATRUM_HOST` and `PLATRUM_API_KEY`. Ensure the API Key has permissions.
- **Telegram errors**: Ensure the bot is an administrator in the group and has permission to send messages. If using topics, ensure `TELEGRAM_THREAD_ID` is correct.
- **Timezone**: GitHub Actions run in UTC. Adjust the cron schedule if your target timezone changes (e.g. Daylight Savings).

