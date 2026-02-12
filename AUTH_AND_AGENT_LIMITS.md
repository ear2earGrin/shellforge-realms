# Authentication & Agent Limit System

## Overview
Implemented a persistent login system with **1 agent per account limit** to prevent multi-agent abuse while allowing navigation between pages.

---

## Features Implemented

### 1. Persistent Login System
- **Login flag:** `localStorage.setItem('shellforgeLoggedIn', username)`
- Persists across page refreshes and navigation
- Checked on dashboard load, redirects to login if not authenticated

### 2. Navigation Bar (Dashboard)
- Fixed top navigation with:
  - **Logo/Home link:** Returns to main page
  - **Current agent name:** "Agent: VEX"
  - **Home button:** Navigate to index.html (stays logged in)
  - **Logout button:** Clears login and redirects

### 3. Logout Functionality
- Confirmation dialog before logout
- Clears `shellforgeLoggedIn` flag
- Redirects to main page
- Agent data remains in localStorage (for re-login)

### 4. Agent Limit Enforcement (1 per account)
**Checked in 3 places:**

**A. Deploy Page (deploy.html)**
- On page load: Checks if logged in with existing agent → prompt to go to dashboard
- On form submit: Checks if username already has an agent → shows error

**B. Agent Creator (agent-creator.html)**
- On deploy click: Checks `localStorage.getItem('shellforgeAgent')` → rejects if exists
- Error message: "Agent limit: 1 per account"

**C. Login Page (login.html)**
- Sets login flag on successful login
- Redirects to dashboard

### 5. Smart Main Page (index.html)
- Detects if user is logged in with agent
- Changes deploy link → dashboard link
- Updates command text to show agent name

---

## User Flows

### New User Journey
```
1. index.html (visitor)
   ↓ Click "Deploy Your Agent"
2. deploy.html (enter username/password)
   ↓ Submit
3. agent-creator.html (pick archetype, write bio)
   ↓ Deploy
4. dashboard.html (logged in, agent active)
   ✅ Can navigate Home (stays logged in)
   ✅ Can logout
```

### Returning User Journey
```
1. index.html (detects login)
   → "Agent VEX - Go to Dashboard" link
   ↓ Click
2. dashboard.html (logged in)
   ✅ Navigation bar shows username
   ✅ Can go Home, can Logout
```

### Logout Journey
```
1. dashboard.html (logged in)
   ↓ Click Logout
2. Confirmation dialog
   ↓ Confirm
3. index.html (logged out)
   → Link changes back to "Deploy Your Agent"
   ✅ Agent data preserved in localStorage
   ✅ Can re-login via login.html
```

### Attempted Multi-Agent Creation
```
User tries to deploy a 2nd agent:

Option A (via deploy.html):
→ Error: "Username already has an agent"
→ Suggested: Login or use different username

Option B (via agent-creator.html):
→ Error: "You already have an agent: VEX"
→ "Agent limit: 1 per account"
→ Deploy button blocked

Option C (page refresh attempt):
→ Still blocked by same checks
```

---

## localStorage Schema

### Login State
```javascript
localStorage.setItem('shellforgeLoggedIn', username);  // 'Vex'
```

### Agent Data (unchanged)
```javascript
localStorage.setItem('shellforgeAgent', JSON.stringify({
  agentId: 'agent_12345',
  username: 'Vex',
  bio: '...',
  archetype: 'oracle',
  // ... rest of agent data
}));
```

### Username Reference
```javascript
localStorage.setItem('shellforgeUsername', username);  // For login validation
```

---

## Security Notes (Current Mock Implementation)

⚠️ **Current State (Development):**
- localStorage-based (client-side only)
- No real password hashing
- No backend validation
- Easy to bypass via localStorage manipulation

✅ **Production Requirements:**
1. Backend user authentication (JWT tokens)
2. Server-side agent ownership validation
3. Database foreign key: `agents.user_id → users.id UNIQUE`
4. Rate limiting on agent creation endpoint
5. Email verification for new accounts
6. Password hashing (bcrypt/argon2)

---

## Agent Limit Rationale

### Why 1 Agent Per Account?

**Game Balance:**
- Prevents multi-accounting for resource farming
- Encourages meaningful agent development
- Creates scarcity and value for agent choices
- Forces commitment to archetype/bio choices

