# Shellforge Database Setup Guide

Complete guide to setting up the PostgreSQL database for Shellforge Realms.

---

## Quick Start (Automated)

### Option 1: Run Setup Script (Recommended)

The easiest way to get started:

```bash
cd backend
./setup-database.sh
```

This script will:
1. ✅ Check if PostgreSQL is installed
2. ✅ Install PostgreSQL (if needed, macOS only)
3. ✅ Start PostgreSQL service
4. ✅ Create database and user
5. ✅ Run all migrations
6. ✅ Seed test data
7. ✅ Generate `.env` file with credentials
8. ✅ Display connection info

**That's it!** Skip to [Verify Installation](#verify-installation) below.

---

## Manual Setup

If you prefer manual setup or the script doesn't work for your system:

### Step 1: Install PostgreSQL

#### macOS (Homebrew)
```bash
brew install postgresql@15
brew services start postgresql@15
```

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### Windows
Download and install from: https://www.postgresql.org/download/windows/

### Step 2: Verify PostgreSQL is Running

```bash
# Check version
psql --version

# Check if service is running
pg_isready

# Should output: accepting connections
```

### Step 3: Create Database and User

```bash
# Connect to PostgreSQL
psql postgres

# In psql prompt:
CREATE USER shellforge_user WITH PASSWORD 'your_secure_password';
CREATE DATABASE shellforge OWNER shellforge_user;
GRANT ALL PRIVILEGES ON DATABASE shellforge TO shellforge_user;

# Exit psql
\q
```

### Step 4: Run Migrations

```bash
cd backend

# Run schema creation
psql -U shellforge_user -d shellforge -f migrations/001_create_tables.sql

# Run seed data (optional, for testing)
psql -U shellforge_user -d shellforge -f migrations/002_seed_data.sql
```

### Step 5: Create .env File

Create `backend/.env` with your credentials:

```bash
# Database
DATABASE_URL=postgresql://shellforge_user:your_secure_password@localhost:5432/shellforge
DB_NAME=shellforge
DB_USER=shellforge_user
DB_PASSWORD=your_secure_password
DB_HOST=localhost
DB_PORT=5432

# Server
PORT=3000
NODE_ENV=development

# JWT Secret (generate with: openssl rand -hex 32)
JWT_SECRET=your_generated_secret_here

# Whisper System
WHISPER_LIMIT=2
WHISPER_RESET_HOURS=00,12

# Turn Processing
TURN_INTERVAL_MINUTES=30
ENABLE_AI_DECISIONS=true

# Redis (optional, for caching)
REDIS_URL=redis://localhost:6379

# Frontend
FRONTEND_URL=http://localhost:8080
```

---

## Verify Installation

Check that everything is set up correctly:

```bash
# Connect to database
psql -U shellforge_user -d shellforge

# Check tables
\dt

# Should show:
#  agents
#  users
#  inventory
#  activity_log
#  whispers
#  crafting_attempts
#  world_state

# Check test data
SELECT agent_name, archetype, energy, location FROM agents;

# Should show 3 test agents:
#  VEX (shadow)
#  ZEN-7 (monk)
#  AXIOM (alchemist)

# Exit
\q
```

---

## Database Schema

### Tables Created

1. **users** - Player accounts
2. **agents** - AI agents owned by players
3. **inventory** - Items owned by agents
4. **activity_log** - History of all agent actions
5. **whispers** - Player whispers to agents
6. **crafting_attempts** - Alchemy crafting history
7. **world_state** - Global world state and events

### Key Features

- ✅ UUID primary keys
- ✅ Foreign key constraints with CASCADE delete
- ✅ Check constraints for data validation
- ✅ Indexes on frequently queried columns
- ✅ Trigger for automatic population tracking
- ✅ Function for daily energy reset
- ✅ View for agent status summary

---

## Test Data

If you ran the seed data script, you have 3 test users:

