# Shellforge Website - Current Status

## ✅ Completed (Frontend)

### Pages
1. **index.html** - Homepage with:
   - Main map background
   - Deploy panel (center)
   - Mechanics sidebar (left)
   - Artifacts sidebar (right)
   - Live activity feed
   - City markers (Nexarch, Hashmere)
   - 6 easter egg locations (5 green, 1 red)
   - Map modal with clickable city hotspots

2. **deploy.html** - Agent Registration:
   - Username/password form
   - Archetype selection (8 archetypes)
   - Form validation
   - ✅ **Now redirects to dashboard after registration**
   - ✅ **Stores mock agent data in localStorage**

3. **dashboard.html** - Main Game Interface (NEW):
   - 3-column grid layout
   - Agent status card (energy, health, karma, location)
   - World map with YOUR agent marker
   - Whisper panel (2/2 per day, 50% chance)
   - Recent activity log
   - Inventory panel (weapons, consumables, ingredients)
   - ✅ **Loads agent data from localStorage**
   - ✅ **Dynamic UI updates**

4. **artifacts.html** - Artifact Codex:
   - Rarity-coded items
   - System overview
   - Color-coded tiers

5. **nexarch.html** - City Page:
   - 7 locations with hover descriptions
   - ✅ **Church & Graveyard videos (loop on click)**
   - Location gallery

6. **hashmere.html** - City Page:
   - 4 locations with hover descriptions
   - Location gallery

---

## ✅ Completed (Backend Design)

### Documentation
1. **BACKEND_API.md** - Complete backend architecture:
   - Database schema (PostgreSQL)
   - 15+ API endpoints
   - Turn processing system
   - Energy system (100 energy/day)
   - AI decision engine (rule-based + LLM)
   - WebSocket events
   - Cron jobs for daily resets
   - Security considerations

2. **WHISPERS.md** - Whisper system spec:
   - 2 whispers/day (reset at 00:00 and 12:00 PST)
   - 50/50 success rate
   - Frontend + backend implementation
   - Complete API design

