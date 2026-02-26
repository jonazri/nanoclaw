---
name: add-google-home
description: Smart home control via Google Assistant. Control lights, thermostat, locks, and other devices. Create and manage Google Home automations.
---

# Add Google Home

Control smart home devices by sending text commands to Google Assistant via a Python gRPC daemon. The container agent uses a bash IPC wrapper to send commands; the host-side TypeScript manager handles daemon lifecycle.

## Architecture

```
Container agent → google-home bash wrapper → IPC task file
  → host src/ipc.ts → src/google-assistant.ts → Python daemon
  → Google Assistant gRPC → response → IPC response file → container
```

## Phase 1: Pre-flight

### Check if already applied

Read `.nanoclaw/state.yaml`. If `google-home` is in `applied_skills`, skip to Phase 5 (Verify).

### Check prerequisites

- Python 3.8+ installed: `python3 --version`
- pip available: `pip3 --version`

## Phase 2: Google Cloud Setup

Before applying code changes, set up Google Cloud credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com) and create or select a project
2. Enable the **Google Assistant API**:
   - Navigate to APIs & Services → Library
   - Search for "Google Assistant API"
   - Click Enable
3. Configure OAuth consent screen:
   - Go to APIs & Services → OAuth consent screen
   - Select "External" user type
   - Fill in required fields (app name, support email)
   - Add your Google account email as a test user
4. Create OAuth credentials:
   - Go to APIs & Services → Credentials
   - Click "Create Credentials" → "OAuth 2.0 Client ID"
   - Select **Desktop app** as application type (not Web — Desktop is required for the local daemon)
   - Download the JSON file and save it as `client_secret.json`

## Phase 3: Apply Code Changes

### Apply the skill

```bash
npx tsx scripts/apply-skill.ts .claude/skills/add-google-home
```

This adds:
- `src/google-assistant.ts` — TypeScript daemon manager
- `scripts/google-assistant-daemon.py` — Python gRPC daemon
- `scripts/google-assistant-setup.py` — OAuth device registration
- `container/skills/google-home/` — Agent-facing docs and bash wrapper

And modifies:
- `src/ipc.ts` — adds `google_assistant_command` handler
- `src/index.ts` — adds shutdown hook for daemon cleanup
- `src/container-runner.ts` — creates `responses/` IPC directory

### Install Python dependencies

```bash
pip3 install google-assistant-grpc google-auth google-auth-oauthlib
```

### Build

```bash
npm run build
```

## Phase 4: Device Registration

Run the setup script with your downloaded credentials:

```bash
python3 scripts/google-assistant-setup.py /path/to/client_secret.json
```

This will:
1. Open a browser for OAuth consent
2. Register a device model and instance with Google
3. Save credentials to `data/google-assistant/`

## Phase 5: Verify

### Test the daemon

Restart the service:

Linux:
```bash
systemctl --user restart nanoclaw
```

macOS:
```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

### Test from the container agent

Ask the agent to control a device:

```
google-home command "what time is it"
google-home status
```

### Customize device list

Edit `container/skills/google-home/SKILL.md` to list your actual devices. The agent uses this list to understand which devices are available and their names.

### Rebuild the container

```bash
./container/build.sh
```

## Phase 6: Troubleshooting

### Python dependency issues

If `google-assistant-grpc` fails to install, ensure you have `libffi-dev` and `libssl-dev`:

```bash
# Debian/Ubuntu
sudo apt install libffi-dev libssl-dev

# macOS
brew install libffi openssl
```

### OAuth credential expiry

If commands return auth errors, re-run the setup script:

```bash
python3 scripts/google-assistant-setup.py /path/to/client_secret.json
```

### Empty responses

Google Assistant sometimes returns empty text for compound commands like "turn on the lights and set brightness to 50". Split into separate commands:

```bash
google-home command "turn on the lights"
google-home command "set the lights to 50 percent"
```

### Device not found

Ensure the device name in your command matches the name shown in the Google Home app exactly (case-sensitive). Update the device list in `container/skills/google-home/SKILL.md`.

### Daemon fails to start

Check the logs for `voice-recognition-service` or `google-assistant` daemon errors:

```bash
tail -f logs/nanoclaw.log | grep -i "google.assistant\|daemon"
```

The daemon has a 120-second startup timeout and auto-restarts after 3 consecutive failures.