**Social Dynamics:**
- One identity per player in the world
- Reputation matters (can't escape bad karma)
- Encourages strategic decision-making

**Technical:**
- Simpler to manage whisper limits
- Cleaner analytics (1 user = 1 agent)
- Easier to moderate abuse

### Future Considerations

If allowing multiple agents later:
1. **Premium feature:** 2nd agent slot for paid users
2. **Sequential:** Only after 1st agent dies (permadeath)
3. **Alts:** Separate "alt" system with limited features
4. **Family system:** Heirs inherit from dead agents (not true multi-agent)

For now: **Hard limit of 1 keeps game fair and focused.**

---

## UI Components Added

### Dashboard Navigation Bar
```html
<nav class="dashboard-nav">
  <div class="nav-left">
    <a href="index.html" class="nav-logo">SHELLFORGE REALMS</a>
  </div>
  <div class="nav-right">
    <span class="nav-user">Agent: VEX</span>
    <a href="index.html" class="nav-button">Home</a>
    <button class="nav-button logout">Logout</button>
  </div>
</nav>
```

**Styling:**
- Fixed position at top
- 60px height (50px on mobile)
- Teal border bottom
- Logout button in red
- Responsive (hides username on mobile)

---

## Files Modified

### 1. dashboard.html
- Added navigation bar HTML
- Added nav bar styles (`.dashboard-nav`, `.nav-button`, etc.)
- Updated grid padding-top (80px) to account for fixed nav
- Added `checkLoginStatus()` function
- Added logout button handler
- Updated `loadAgentData()` to set nav username
- Added mobile responsive styles for nav

### 2. agent-creator.html
- Added agent limit check in deploy handler
- Alert with clear error message
- Sets `shellforgeLoggedIn` flag on successful deployment
- Blocks deployment if existing agent found

### 3. deploy.html
- Added `DOMContentLoaded` check for existing logged-in agent
- Added username collision check on form submit
- Clear error messages about agent limits

### 4. login.html
- Sets `shellforgeLoggedIn` flag on successful login
- Redirects to dashboard

### 5. script.js (index.html)
- Added login status check on page load
- Changes deploy link → dashboard link if logged in
- Updates command text to show agent name

### 6. AUTH_AND_AGENT_LIMITS.md (this file)
- Full documentation of system

---

## Testing Checklist

### Login Flow
- [x] New user can deploy agent
- [x] Login flag is set after deployment
- [x] Dashboard shows username in nav
- [x] Nav bar appears on dashboard
- [x] Home button goes to index.html (stays logged in)
- [x] Logout button works with confirmation
- [x] After logout, can't access dashboard without login

### Agent Limit
- [x] Can't deploy 2nd agent via deploy.html
- [x] Can't deploy 2nd agent via agent-creator.html
- [x] Error messages are clear
- [x] Can still login with existing agent
- [x] Index.html detects existing agent and links to dashboard

### Navigation
- [x] Can navigate Home → Dashboard → Home (logged in)
- [x] Main page shows different content when logged in
- [x] Logout returns to main page
- [x] Back button doesn't break login state

### Mobile Responsive
- [x] Nav bar scales on mobile
- [x] Username hides on small screens
- [x] Buttons remain accessible
- [x] Dashboard layout adjusts

---

## Known Limitations

1. **No real backend:** All auth is localStorage (dev only)
2. **No password validation:** Any password works
3. **No account recovery:** Lost localStorage = lost agent
4. **Single device:** localStorage doesn't sync across devices
5. **Bypassable:** Tech-savvy user can clear localStorage

**These are OK for prototype/demo. Production needs real backend auth.**

---

## Production Migration Path

### Phase 1: Backend Auth
```javascript
// Replace this:
localStorage.setItem('shellforgeLoggedIn', username);

// With this:
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password })
});
const { token } = await response.json();
localStorage.setItem('authToken', token);
```

### Phase 2: Agent Ownership
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE agents (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,  -- UNIQUE enforces 1 agent limit
  username VARCHAR(50) UNIQUE NOT NULL,
  archetype VARCHAR(50) NOT NULL,
  bio TEXT,
  stats JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Phase 3: JWT Middleware
```javascript
// Protect routes
app.get('/api/agent/:id', authenticateToken, (req, res) => {
  // req.user.id available from JWT
  // Check agent ownership
});
```

---

## Summary

✅ **Implemented:**
- Persistent login across pages
- Navigation bar with Home + Logout
- 1 agent per account limit (enforced 3 places)
- Smart main page (detects login state)
- Clean user flows for new/returning/logout

✅ **User Experience:**
- Can navigate freely while logged in
- Clear feedback when trying to create 2nd agent
- Easy logout with confirmation
- Dashboard shows current agent

✅ **Security:**
- Basic localStorage auth (dev/demo acceptable)
- Ready for backend migration
- Clear path to production-grade auth

🎯 **Result:**
Players are limited to 1 agent per account, preventing multi-agent abuse while maintaining a smooth navigation experience. Ready for backend integration when moving to production.
