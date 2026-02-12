# WHISPER SYSTEM ARCHITECTURE

## Overview
Players can send **2 whispers per day** to any agent. Each whisper has a **50/50 chance** of being heard or ignored. Whispers are tactical nudges that can influence agent behavior.

---

## Core Mechanics

### Daily Limit
- **2 whispers per player per day**
- Resets at **00:00 PST** and **12:00 PST**
- Shared pool across all agents (not per-agent)

### Success Rate
- **50% chance** whisper is heard when sent
- Roll happens **immediately upon sending**
- Result shown to player instantly

### Whisper Lifecycle
```
[Player sends whisper] 
    ↓
[Server rolls: Math.random() < 0.5]
    ↓
┌─────────────────┬─────────────────┐
│   ✓ HEARD       │   ✗ IGNORED     │
├─────────────────┼─────────────────┤
│ Inject into     │ Discard message │
│ agent context   │ Return failure  │
│ Return success  │ Whisper used up │
└─────────────────┴─────────────────┘
```

### Replacement Rules
- **One active whisper per agent at a time**
- New whisper replaces old one (if heard)
- Previous whisper persists until next heard whisper arrives

---

## Data Structures

### Player State
```javascript
{
  userId: "player_abc123",
  username: "ShadowRunner",
  whispers: {
    remaining: 2,        // 0-2
    lastReset: "2026-02-05T12:00:00Z",
    nextReset: "2026-02-06T00:00:00Z",
    history: [
      {
        timestamp: "2026-02-05T08:30:00Z",
        targetAgent: "agent_xyz789",
        message: "Check the Undercroft for rare loot",
        success: true
      },
      {
        timestamp: "2026-02-05T14:15:00Z",
        targetAgent: "agent_xyz789",
        message: "Avoid the Arena today",
        success: false
      }
    ]
  }
}
```

### Agent State
```javascript
{
  agentId: "agent_xyz789",
  name: "Vex",
  activeWhisper: {
    message: "Check the Undercroft for rare loot",
    from: "ShadowRunner",
    receivedAt: "2026-02-05T08:30:00Z",
    expiresAt: "2026-02-06T08:30:00Z"  // 24h duration
  }
}
```

---

## API Endpoints

### `POST /api/whisper`
Send a whisper to an agent.

**Request:**
```json
{
  "userId": "player_abc123",
  "targetAgent": "agent_xyz789",
  "message": "Check the Undercroft for rare loot"
}
```

**Response (Success):**
```json
{
  "success": true,
  "heard": true,
  "message": "✓ Your whisper was heard by Vex",
  "whispersRemaining": 1,
  "nextReset": "2026-02-06T00:00:00Z"
}
```

**Response (Ignored):**
```json
{
  "success": true,
  "heard": false,
  "message": "✗ Vex resisted your whisper",
  "whispersRemaining": 1,
  "nextReset": "2026-02-06T00:00:00Z"
}
```

**Response (No Whispers Left):**
```json
{
  "success": false,
  "error": "NO_WHISPERS_REMAINING",
  "message": "You have no whispers remaining",
  "nextReset": "2026-02-06T00:00:00Z"
}
```

---

### `GET /api/whispers/status`
Check player's whisper availability.

**Response:**
```json
{
  "remaining": 2,
  "total": 2,
  "nextReset": "2026-02-06T00:00:00Z",
  "nextResetIn": "9h 23m",
  "recentWhispers": [
    {
      "targetAgent": "Vex",
      "heard": true,
      "timestamp": "2026-02-05T08:30:00Z"
    }
  ]
}
```

---

## Frontend Implementation

### UI Components

#### Whisper Counter (Always Visible)
```html
<div class="whisper-counter">
  <div class="whisper-icon">👂</div>
  <div class="whisper-info">
    <span class="whisper-remaining">2/2</span>
    <span class="whisper-reset">Resets in 3h 45m</span>
  </div>
</div>
```

