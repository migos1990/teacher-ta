# Gmail Reply Bot

A Google Apps Script bot that reads incoming student/parent emails, uses the Anthropic Claude API to categorize them and draft context-aware replies, then creates Gmail drafts for teacher review. Runs 3x/day via time-based triggers.

## Prerequisites

- Node.js v16+
- [clasp](https://github.com/google/clasp) CLI: `npm install -g @google/clasp`
- Google account with Apps Script API enabled
- Anthropic API key
- A Google Doc "brain file" with your class info, policies, FAQs

## Setup

### 1. One-time manual steps

1. Enable the Apps Script API at https://script.google.com/home/usersettings
2. Run `clasp login` and sign in with your Google account
3. (Optional) Create a Google Cloud project and enable Apps Script API + Drive API

### 2. Create the Apps Script project

```bash
cd gmail-reply-bot
clasp create --title "Gmail Reply Bot" --type standalone --rootDir src
```

This updates `.clasp.json` with your new script ID.

### 3. Push code

```bash
clasp push
```

### 4. Configure and run setup

1. Open the project: `clasp open`
2. In the Apps Script editor, open `Setup.js`
3. Edit `setupScriptProperties()` with your actual values:
   - `ANTHROPIC_API_KEY`: Your Anthropic API key
   - `BRAIN_DOC_ID`: Google Doc ID from the URL
   - `DRIVE_FOLDER_ID`: (Optional) Drive folder with supplemental materials
   - `TEACHER_EMAIL`: Your Gmail address
4. Select `runFullSetup` from the function dropdown and click Run
5. Authorize the OAuth scopes when prompted

### 5. Test

1. Send a test email to yourself
2. In the Apps Script editor, select `processEmails` and click Run
3. Check your Gmail Drafts for the generated reply
4. Check execution logs: View → Execution log

## Project Structure

```
src/
├── appsscript.json   # Manifest with scopes and settings
├── Config.js         # Constants and getConfig() helper
├── Main.js           # processEmails() entry point
├── GmailHelper.js    # Email search, drafts, labels
├── SheetHelper.js    # Student roster and exclusion list
├── BrainLoader.js    # Google Doc, PDF, Slides text extraction
├── ClaudeAPI.js      # Anthropic API calls with retry logic
├── Setup.js          # One-time setup: properties, labels, triggers, sheet
└── Utils.js          # Logging, time checks, formatting
```

## How It Works

1. Time-based triggers fire at 8 AM, 12 PM, and 6 PM
2. `processEmails()` searches for unprocessed inbox emails (last 24 hours)
3. For each email:
   - Checks the exclusion list
   - Looks up the sender in the student roster
   - Calls Claude to categorize (URGENT / ROUTINE / EXCLUDED)
   - Calls Claude to draft a context-aware reply
   - Creates a Gmail draft reply
   - Labels the thread with category + "Processed"
4. Teacher reviews drafts in Gmail and sends with edits

## Configuration

All secrets and IDs are stored in ScriptProperties (never hardcoded):

| Key | Description |
|-----|-------------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `BRAIN_DOC_ID` | Google Doc ID for the teacher's knowledge base |
| `DRIVE_FOLDER_ID` | (Optional) Drive folder with PDFs/Slides |
| `ROSTER_SHEET_ID` | Auto-created by setup |
| `TEACHER_EMAIL` | The Gmail account running the bot |
| `CLAUDE_MODEL` | Anthropic model to use |
| `SCHOOL_TIMEZONE` | Timezone for triggers and date formatting |

## Gmail Labels

| Label | Purpose |
|-------|---------|
| `AutoReply/Processed` | Email has been processed (won't be re-processed) |
| `AutoReply/Urgent` | Categorized as urgent |
| `AutoReply/Routine` | Categorized as routine |
| `AutoReply/Excluded` | Sender is on exclusion list or email is spam/marketing |
| `AutoReply/NeedsReview` | Couldn't be auto-categorized |

## Common Commands

```bash
clasp push              # Deploy code to Apps Script
clasp push --watch      # Auto-deploy on file changes
clasp open              # Open in browser editor
clasp logs --watch      # Stream execution logs
```
