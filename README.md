# Gmail Reply Bot

A Google Apps Script bot that reads incoming student/parent emails, uses the Anthropic Claude API to categorize them and draft context-aware replies, then creates Gmail drafts for teacher review. Runs 3x/day via time-based triggers.

## Prerequisites

- A Google account (personal — not a managed workspace account that blocks Apps Script)
- Anthropic API key
- A Google Doc "brain file" with your class info, policies, FAQs

## Setup (Browser Only — No Install Required)

Everything below happens in your web browser. No laptop software, no CLI tools, no Node.js needed. Works from any device — phone, tablet, a library computer, a friend's laptop, etc.

### 1. Create the Apps Script project

1. Go to [script.google.com](https://script.google.com) and sign in with your **personal** Google account
2. Click **New project**
3. Click "Untitled project" at the top-left and rename it to **Gmail Reply Bot**

### 2. Paste the manifest

1. In the left sidebar, click the gear icon (**Project Settings**)
2. Check **Show "appsscript.json" manifest file in editor**
3. Go back to the **Editor** (code icon in sidebar)
4. Click `appsscript.json` in the file list
5. Replace its entire contents with:

```json
{
  "timeZone": "America/New_York",
  "dependencies": {
    "enabledAdvancedServices": [
      {
        "userSymbol": "Drive",
        "version": "v2",
        "serviceId": "drive"
      }
    ]
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://mail.google.com/",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/documents.readonly",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/presentations.readonly",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.scriptapp"
  ]
}
```

### 3. Create the code files

The project needs 8 script files. For each one:
1. Click the **+** button next to "Files" → select **Script**
2. Name the file (without `.gs` — the editor adds it automatically)
3. Copy-paste the contents from the matching file in `src/` of this repo

Create them in this order:

| # | File to create | Copy from |
|---|----------------|-----------|
| 1 | `Config` | `src/Config.js` |
| 2 | `Utils` | `src/Utils.js` |
| 3 | `GmailHelper` | `src/GmailHelper.js` |
| 4 | `SheetHelper` | `src/SheetHelper.js` |
| 5 | `BrainLoader` | `src/BrainLoader.js` |
| 6 | `ClaudeAPI` | `src/ClaudeAPI.js` |
| 7 | `Setup` | `src/Setup.js` |
| 8 | `Main` | `src/Main.js` |

You can delete the default `Code.gs` file that came with the project (click the three-dot menu next to it → Remove file).

### 4. Configure your settings

1. Open `Setup.gs` in the editor
2. Find `setupScriptProperties()` near the top
3. Replace the placeholder values with your real ones:
   - `ANTHROPIC_API_KEY` — your Anthropic API key (from console.anthropic.com)
   - `BRAIN_DOC_ID` — the Google Doc ID from your brain file's URL (the long string between `/d/` and `/edit`)
   - `DRIVE_FOLDER_ID` — (optional) ID of a Drive folder with supplemental PDFs/Slides
   - `TEACHER_EMAIL` — your Gmail address
   - `SCHOOL_TIMEZONE` — your timezone (default: `America/New_York`)

### 5. Run setup

1. In the function dropdown at the top of the editor, select **runFullSetup**
2. Click **Run**
3. A dialog will ask you to authorize — click **Review permissions**, choose your account, and click **Allow**
4. Check the execution log at the bottom — it should show all steps completing successfully

### 6. Test

1. Send a test email to yourself from a different account (or forward an existing email)
2. Select **processEmails** from the function dropdown and click **Run**
3. Check your Gmail **Drafts** — you should see a generated reply
4. Check execution logs: **View → Execution log**

### 7. You're done

The bot now runs automatically 3 times a day (8 AM, 12 PM, 6 PM in your timezone). Your laptop can be off, asleep, or anywhere — the triggers run on Google's servers.

To stop the bot: **Project Settings → Triggers** → delete the triggers.

---

## Alternative: CLI Setup with clasp

If you prefer using a terminal and have Node.js installed, you can use [clasp](https://github.com/google/clasp) instead of copy-pasting.

### Prerequisites for clasp

- Node.js v16+
- clasp CLI: `npm install -g @google/clasp`
- Apps Script API enabled at https://script.google.com/home/usersettings

### Steps

```bash
clasp login
clasp create --title "Gmail Reply Bot" --type standalone --rootDir src
clasp push
clasp open
```

Then follow steps 4–6 from the browser setup above (configure settings, run setup, test).

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

## Common Commands (clasp users only)

```bash
clasp push              # Deploy code to Apps Script
clasp push --watch      # Auto-deploy on file changes
clasp open              # Open in browser editor
clasp logs --watch      # Stream execution logs
```

If you set up via the browser, you don't need any of these — just edit directly in the Apps Script editor and click Run.