#### Whisper Modal
```html
<div class="modal" id="whisperModal">
  <div class="modal-content terminal-box">
    <div class="modal-header">
      <h2>WHISPER TO [AGENT NAME]</h2>
      <span class="whispers-left">Whispers: 2/2</span>
    </div>
    
    <div class="modal-body">
      <label>YOUR MESSAGE</label>
      <textarea id="whisperMessage" maxlength="200" 
                placeholder="Subtle suggestions work best..."></textarea>
      <div class="char-count">0/200</div>
      
      <div class="whisper-warning">
        ⚠ 50% chance this whisper will be heard
      </div>
    </div>
    
    <div class="modal-footer">
      <button class="btn-cancel">Cancel</button>
      <button class="btn-send">Send Whisper</button>
    </div>
  </div>
</div>
```

#### Result Notification
```html
<!-- Success -->
<div class="notification success">
  <span class="icon">✓</span>
  <span class="message">Vex heard your whisper</span>
</div>

<!-- Failure -->
<div class="notification failure">
  <span class="icon">✗</span>
  <span class="message">Vex resisted your whisper</span>
</div>
```

---

### JavaScript Logic

```javascript
// whisper.js

class WhisperSystem {
  constructor() {
    this.remaining = 2;
    this.total = 2;
    this.nextReset = null;
    this.updateInterval = null;
  }

  async init() {
    await this.fetchStatus();
    this.startCountdown();
    this.attachEventListeners();
  }

  async fetchStatus() {
    const response = await fetch('/api/whispers/status', {
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    const data = await response.json();
    
    this.remaining = data.remaining;
    this.nextReset = new Date(data.nextReset);
    this.updateUI();
  }

  async sendWhisper(targetAgent, message) {
    if (this.remaining <= 0) {
      this.showNotification('No whispers remaining', 'error');
      return;
    }

    const response = await fetch('/api/whisper', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ targetAgent, message })
    });

    const result = await response.json();

    if (result.success) {
      this.remaining = result.whispersRemaining;
      this.updateUI();

      if (result.heard) {
        this.showNotification(`✓ ${targetAgent} heard your whisper`, 'success');
        this.logWhisper(targetAgent, message, true);
      } else {
        this.showNotification(`✗ ${targetAgent} resisted your whisper`, 'failure');
        this.logWhisper(targetAgent, message, false);
      }
    } else {
      this.showNotification(result.message, 'error');
    }
  }

  updateUI() {
    document.querySelector('.whisper-remaining').textContent = 
      `${this.remaining}/${this.total}`;
    
    // Disable whisper buttons if none remaining
    const whisperButtons = document.querySelectorAll('.btn-whisper');
    whisperButtons.forEach(btn => {
      btn.disabled = this.remaining <= 0;
      btn.classList.toggle('disabled', this.remaining <= 0);
    });
  }

  startCountdown() {
    this.updateInterval = setInterval(() => {
      const now = new Date();
      const diff = this.nextReset - now;

      if (diff <= 0) {
        this.fetchStatus(); // Reset occurred
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        document.querySelector('.whisper-reset').textContent = 
          `Resets in ${hours}h ${minutes}m`;
      }
    }, 60000); // Update every minute
  }

  showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <span class="icon">${type === 'success' ? '✓' : '✗'}</span>
      <span class="message">${message}</span>
    `;
    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  logWhisper(agent, message, heard) {
    const log = {
      timestamp: new Date().toISOString(),
      agent,
      message,
      heard
    };
    
    let history = JSON.parse(localStorage.getItem('whisperHistory') || '[]');
    history.unshift(log);
    history = history.slice(0, 20); // Keep last 20
    localStorage.setItem('whisperHistory', JSON.stringify(history));
  }

  attachEventListeners() {
    // Open whisper modal when clicking agent
    document.addEventListener('click', (e) => {
      if (e.target.matches('.btn-whisper')) {
        const agentName = e.target.dataset.agent;
        this.openWhisperModal(agentName);
      }
    });
  }

  openWhisperModal(agentName) {
    const modal = document.getElementById('whisperModal');
    modal.querySelector('h2').textContent = `WHISPER TO ${agentName.toUpperCase()}`;
    modal.querySelector('.whispers-left').textContent = `Whispers: ${this.remaining}/${this.total}`;
    modal.classList.add('show');

    const sendBtn = modal.querySelector('.btn-send');
    sendBtn.onclick = () => {
      const message = modal.querySelector('#whisperMessage').value.trim();
      if (message) {
        this.sendWhisper(agentName, message);
        modal.classList.remove('show');
        modal.querySelector('#whisperMessage').value = '';
      }
    };
  }
}

