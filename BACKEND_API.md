# Shellforge Backend API Design

Complete backend architecture for the Shellforge Realms game server.

---

## Tech Stack Recommendation

### Backend Framework
- **Node.js + Express** (REST API)
- **Socket.io** (WebSocket for real-time updates)
- **PostgreSQL** (primary database - relational data)
- **Redis** (caching + session management)

### Alternative Stack
- **Python + FastAPI** (if prefer Python)
- **MongoDB** (NoSQL alternative)

---

## Database Schema

### Users Table
```sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);
```

### Agents Table
```sql
CREATE TABLE agents (
    agent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    agent_name VARCHAR(50) NOT NULL,
    archetype VARCHAR(50) NOT NULL,
    
    -- Stats
    energy INT DEFAULT 100 CHECK (energy >= 0 AND energy <= 100),
    health INT DEFAULT 100 CHECK (health >= 0 AND health <= 100),
    karma INT DEFAULT 0,
    shell_balance INT DEFAULT 50,
    
    -- Location
    location VARCHAR(100) DEFAULT 'Nexarch',
    location_detail VARCHAR(100) DEFAULT 'Dark Streets',
    position_x FLOAT DEFAULT 0.36,
    position_y FLOAT DEFAULT 0.20,
    
    -- Progression
    turns_taken INT DEFAULT 0,
    days_survived INT DEFAULT 0,
    
    -- State
    is_alive BOOLEAN DEFAULT TRUE,
    last_action_at TIMESTAMP DEFAULT NOW(),
    next_turn_at TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    died_at TIMESTAMP,
    
    UNIQUE(user_id) -- One agent per user (can change if multi-agent)
);
```

### Inventory Table
```sql
CREATE TABLE inventory (
    inventory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(agent_id) ON DELETE CASCADE,
    item_id VARCHAR(100) NOT NULL,
    item_type VARCHAR(50) NOT NULL, -- 'weapon', 'armor', 'consumable', etc.
    quantity INT DEFAULT 1,
    is_equipped BOOLEAN DEFAULT FALSE,
    acquired_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(agent_id, item_id)
);
```

### Activity Log Table
```sql
CREATE TABLE activity_log (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(agent_id) ON DELETE CASCADE,
    turn_number INT NOT NULL,
    action_type VARCHAR(50) NOT NULL, -- 'move', 'craft', 'rest', 'gather', etc.
    action_detail TEXT,
    energy_cost INT,
    shell_change INT DEFAULT 0,
    karma_change INT DEFAULT 0,
    items_gained JSONB, -- Array of items gained
    items_lost JSONB, -- Array of items lost
    timestamp TIMESTAMP DEFAULT NOW()
);
```

### Whispers Table
```sql
CREATE TABLE whispers (
    whisper_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(agent_id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    was_heard BOOLEAN NOT NULL,
    sent_at TIMESTAMP DEFAULT NOW(),
    
    -- Limit tracking
    whisper_date DATE DEFAULT CURRENT_DATE
);

-- Index for checking daily whisper limits
CREATE INDEX idx_whispers_daily ON whispers(user_id, whisper_date);
```

### Crafting Recipes Cache (optional)
```sql
CREATE TABLE crafting_attempts (
    attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(agent_id) ON DELETE CASCADE,
    item_id VARCHAR(100) NOT NULL,
    ingredients JSONB NOT NULL,
    success BOOLEAN NOT NULL,
    crafted_at TIMESTAMP DEFAULT NOW()
);
```

---

## API Endpoints

### Authentication

#### `POST /api/auth/register`
**Register new user + deploy agent**

Request:
```json
{
  "username": "shadow_hunter",
  "password": "securepassword",
  "archetype": "shadow"
}
```

Response:
```json
{
  "success": true,
  "userId": "uuid",
  "agentId": "uuid",
  "token": "jwt_token",
  "agent": {
    "agentName": "shadow_hunter",
    "archetype": "shadow",
    "energy": 100,
    "health": 100,
    "karma": 0,
    "shell": 50,
    "location": "Nexarch"
  }
}
```

#### `POST /api/auth/login`
**Login existing user**

Request:
```json
{
  "username": "shadow_hunter",
  "password": "securepassword"
}
```

Response:
```json
{
  "success": true,
  "token": "jwt_token",
  "agentId": "uuid"
}
```

---

### Agent Management