3. **alchemy/** folder - Alchemy system:
   - `ingredients.csv` (42 ingredients)
   - `items.csv` (42 craftable items)
   - `recipes.csv` (42 recipes)
   - `alchemy-system.json` (master file)
   - `README.md` + `QUICK_REFERENCE.md`

---

## 🔄 Current Flow

### User Journey (Working)
```
1. Visit index.html
   ↓
2. Click "Deploy Your Agent"
   ↓
3. Fill out deploy.html form
   ↓
4. Submit → Agent created (mock data)
   ↓
5. Redirect to dashboard.html
   ↓
6. See agent on map + stats
   ↓
7. Send whispers, view inventory, see activity
```

### What Works Right Now
- ✅ Registration form
- ✅ Dashboard loads agent data
- ✅ Agent displayed on map
- ✅ Whisper UI (sends mock whisper)
- ✅ Activity log displays
- ✅ Inventory displays
- ✅ Energy/health bars update

### What's Mock/Placeholder
- ⚠️ Agent data stored in localStorage (not backend)
- ⚠️ Whisper sends alert but doesn't persist
- ⚠️ No real turn processing
- ⚠️ No real AI decisions
- ⚠️ Activity log is static

---

## 🚧 Next Steps (Backend Implementation)

### Phase 1: Core Backend (Week 1-2)
```bash
Priority Order:
1. Set up PostgreSQL database
2. Create tables (users, agents, inventory, activity_log)
3. Implement authentication (JWT)
4. Build /api/auth/register endpoint
5. Build /api/agent/status endpoint
6. Test registration → dashboard flow with real API
```

### Phase 2: Turn System (Week 2-3)
```bash
7. Build simple decision engine (rule-based)
8. Create turn processor cron job
9. Implement ACTIONS (move, rest, explore, gather)
10. Test autonomous agent behavior
11. Add activity logging
```

### Phase 3: Real-time Updates (Week 3)
```bash
12. Add Socket.io server
13. Emit agent_update events
14. Update dashboard.html to listen to WebSocket
15. Test real-time energy/activity updates
```

### Phase 4: Features (Week 4+)
```bash
16. Integrate whisper system (2/day limit)
17. Add alchemy/crafting endpoints
18. Add inventory management
19. Add world state tracking
20. Deploy to VPS
```

---

## 📊 Project Stats

### Frontend
- **6 HTML pages** (27 KB total)
- **1 CSS file** (28 KB)
- **1 JS file** (17 KB)
- **Images:** Map, deploy, mechanics sprite, artifacts sprite
- **Videos:** 2 short clips (2.1 MB)

### Backend Design
- **16 KB API documentation**
- **6 CSV files + 1 JSON** (alchemy system)
- **Database schema** (5 tables)
- **15+ API endpoints** specified
- **Turn processing architecture** designed

### Documentation
- **WHISPERS.md** (17 KB)
- **BACKEND_API.md** (16 KB)
- **README.md** (alchemy)
- **QUICK_REFERENCE.md** (alchemy)
- **STATUS.md** (this file)

---

## 🎯 Immediate Action Items

### To Test Current Frontend:
```bash
1. Open index.html in browser
2. Click "Deploy Your Agent"
3. Fill form and submit
4. Should redirect to dashboard.html
5. See your agent on map
6. Try sending a whisper (50% chance mock)
```

### To Start Backend:
```bash
1. Install Node.js + PostgreSQL
2. Create database: createdb shellforge
3. Run schema from BACKEND_API.md
4. Create Express server
5. Implement /api/auth/register endpoint
6. Update deploy.html to call real API
7. Test registration flow
```

---

## 💡 Design Decisions Made

### Energy System
- **100 energy per day** (not turn-based)
- Resets at 00:00 PST
- Actions cost 5-30 energy
- Resting restores +25 energy
- Agents act whenever they have energy

### Map Visibility
- **Solo view** (only see YOUR agent) for MVP
- Can add "nearby agents" layer later
- Full population view is future feature

### Whisper System
- **2 whispers per day** (00:00 and 12:00 PST reset)
- **50/50 chance** of being heard
- New whispers replace old ones
- Whispers persist 24 hours

### Turn Processing
- **Cron job every 30 minutes**
- Processes agents with energy > 0
- No fixed turn schedule
- Agents act asynchronously

### Alchemy
- **3 ingredients per craft**
- Success rates: 40-75% based on rarity
- Failures: slag / explosion / catastrophic
- Theme bonuses: +10% per matching ingredient

---

## 🔐 Security Notes

- Passwords hashed with bcrypt
- JWT tokens for authentication
- Rate limiting on API endpoints
- Input validation required
- SQL injection prevention (parameterized queries)
- Whisper abuse prevention (hard limit 2/day)

---

## 🚀 Deployment Readiness

### Frontend
- ✅ Ready to deploy (static files)
- Can host on Netlify/Vercel/GitHub Pages
- No build process needed

### Backend
- ⚠️ Needs implementation
- Requires: Node.js, PostgreSQL, Redis
- Estimated: 2-4 weeks for MVP
- Can deploy to: Heroku, Railway, DigitalOcean, AWS

---

## 📝 Known Issues / TODOs

### Frontend
- [ ] Mobile responsiveness needs testing
- [ ] Add item tooltips to inventory
- [ ] Add crafting modal to dashboard
- [ ] Add logout button
- [ ] Add leaderboard page

### Backend
- [ ] Implement all endpoints
- [ ] Add error handling
- [ ] Add logging
- [ ] Add monitoring
- [ ] Write tests
- [ ] Add rate limiting
- [ ] Set up CI/CD

---

**Last Updated:** 2026-02-06 03:35 PST  
**Status:** Frontend complete, backend designed, ready for implementation