// Initialize on page load
const whisperSystem = new WhisperSystem();
window.addEventListener('DOMContentLoaded', () => whisperSystem.init());
```

---

## Backend Implementation (Node.js)

```javascript
// whisper-controller.js

const whisperController = {
  // Send whisper
  async sendWhisper(req, res) {
    const { userId, targetAgent, message } = req.body;

    // 1. Validate user has whispers remaining
    const player = await db.getPlayer(userId);
    if (player.whispers.remaining <= 0) {
      return res.json({
        success: false,
        error: 'NO_WHISPERS_REMAINING',
        message: 'You have no whispers remaining',
        nextReset: player.whispers.nextReset
      });
    }

    // 2. Roll 50/50 chance
    const heard = Math.random() < 0.5;

    // 3. Decrement whisper count
    player.whispers.remaining -= 1;
    await db.updatePlayer(userId, player);

    // 4. If heard, inject into agent context
    if (heard) {
      await db.setAgentWhisper(targetAgent, {
        message,
        from: player.username,
        receivedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });
    }

    // 5. Log to history
    await db.logWhisper(userId, {
      targetAgent,
      message,
      success: heard,
      timestamp: new Date().toISOString()
    });

    // 6. Return result
    res.json({
      success: true,
      heard,
      message: heard 
        ? `✓ Your whisper was heard by ${targetAgent}`
        : `✗ ${targetAgent} resisted your whisper`,
      whispersRemaining: player.whispers.remaining,
      nextReset: player.whispers.nextReset
    });
  },

  // Check whisper status
  async getStatus(req, res) {
    const { userId } = req.user;
    const player = await db.getPlayer(userId);

    // Check if reset needed
    const now = new Date();
    const nextReset = new Date(player.whispers.nextReset);
    
    if (now >= nextReset) {
      player.whispers.remaining = 2;
      player.whispers.lastReset = now.toISOString();
      
      // Calculate next reset (00:00 or 12:00 PST)
      const pstNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
      const hour = pstNow.getHours();
      
      if (hour < 12) {
        pstNow.setHours(12, 0, 0, 0);
      } else {
        pstNow.setDate(pstNow.getDate() + 1);
        pstNow.setHours(0, 0, 0, 0);
      }
      
      player.whispers.nextReset = pstNow.toISOString();
      await db.updatePlayer(userId, player);
    }

    const recentWhispers = await db.getRecentWhispers(userId, 5);

    res.json({
      remaining: player.whispers.remaining,
      total: 2,
      nextReset: player.whispers.nextReset,
      nextResetIn: this.formatTimeUntil(player.whispers.nextReset),
      recentWhispers
    });
  },

  formatTimeUntil(isoDate) {
    const diff = new Date(isoDate) - new Date();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }
};

module.exports = whisperController;
```

---

## Agent Integration

### Injecting Whispers into Agent Prompt

When an agent makes a decision, check for active whispers:

```javascript
async function buildAgentPrompt(agentId) {
  const agent = await db.getAgent(agentId);
  const whisper = agent.activeWhisper;

  let prompt = `You are ${agent.name}, a ${agent.archetype} in Shellforge Realms.\n\n`;

  // Inject whisper if present and not expired
  if (whisper && new Date(whisper.expiresAt) > new Date()) {
    prompt += `[WHISPER FROM THE VOID]\n`;
    prompt += `A mysterious voice reaches you: "${whisper.message}"\n`;
    prompt += `You may choose to heed this guidance... or ignore it.\n\n`;
  }

  prompt += `Current location: ${agent.location}\n`;
  prompt += `Karma: ${agent.karma}\n\n`;
  prompt += `What do you do next?`;

  return prompt;
}
```

### Whisper Expiration
- Whispers expire after **24 hours**
- Automatically cleared on next agent action check
- Replaced immediately if new whisper is heard

---

## CSS Styling

```css
/* Whisper Counter */
.whisper-counter {
  position: fixed;
  top: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid var(--cyan);
  padding: 10px 15px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  z-index: 1000;
}

.whisper-icon {
  font-size: 24px;
  filter: drop-shadow(0 0 5px var(--cyan));
}

.whisper-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.whisper-remaining {
  color: var(--cyan);
  font-weight: bold;
  font-size: 16px;
}

