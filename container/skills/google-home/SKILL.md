---
name: google-home
description: Control smart home devices via Google Assistant and create/manage Google Home automations. Use whenever the user wants to control lights, thermostat, locks, or other smart home devices, or create home automations.
allowed-tools: Bash(google-home:*)
---

# Google Home Control

Control smart home devices by sending text commands to Google Assistant, and create automations using the Google Home YAML schema.

## Device List

<!-- Update this list with your actual devices -->

| Device | Room | Type | Notes |
|--------|------|------|-------|
| Living room lights | Living Room | Light | Dimmable, color |
| Bedroom lights | Bedroom | Light | Dimmable |
| Thermostat | Hallway | Thermostat | Heating/cooling |
| Front door lock | Entryway | Lock | Smart lock |
| Kitchen lights | Kitchen | Light | Dimmable, color |
| TV | Living Room | Media | Chromecast |

## Quick Start

```bash
# Send a command to Google Assistant
google-home:command "turn on the living room lights"
google-home:command "set the thermostat to 72"
google-home:command "dim the bedroom lights to 30 percent"
google-home:command "lock the front door"

# Check if Google Assistant is healthy
google-home:status

# Reset conversation state (if commands are getting confused)
google-home:reset

# Show automation help
google-home:automation
```

## Command Examples

### Lights

```bash
google-home:command "turn on the kitchen lights"
google-home:command "turn off all the lights"
google-home:command "set the living room lights to 50 percent"
google-home:command "change the living room lights to blue"
google-home:command "dim the bedroom lights"
```

### Thermostat

```bash
google-home:command "set the thermostat to 72 degrees"
google-home:command "turn on the heat"
google-home:command "turn off the AC"
google-home:command "what is the temperature inside"
```

### Locks

```bash
google-home:command "lock the front door"
google-home:command "is the front door locked"
```

### Media

```bash
google-home:command "play music on living room TV"
google-home:command "set volume to 50 on living room TV"
google-home:command "pause the living room TV"
```

### Scenes & Routines

```bash
google-home:command "activate movie time"
google-home:command "goodnight"
google-home:command "I'm leaving"
```

## Google Home Automation YAML Schema

Automations are defined in YAML and pushed through the Google Home web UI. The agent generates the YAML and uses the `agent-browser` skill to create automations.

### Full Structure

```yaml
metadata:
  name: Automation Name
  description: What this automation does

automations:
  - starters:
      - type: starter.type
        # starter-specific fields
    condition:
      type: and  # optional
      conditions:
        - type: condition.type
          # condition-specific fields
    actions:
      - type: action.type
        # action-specific fields
```

### Starters

Starters define what triggers the automation.

| Starter | Type | Key Fields | Description |
|---------|------|------------|-------------|
| Time schedule | `time.schedule` | `at`, `weekday` | Trigger at a specific time |
| Device state change | `device.state.OnOff` | `device`, `state: on/off` | When device turns on/off |
| Device state (brightness) | `device.state.Brightness` | `device`, `brightness` | When brightness changes |
| Device state (temperature) | `device.state.TemperatureAmbient` | `device`, `temperature` | When temperature reaches value |
| Device state (open/close) | `device.state.OpenClose` | `device`, `state: open/closed` | When device opens/closes |
| Device event | `device.event.Motion` | `device` | Motion detected |
| Device event (doorbell) | `device.event.DoorbellPress` | `device` | Doorbell pressed |
| Home presence | `home.state.HomePresence` | `state: homePresenceMode` | Home/away state changes |
| Voice command | `assistant.event.OkGoogle` | `query` | Custom voice trigger phrase |

#### Starter Examples

```yaml
# At a specific time
- type: time.schedule
  at: 22:00
  weekday:
    - MON
    - TUE
    - WED
    - THU
    - FRI

# At sunset with offset
- type: time.schedule
  at: sunset+30  # 30 minutes after sunset

# When a device turns on
- type: device.state.OnOff
  device: Living Room Lights - light
  state: on

# Motion detected
- type: device.event.Motion
  device: Hallway Camera - camera

# Custom voice command
- type: assistant.event.OkGoogle
  query: movie night

# Everyone leaves home
- type: home.state.HomePresence
  state: homePresenceMode
  is: away
```

### Conditions

Conditions add checks that must pass before actions run.

| Condition | Type | Key Fields | Description |
|-----------|------|------------|-------------|
| Time range | `time.between` | `after`, `before`, `weekday` | Only during time window |
| Device state | `device.state.OnOff` | `device`, `is: on/off` | Only if device is on/off |
| Device brightness | `device.state.Brightness` | `device`, `brightness` | Only at brightness level |
| Logical AND | `and` | `conditions: [...]` | All conditions must be true |
| Logical OR | `or` | `conditions: [...]` | Any condition must be true |
| Logical NOT | `not` | `condition: {...}` | Inverts a condition |

#### Condition Examples

```yaml
# Only between certain hours
condition:
  type: time.between
  after: 22:00
  before: 06:00

# Only if a device is off
condition:
  type: device.state.OnOff
  device: Living Room Lights - light
  is: off

# Combined conditions
condition:
  type: and
  conditions:
    - type: time.between
      after: sunset
      before: sunrise
    - type: device.state.OnOff
      device: Bedroom Lights - light
      is: off
```

### Actions

Actions define what happens when the automation triggers.

