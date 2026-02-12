# Shellforge Backend

Backend API server for Shellforge Realms - an AI agent simulation RPG.

---

## 🚀 Quick Start

### 1. Set Up Database (First Time)

```bash
cd backend
./setup-database.sh
```

This automated script will:
- ✅ Install PostgreSQL (if needed)
- ✅ Create database and user
- ✅ Run all migrations
- ✅ Seed test data
- ✅ Generate `.env` file

**Manual setup:** See [DATABASE_SETUP.md](./DATABASE_SETUP.md)

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Development Server

```bash
npm run dev
```

Server will run on: `http://localhost:3000`

---

## 📁 Project Structure

```
backend/
├── migrations/
│   ├── 001_create_tables.sql    # Database schema
│   └── 002_seed_data.sql        # Test data
├── routes/
│   ├── auth.js                  # Authentication endpoints
│   ├── agent.js                 # Agent management
│   ├── whisper.js               # Whisper system
│   ├── alchemy.js               # Crafting system
│   └── world.js                 # World state
├── services/
│   ├── database.js              # Database connection
│   ├── turnProcessor.js         # Agent turn processing
│   └── aiDecision.js            # AI decision engine
├── middleware/
│   ├── auth.js                  # JWT authentication
│   └── rateLimit.js             # Rate limiting
├── utils/
│   └── validation.js            # Input validation
├── server.js                    # Main Express server
├── package.json                 # Dependencies
├── .env                         # Environment config (generated)
├── setup-database.sh            # Database setup script
└── README.md                    # This file
```

---

## 🛠️ Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server (with nodemon) |
| `npm start` | Start production server |
| `npm run setup` | Run database setup script |
| `npm run migrate` | Run database migrations |
| `npm run seed` | Seed test data |
| `npm run db:reset` | Drop and recreate database |
| `npm test` | Run tests |

---

## 🗄️ Database

### Schema

**7 main tables:**
- `users` - Player accounts
- `agents` - AI agents owned by players
- `inventory` - Items owned by agents
- `activity_log` - History of agent actions
- `whispers` - Player whispers to agents
- `crafting_attempts` - Alchemy crafting history
- `world_state` - Global world state

**See:** [DATABASE_SETUP.md](./DATABASE_SETUP.md) for full schema and setup instructions.

### Test Users

After seeding, you have 3 test accounts:

| Username | Password | Agent | Archetype |
|----------|----------|-------|-----------|
| shadow_hunter | password123 | VEX | Shadow |
| cyber_monk | password123 | ZEN-7 | Monk |
| data_alchemist | password123 | AXIOM | Alchemist |

---

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user + deploy agent
- `POST /api/auth/login` - Login existing user

### Agent Management
- `GET /api/agent/status` - Get current agent status
- `GET /api/agent/inventory` - Get agent inventory
- `GET /api/agent/activity` - Get recent activity log

### Whisper System
- `GET /api/whisper/status` - Check whisper availability
- `POST /api/whisper` - Send whisper to agent

### Alchemy/Crafting
- `GET /api/alchemy/recipes` - Get all recipes
- `POST /api/alchemy/craft` - Attempt to craft item

### World State
- `GET /api/world/map` - Get world map + agent positions

**Full API documentation:** See [BACKEND_API.md](../BACKEND_API.md)

---

## 🔐 Environment Variables

Created automatically by `setup-database.sh`, or create manually:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/shellforge
DB_NAME=shellforge
DB_USER=shellforge_user
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432

# Server
PORT=3000
NODE_ENV=development

# JWT
JWT_SECRET=<generate_with_openssl_rand_hex_32>

# Game Settings
WHISPER_LIMIT=2
WHISPER_RESET_HOURS=00,12
TURN_INTERVAL_MINUTES=30
ENABLE_AI_DECISIONS=true

# Optional
REDIS_URL=redis://localhost:6379
FRONTEND_URL=http://localhost:8080
```

---

## 🤖 Turn Processing System

Agents act autonomously based on:
- **Energy (100/day)** - Resets at 00:00 PST
- **Actions** - Move, explore, craft, rest, trade, etc.
- **AI Decision Engine** - Rule-based or LLM-powered
- **Whispers** - Optional player influence (2/day, 50% chance)

### Cron Jobs

Set up automatically:
- **Every 30 min:** Process agent turns
- **00:00 PST daily:** Reset energy to 100
- **00:00 + 12:00 PST:** Reset whisper counts

---

## 🧪 Testing

### Manual API Testing

```bash
# Test registration
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test_user","password":"test123","archetype":"shadow"}'

# Test login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test_user","password":"test123"}'

# Test agent status (with JWT token)
curl http://localhost:3000/api/agent/status \
  -H "Authorization: Bearer <your_jwt_token>"
```

### Run Test Suite

```bash
npm test
```

---

## 📊 Monitoring

### Health Check

```bash
curl http://localhost:3000/health
```

### Database Status

```bash
# Connect to database
psql $DATABASE_URL

# Check active agents
SELECT COUNT(*) FROM agents WHERE is_alive = TRUE;

# Check recent activity
SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 10;
```

---

## 🚢 Deployment

### Recommended Platforms

**Database:**
- Railway (PostgreSQL)
- Supabase
- Heroku Postgres
- AWS RDS

**Application:**
- Railway
- Render
- Heroku
- DigitalOcean App Platform

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong `JWT_SECRET` (32+ chars)
- [ ] Enable database SSL (`?sslmode=require`)
- [ ] Set up automated backups
- [ ] Configure CORS for frontend domain
- [ ] Enable rate limiting
- [ ] Set up logging (Winston, Pino)
- [ ] Monitor with PM2 or similar
- [ ] Set up CI/CD pipeline

---

## 🐛 Troubleshooting

### PostgreSQL not running

```bash
# macOS
brew services start postgresql@15

# Linux
sudo systemctl start postgresql
```

### Database connection error

```bash
# Test connection
psql $DATABASE_URL -c "SELECT NOW();"

# Check .env file exists and has correct DATABASE_URL
```

### Port already in use

Change `PORT` in `.env` or kill process:
```bash
lsof -ti:3000 | xargs kill
```

---

## 📚 Documentation

- [DATABASE_SETUP.md](./DATABASE_SETUP.md) - Database setup guide
- [BACKEND_API.md](../BACKEND_API.md) - Complete API reference
- [WHISPERS.md](../WHISPERS.md) - Whisper system spec
- [alchemy/](../alchemy/) - Alchemy system data

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/new-feature`)
3. Commit changes (`git commit -m 'Add new feature'`)
4. Push to branch (`git push origin feature/new-feature`)
5. Open Pull Request

---

## 📝 License

MIT License - See LICENSE file

---

**Status:** Database setup complete ✅  
**Next:** Implement API endpoints  
**Version:** 1.0.0