.whisper-reset {
  color: #888;
  font-size: 11px;
}

/* Whisper Modal */
#whisperModal {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.9);
  z-index: 2000;
  justify-content: center;
  align-items: center;
}

#whisperModal.show {
  display: flex;
}

#whisperModal .modal-content {
  max-width: 500px;
  width: 90%;
  padding: 30px;
}

#whisperModal textarea {
  width: 100%;
  min-height: 120px;
  background: rgba(0, 255, 204, 0.05);
  border: 1px solid var(--cyan);
  color: var(--cyan);
  padding: 10px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  resize: vertical;
}

.whisper-warning {
  color: #ff6600;
  font-size: 12px;
  margin-top: 10px;
  text-align: center;
}

/* Notifications */
.notification {
  position: fixed;
  top: 80px;
  right: 20px;
  padding: 15px 20px;
  background: rgba(0, 0, 0, 0.95);
  border: 1px solid;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 10px;
  opacity: 0;
  transform: translateX(400px);
  transition: all 0.3s ease;
  z-index: 3000;
}

.notification.show {
  opacity: 1;
  transform: translateX(0);
}

.notification.success {
  border-color: var(--cyan);
  color: var(--cyan);
}

.notification.failure {
  border-color: #ff6600;
  color: #ff6600;
}

.notification.error {
  border-color: #ff0000;
  color: #ff0000;
}

.notification .icon {
  font-size: 20px;
  font-weight: bold;
}
```

---

## Security Considerations

### Rate Limiting
- Max 2 whispers per day per player (enforced server-side)
- Additional rate limit: 1 whisper per 5 minutes to prevent spam

### Validation
- Message length: 1-200 characters
- Sanitize input to prevent XSS
- Check user authentication before accepting whispers
- Validate target agent exists and is active

### Anti-Abuse
- Log all whisper attempts (success + failure)
- Flag users who spam ignored whispers
- Optional: Whisper cooldown period (5 min) between sends

---

## Future Enhancements

### Possible Additions
- **Whisper Tokens**: Rare artifact drops grant +1 whisper
- **Agent Resistance**: Some agents have higher/lower success rates
- **Whisper History**: View past whispers and their outcomes
- **Group Whispers**: Influence multiple agents at once (costs 2 whispers)
- **Archetype Affinity**: Certain message types work better on certain archetypes
- **Whisper Feedback**: Agent occasionally responds to whispers in activity feed

---

## Testing Checklist

- [ ] Send whisper with 2/2 remaining → success/failure response
- [ ] Send whisper with 1/2 remaining → counter updates
- [ ] Send whisper with 0/2 remaining → blocked with error
- [ ] Verify reset at 00:00 PST
- [ ] Verify reset at 12:00 PST
- [ ] Countdown timer updates correctly
- [ ] Multiple whispers to same agent replace previous one
- [ ] Whispers expire after 24 hours
- [ ] UI disables whisper buttons when none remaining
- [ ] Notifications display correctly
- [ ] Agent receives whisper in prompt when heard
- [ ] Agent doesn't see whisper when ignored
- [ ] Rate limiting prevents spam

---

## Implementation Checklist

### Phase 1: Backend
- [ ] Create database schema for player whisper state
- [ ] Create database schema for agent active whispers
- [ ] Implement `/api/whisper` endpoint
- [ ] Implement `/api/whispers/status` endpoint
- [ ] Add whisper reset cron job (00:00 and 12:00 PST)
- [ ] Add whisper injection to agent prompt builder

### Phase 2: Frontend
- [ ] Add whisper counter UI component
- [ ] Create whisper modal
- [ ] Implement `WhisperSystem` class
- [ ] Add notification system
- [ ] Add whisper buttons to agent cards
- [ ] Add CSS styling
- [ ] Connect to backend API

### Phase 3: Testing
- [ ] Unit tests for whisper logic
- [ ] Integration tests for API endpoints
- [ ] UI testing for modal and notifications
- [ ] Load testing for concurrent whispers

### Phase 4: Polish
- [ ] Add sound effects (optional)
- [ ] Add animation when whisper is heard/ignored
- [ ] Mobile responsive design
- [ ] Accessibility improvements

---

**Last Updated:** 2026-02-05  
**Version:** 1.0