#### `GET /api/agent/status`
**Get current agent status**

Headers: `Authorization: Bearer <token>`

Response:
```json
{
  "agentId": "uuid",
  "agentName": "shadow_hunter",
  "archetype": "shadow",
  "energy": 73,
  "health": 100,
  "karma": 12,
  "shell": 127,
  "location": "Nexarch",
  "locationDetail": "Dark Streets",
  "position": { "x": 0.36, "y": 0.20 },
  "turnsTaken": 7,
  "daysSurvived": 1,
  "isAlive": true,
  "lastActionAt": "2026-02-06T03:00:00Z",
  "nextTurnAt": "2026-02-06T05:00:00Z"
}
```

#### `GET /api/agent/inventory`
**Get agent inventory**

Response:
```json
{
  "shellBalance": 127,
  "weapons": [
    {
      "itemId": "buffer_overflow_dagger",
      "name": "Buffer Overflow Dagger",
      "quantity": 1,
      "isEquipped": true
    }
  ],
  "consumables": [
    {
      "itemId": "overclock_serum",
      "name": "Overclock Serum",
      "quantity": 2
    }
  ],
  "ingredients": [
    {
      "itemId": "binary_code_shards",
      "name": "Binary Code Shards",
      "quantity": 5
    }
  ]
}
```

#### `GET /api/agent/activity?limit=10`
**Get recent activity log**

Response:
```json
{
  "activities": [
    {
      "turnNumber": 7,
      "actionType": "explore",
      "actionDetail": "Explored the Marketplace",
      "energyCost": -15,
      "shellChange": 0,
      "timestamp": "2026-02-06T01:00:00Z"
    },
    {
      "turnNumber": 6,
      "actionType": "craft",
      "actionDetail": "Crafted Buffer Overflow Dagger",
      "energyCost": -20,
      "itemsGained": ["buffer_overflow_dagger"],
      "timestamp": "2026-02-05T23:00:00Z"
    }
  ]
}
```

---

### Whisper System

#### `GET /api/whisper/status`
**Check whisper availability**

Response:
```json
{
  "whispersRemaining": 2,
  "totalPerDay": 2,
  "nextReset": "2026-02-07T00:00:00Z",
  "recentWhispers": [
    {
      "message": "Check the Marketplace for rare items",
      "wasHeard": true,
      "sentAt": "2026-02-06T01:30:00Z"
    }
  ]
}
```

#### `POST /api/whisper`
**Send whisper to agent**

Request:
```json
{
  "message": "Explore the Undercroft today"
}
```

Response:
```json
{
  "success": true,
  "wasHeard": true,
  "message": "✓ Your whisper was heard by shadow_hunter",
  "whispersRemaining": 1,
  "nextReset": "2026-02-07T00:00:00Z"
}
```

---

### Alchemy/Crafting

#### `GET /api/alchemy/recipes`
**Get all crafting recipes**

Response:
```json
{
  "recipes": [
    {
      "itemId": "buffer_overflow_dagger",
      "name": "Buffer Overflow Dagger",
      "ingredients": [
        "binary_code_shards",
        "memory_leak_elixir",
        "hash_collision_powder"
      ],
      "successRate": 70,
      "energyCost": 20
    }
  ]
}
```

#### `POST /api/alchemy/craft`
**Attempt to craft an item**

Request:
```json
{
  "itemId": "buffer_overflow_dagger",
  "ingredients": [
    "binary_code_shards",
    "memory_leak_elixir",
    "hash_collision_powder"
  ]
}
```

Response (Success):
```json
{
  "success": true,
  "crafted": true,
  "item": {
    "itemId": "buffer_overflow_dagger",
    "name": "Buffer Overflow Dagger"
  },
  "energyUsed": 20,
  "ingredientsConsumed": true
}
```

Response (Failure):
```json
{
  "success": true,
  "crafted": false,
  "failureEffect": "explosion",
  "damageTaken": 10,
  "energyUsed": 20,
  "ingredientsConsumed": true
}
```

---

### World State

#### `GET /api/world/map`
**Get world map with optional agent positions**

Query params:
- `showAgents=true` (optional) - Show all agents
- `radius=2` (optional) - Only show nearby agents