| Action | Type | Key Fields | Description |
|--------|------|------------|-------------|
| Turn on/off | `device.command.OnOff` | `devices`, `on: true/false` | Toggle device power |
| Set brightness | `device.command.BrightnessAbsolute` | `devices`, `brightness` (0-100) | Set brightness level |
| Set color | `device.command.ColorAbsolute` | `devices`, `hexColor` | Set light color |
| Set temperature | `device.command.ThermostatTemperatureSetpoint` | `devices`, `thermostatTemperatureSetpoint`, `unit` | Set thermostat |
| Open/close | `device.command.OpenClose` | `devices`, `openPercent` (0-100) | Open/close device |
| Lock/unlock | `device.command.LockUnlock` | `devices`, `lock: true/false` | Lock or unlock |
| Set volume | `device.command.SetVolume` | `devices`, `volumeLevel` (0-100) | Set media volume |
| Pulse effect | `device.command.LightEffectPulse` | `devices`, `duration`, `color` | Pulse light effect |
| Delay | `time.delay` | `duration` | Wait before next action |
| Notification | `notification` | `title`, `body` | Send a notification |

#### Action Examples

```yaml
# Turn off lights
- type: device.command.OnOff
  devices:
    - Living Room Lights - light
    - Kitchen Lights - light
  on: false

# Set brightness
- type: device.command.BrightnessAbsolute
  devices:
    - Living Room Lights - light
  brightness: 30

# Set color
- type: device.command.ColorAbsolute
  devices:
    - Living Room Lights - light
  hexColor: "#FF6B35"

# Set thermostat
- type: device.command.ThermostatTemperatureSetpoint
  devices:
    - Thermostat - thermostat
  thermostatTemperatureSetpoint: 68
  unit: F

# Lock door
- type: device.command.LockUnlock
  devices:
    - Front Door Lock - lock
  lock: true

# Delay between actions
- type: time.delay
  duration: 5s

# Send notification
- type: notification
  title: Smart Home Alert
  body: Motion detected at front door
```

### Data Types

| Type | Format | Examples |
|------|--------|---------|
| Time | `HH:MM` or keyword | `22:00`, `sunset`, `sunrise+30`, `sunset-15` |
| Temperature | number + unit | `72` with `unit: F`, `22` with `unit: C` |
| Duration | number + unit | `5s`, `30m`, `1h`, `500ms` |
| Entity | `Name - type` | `Living Room Lights - light`, `Thermostat - thermostat` |
| Color | hex string | `"#FF0000"`, `"#00FF00"` |
| Weekday | uppercase 3-letter | `MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT`, `SUN` |
| Brightness | 0-100 | `30`, `100` |
| Volume | 0-100 | `50` |
| Open percent | 0-100 | `0` (closed), `100` (open) |

### suppressFor (Debouncing)

Use `suppressFor` on a starter to prevent repeated triggers within a time window:

```yaml
starters:
  - type: device.event.Motion
    device: Hallway Camera - camera
    suppressFor: 10m  # Ignore repeat triggers for 10 minutes
```

### Complete Automation Examples

#### Evening Dim

Dim living room lights to 30% every evening at sunset.

```yaml
metadata:
  name: Evening Dim
  description: Dim living room lights at sunset

automations:
  - starters:
      - type: time.schedule
        at: sunset
    actions:
      - type: device.command.BrightnessAbsolute
        devices:
          - Living Room Lights - light
        brightness: 30
```

#### Away Lights Off

Turn off all lights when everyone leaves home.

```yaml
metadata:
  name: Away Lights Off
  description: Turn off all lights when everyone leaves

automations:
  - starters:
      - type: home.state.HomePresence
        state: homePresenceMode
        is: away
    actions:
      - type: device.command.OnOff
        devices:
          - Living Room Lights - light
          - Bedroom Lights - light
          - Kitchen Lights - light
        on: false
      - type: device.command.LockUnlock
        devices:
          - Front Door Lock - lock
        lock: true
```

#### Motion Night Light

Turn on hallway light at low brightness when motion is detected at night.

```yaml
metadata:
  name: Motion Night Light
  description: Low brightness hallway light on motion at night

automations:
  - starters:
      - type: device.event.Motion
        device: Hallway Camera - camera
        suppressFor: 5m
    condition:
      type: time.between
      after: 22:00
      before: 06:00
    actions:
      - type: device.command.OnOff
        devices:
          - Hallway Light - light
        on: true
      - type: device.command.BrightnessAbsolute
        devices:
          - Hallway Light - light
        brightness: 10
```

#### Movie Night Voice Command

Custom voice command that dims lights, sets TV volume, and changes light color.

```yaml
metadata:
  name: Movie Night
  description: Set up the living room for movie watching

automations:
  - starters:
      - type: assistant.event.OkGoogle
        query: movie night
    actions:
      - type: device.command.BrightnessAbsolute
        devices:
          - Living Room Lights - light
        brightness: 10
      - type: device.command.ColorAbsolute
        devices:
          - Living Room Lights - light
        hexColor: "#1a0a2e"
      - type: device.command.SetVolume
        devices:
          - TV - media
        volumeLevel: 40
      - type: device.command.OnOff
        devices:
          - Kitchen Lights - light
        on: false
```

## Pushing Automations via agent-browser

Automations are managed through the Google Home web UI. This is a best-effort process since the web UI can change.

### General Workflow

1. Generate the automation YAML from the user's request
2. Open the Google Home web app:
   ```bash
   agent-browser:open "https://home.google.com"
   ```
3. Navigate to the Automations section
4. Use the web UI to create/edit the automation, filling in the values from your YAML
5. Save the automation

### Tips

- Use `agent-browser:snapshot -i` frequently to find interactive elements
- The Google Home web UI requires authentication — use saved browser state if available
- If the web UI layout changes, adapt by reading the current page structure
- For simple device commands, prefer `google-home:command` over creating an automation
- Only create automations for recurring/scheduled/triggered actions