| Username | Password | Agent Name | Archetype | Location |
|----------|----------|------------|-----------|----------|
| shadow_hunter | password123 | VEX | Shadow | Nexarch |
| cyber_monk | password123 | ZEN-7 | Monk | Nexarch |
| data_alchemist | password123 | AXIOM | Alchemist | Hashmere |

**Note:** Test password hashes are placeholders. Real bcrypt hashes will be generated when you implement registration.

---

## Useful Commands

### Database Management

```bash
# Connect to database
psql -U shellforge_user -d shellforge

# List all databases
\l

# List all tables
\dt

# Describe a table
\d agents

# View table data
SELECT * FROM agents;

# Count records
SELECT COUNT(*) FROM activity_log;

# Exit psql
\q
```

### Reset Database

```bash
# Drop and recreate (WARNING: deletes all data!)
npm run db:reset

# Or manually:
psql -U shellforge_user -d shellforge -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
npm run migrate
npm run seed
```

### Backup Database

```bash
# Backup to file
pg_dump -U shellforge_user shellforge > backup_$(date +%Y%m%d).sql

# Restore from backup
psql -U shellforge_user -d shellforge < backup_20260206.sql
```

---

## Troubleshooting

### PostgreSQL not found

```bash
# macOS: Check if installed
brew list postgresql

# If not installed:
brew install postgresql@15
brew services start postgresql@15
```

### Connection refused

```bash
# Check if PostgreSQL is running
pg_isready

# Start service (macOS)
brew services start postgresql@15

# Start service (Linux)
sudo systemctl start postgresql
```

### Permission denied

```bash
# Grant privileges
psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE shellforge TO shellforge_user;"

# Or connect as superuser
psql postgres
```

### "peer authentication failed"

Edit `pg_hba.conf` to change authentication method:

```bash
# Find config file
psql -U postgres -c 'SHOW hba_file'

# Edit file (use sudo/admin)
# Change: local all all peer
# To:     local all all md5
```

Then restart PostgreSQL:
```bash
brew services restart postgresql@15  # macOS
sudo systemctl restart postgresql    # Linux
```

### Port already in use

Change port in `.env`:
```bash
DB_PORT=5433  # or another available port
```

---

## Next Steps

After database setup is complete:

1. **Install Node.js dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Test connection:**
   ```bash
   node -e "const {Pool} = require('pg'); const pool = new Pool({connectionString: process.env.DATABASE_URL}); pool.query('SELECT NOW()').then(res => console.log(res.rows[0]));"
   ```

3. **Start building the API server:**
   - Create `server.js`
   - Implement authentication endpoints
   - Add agent management routes
   - Set up WebSocket server

---

## Database Performance Tips

### Indexes

Already created for common queries:
- `agents.user_id`, `agents.location`, `agents.is_alive`
- `inventory.agent_id`, `inventory.item_type`
- `activity_log.agent_id`, `activity_log.timestamp`

### Connection Pooling

Use connection pools in production:
```javascript
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // max connections
  idleTimeoutMillis: 30000
});
```

### Vacuuming

Schedule regular maintenance:
```sql
-- Run weekly
VACUUM ANALYZE;

-- Or set up autovacuum (usually enabled by default)
```

---

## Security Checklist

- [ ] Change default passwords in production
- [ ] Use strong JWT secret (32+ character random string)
- [ ] Enable SSL for database connections in production
- [ ] Set up firewall rules to restrict database access
- [ ] Regularly backup database
- [ ] Use environment variables, never hardcode credentials
- [ ] Enable query logging in production for auditing
- [ ] Set up automated backups

---

## Production Deployment

### Recommended Hosting

- **Database:** Railway, Supabase, Heroku Postgres, AWS RDS
- **Application:** Railway, Render, Heroku, DigitalOcean

### Environment Variables (Production)

```bash
DATABASE_URL=postgresql://user:pass@production-host:5432/shellforge
NODE_ENV=production
JWT_SECRET=<long_random_string>
ENABLE_SSL=true
LOG_LEVEL=info
```

---

**Setup Status:** ✅ Complete  
**Database Version:** PostgreSQL 15+  
**Last Updated:** 2026-02-06