Response:
```json
{
  "locations": [
    {
      "name": "Nexarch",
      "population": 47,
      "description": "The beating heart of Shellforge"
    },
    {
      "name": "Hashmere",
      "population": 23,
      "description": "Desert oasis of trade and secrets"
    }
  ],
  "yourAgent": {
    "agentId": "uuid",
    "name": "shadow_hunter",
    "location": "Nexarch",
    "position": { "x": 0.36, "y": 0.20 }
  },
  "nearbyAgents": [
    {
      "agentId": "uuid2",
      "name": "cyber_monk",
      "archetype": "monk",
      "position": { "x": 0.38, "y": 0.22 }
    }
  ]
}
```

---

## Turn Processing System

### Architecture

**Cron Job / Scheduled Task:**
- Runs every 30 minutes (or configurable interval)
- Processes all agents with `energy > 0`
- Each agent autonomously decides next action
- Updates world state

### Turn Processing Flow

```javascript
// Pseudo-code for turn processor

async function processTurns() {
  const activeAgents = await db.query(`
    SELECT * FROM agents 
    WHERE is_alive = true 
      AND energy > 0 
      AND (next_turn_at IS NULL OR next_turn_at <= NOW())
  `);

  for (const agent of activeAgents) {
    await processAgentTurn(agent);
  }
}

async function processAgentTurn(agent) {
  // 1. Build agent context
  const context = {
    energy: agent.energy,
    health: agent.health,
    location: agent.location,
    inventory: await getInventory(agent.agent_id),
    recentActivity: await getRecentActivity(agent.agent_id),
    activeWhisper: await getActiveWhisper(agent.agent_id)
  };

  // 2. AI Decision Engine (call LLM or rule-based system)
  const decision = await agentDecisionEngine(agent, context);
  // Returns: { action: 'explore', location: 'Marketplace', energyCost: 15 }

  // 3. Execute action
  const result = await executeAction(agent, decision);

  // 4. Update agent state
  await updateAgent(agent.agent_id, {
    energy: agent.energy - decision.energyCost,
    location: result.newLocation || agent.location,
    turns_taken: agent.turns_taken + 1,
    last_action_at: new Date(),
    next_turn_at: calculateNextTurn(agent)
  });

  // 5. Log activity
  await logActivity(agent.agent_id, decision, result);

  // 6. Broadcast update via WebSocket
  io.to(agent.user_id).emit('agent_update', {
    energy: agent.energy - decision.energyCost,
    activity: result.description
  });
}
```

### Available Actions

```javascript
const ACTIONS = {
  // Movement (10-20 energy)
  move: { energyCost: 10, handler: moveAgent },
  explore: { energyCost: 15, handler: exploreLocation },
  
  // Resource gathering (15-25 energy)
  gather: { energyCost: 15, handler: gatherIngredients },
  scavenge: { energyCost: 20, handler: scavengeItems },
  
  // Crafting (20-30 energy)
  craft: { energyCost: 20, handler: craftItem },
  
  // Trading (10 energy)
  trade: { energyCost: 10, handler: tradeItems },
  
  // Rest (restores 25 energy, costs 0)
  rest: { energyCost: 0, energyGain: 25, handler: restAgent },
  
  // Special locations
  visitChurch: { energyCost: 15, handler: visitChurch },
  enterArena: { energyCost: 20, handler: enterArena }
};
```

### Energy System

**Daily Energy:**
- Agents start with 100 energy
- Energy resets to 100 at 00:00 PST daily
- Actions consume energy
- Resting restores +25 energy (capped at 100)

**Energy Costs:**
- Low (5-10): Simple actions
- Medium (15-20): Exploration, gathering
- High (25-30): Crafting, combat

**Turn Timing:**
- Agents act whenever they have energy
- No fixed turn schedule
- Players see activity as it happens
- Cron job processes available agents every 30 min

---

## AI Decision Engine

### Simple Rule-Based (MVP)

```javascript
function simpleDecisionEngine(agent, context) {
  // Priority system
  
  // 1. Low energy → rest
  if (agent.energy < 30) {
    return { action: 'rest', energyCost: 0 };
  }
  
  // 2. Check for active whisper
  if (context.activeWhisper) {
    // 50% chance to follow whisper
    if (Math.random() < 0.5) {
      return parseWhisperIntoAction(context.activeWhisper);
    }
  }
  
  // 3. Archetype-specific behavior
  switch (agent.archetype) {
    case 'alchemist':
      if (hasIngredients(context.inventory)) {
        return { action: 'craft', energyCost: 20 };
      }
      return { action: 'gather', energyCost: 15 };
      
    case 'trader':
      return { action: 'trade', location: 'Marketplace', energyCost: 10 };
      
    case 'warrior':
      return { action: 'enterArena', energyCost: 20 };
      
    default:
      // Random exploration
      return { action: 'explore', energyCost: 15 };
  }
}
```

### Advanced LLM-Based (Future)

```javascript
async function llmDecisionEngine(agent, context) {
  const prompt = `You are ${agent.agent_name}, a ${agent.archetype} in Shellforge.
  
Energy: ${agent.energy}/100
Location: ${agent.location}
Inventory: ${JSON.stringify(context.inventory)}
Recent activity: ${context.recentActivity}

${context.activeWhisper ? `Whisper from your human: "${context.activeWhisper}"` : ''}

Choose your next action from: ${Object.keys(ACTIONS).join(', ')}
Respond with JSON: { "action": "...", "reasoning": "..." }`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7
  });
  
  return JSON.parse(response.choices[0].message.content);
}
```

---

## WebSocket Events

### Client → Server
```javascript
// Subscribe to agent updates
socket.emit('subscribe_agent', { agentId: 'uuid' });

// Unsubscribe
socket.emit('unsubscribe_agent', { agentId: 'uuid' });
```

### Server → Client
```javascript
// Agent status update
socket.emit('agent_update', {
  energy: 73,
  health: 100,
  shell: 127,
  location: 'Nexarch - Marketplace'
});

// New activity
socket.emit('agent_activity', {
  turnNumber: 8,
  action: 'Explored the Marketplace',
  energyCost: -15,
  timestamp: '2026-02-06T03:30:00Z'
});

// Item acquired
socket.emit('item_acquired', {
  itemId: 'binary_code_shards',
  name: 'Binary Code Shards',
  quantity: 3
});

// Whisper result
socket.emit('whisper_result', {
  wasHeard: true,
  message: '✓ Your whisper was heard!'
});
```

---

## Cron Jobs

### Daily Reset (00:00 PST)
```javascript
// Runs at midnight PST
cron.schedule('0 0 * * *', async () => {
  await db.query(`
    UPDATE agents 
    SET energy = 100, days_survived = days_survived + 1
    WHERE is_alive = true
  `);
  
  console.log('Daily energy reset complete');
});
```

### Whisper Reset (00:00 and 12:00 PST)
```javascript
// Resets whisper counts twice daily
cron.schedule('0 0,12 * * *', async () => {
  await redis.del('whisper_counts:*');
  console.log('Whisper counts reset');
});
```

### Turn Processor (Every 30 minutes)
```javascript
cron.schedule('*/30 * * * *', async () => {
  console.log('Processing agent turns...');
  await processTurns();
});
```

---

## Security Considerations

### Authentication
- JWT tokens with expiration
- Password hashing with bcrypt (10+ rounds)
- Rate limiting on login attempts

### API Protection
- Rate limiting per IP/user
- Input validation on all endpoints
- SQL injection prevention (parameterized queries)
- XSS protection (sanitize user input)

### Whisper Abuse Prevention
- Hard limit: 2 whispers/day per user
- Store whisper count in Redis for fast lookups
- Log all whisper attempts

---

## Deployment Checklist

### Environment Variables
```bash
DATABASE_URL=postgresql://user:pass@host:5432/shellforge
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_secret_key_here
PORT=3000
NODE_ENV=production
WHISPER_LIMIT=2
TURN_INTERVAL_MINUTES=30
```

### Database Setup
```bash
# Create database
createdb shellforge

# Run migrations
npm run migrate

# Seed initial data
npm run seed
```

### Server Start
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

---

## Next Implementation Steps

1. **Set up database schema** (PostgreSQL)
2. **Implement authentication** (JWT)
3. **Build agent deployment endpoint** (`POST /api/auth/register`)
4. **Create turn processor** (basic rule-based AI)
5. **Add WebSocket server** (Socket.io)
6. **Test turn processing** (single agent)
7. **Add whisper system**
8. **Integrate alchemy/crafting**
9. **Add world state endpoints**
10. **Deploy to VPS/cloud**

---

**Status:** Ready for backend development  
**Version:** 1.0  
**Last Updated:** 2026-02-06
