#!/bin/bash
# Shellforge Database Setup Script
# Automates PostgreSQL installation and database initialization

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/migrations"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Database configuration
DB_NAME="${DB_NAME:-shellforge}"
DB_USER="${DB_USER:-shellforge_user}"
DB_PASSWORD="${DB_PASSWORD:-shellforge_pass_$(openssl rand -hex 8)}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  Shellforge Database Setup Wizard     ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
echo ""

# Function to check if PostgreSQL is installed
check_postgres() {
    if command -v psql &> /dev/null; then
        echo -e "${GREEN}✓${NC} PostgreSQL is installed"
        psql --version
        return 0
    else
        echo -e "${RED}✗${NC} PostgreSQL is not installed"
        return 1
    fi
}

# Function to install PostgreSQL on macOS
install_postgres_mac() {
    echo -e "${YELLOW}Installing PostgreSQL via Homebrew...${NC}"
    
    if ! command -v brew &> /dev/null; then
        echo -e "${RED}✗${NC} Homebrew not found. Install from: https://brew.sh"
        exit 1
    fi
    
    brew install postgresql@15
    brew services start postgresql@15
    
    echo -e "${GREEN}✓${NC} PostgreSQL installed and started"
}

# Function to check if PostgreSQL is running
check_postgres_running() {
    if pg_isready -h $DB_HOST -p $DB_PORT &> /dev/null; then
        echo -e "${GREEN}✓${NC} PostgreSQL is running"
        return 0
    else
        echo -e "${RED}✗${NC} PostgreSQL is not running"
        return 1
    fi
}

# Function to start PostgreSQL service
start_postgres() {
    echo -e "${YELLOW}Starting PostgreSQL...${NC}"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        brew services start postgresql@15 || brew services start postgresql
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        sudo systemctl start postgresql
    fi
    
    sleep 2
    check_postgres_running
}

# Function to create database and user
create_database() {
    echo -e "${YELLOW}Creating database and user...${NC}"
    
    # Check if database exists
    if psql -h $DB_HOST -p $DB_PORT -U $USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
        echo -e "${YELLOW}⚠${NC}  Database '$DB_NAME' already exists"
        read -p "Drop and recreate? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}Dropping database...${NC}"
            psql -h $DB_HOST -p $DB_PORT -U $USER -c "DROP DATABASE IF EXISTS $DB_NAME;"
        else
            echo -e "${YELLOW}Skipping database creation${NC}"
            return 0
        fi
    fi
    
    # Create user
    echo -e "${CYAN}Creating database user: $DB_USER${NC}"
    psql -h $DB_HOST -p $DB_PORT -U $USER -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null || echo "User may already exist"
    
    # Create database
    echo -e "${CYAN}Creating database: $DB_NAME${NC}"
    psql -h $DB_HOST -p $DB_PORT -U $USER -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
    
    # Grant privileges
    psql -h $DB_HOST -p $DB_PORT -U $USER -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
    
    echo -e "${GREEN}✓${NC} Database created successfully"
}

# Function to run migrations
run_migrations() {
    echo -e "${YELLOW}Running migrations...${NC}"
    
    for migration in $MIGRATIONS_DIR/*.sql; do
        if [ -f "$migration" ]; then
            filename=$(basename "$migration")
            echo -e "${CYAN}  → Running: $filename${NC}"
            
            PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$migration"
            
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}    ✓ Success${NC}"
            else
                echo -e "${RED}    ✗ Failed${NC}"
                exit 1
            fi
        fi
    done
    
    echo -e "${GREEN}✓${NC} All migrations completed"
}

# Function to verify installation
verify_installation() {
    echo -e "${YELLOW}Verifying installation...${NC}"
    
    # Count tables
    TABLE_COUNT=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
    
    # Count users
    USER_COUNT=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tAc "SELECT COUNT(*) FROM users;")
    
    # Count agents
    AGENT_COUNT=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tAc "SELECT COUNT(*) FROM agents;")
    
    echo -e "${GREEN}✓${NC} Verification complete:"
    echo -e "  Tables: $TABLE_COUNT"
    echo -e "  Test users: $USER_COUNT"
    echo -e "  Test agents: $AGENT_COUNT"
}

# Function to generate .env file
generate_env_file() {
    echo -e "${YELLOW}Generating .env file...${NC}"
    
    ENV_FILE="$SCRIPT_DIR/.env"
    
    cat > "$ENV_FILE" << EOF
# Shellforge Backend Configuration
# Generated: $(date)

# Database
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT

# Server
PORT=3000
NODE_ENV=development

# JWT Secret (generate a new one for production!)
JWT_SECRET=$(openssl rand -hex 32)

# Whisper System
WHISPER_LIMIT=2
WHISPER_RESET_HOURS=00,12

# Turn Processing
TURN_INTERVAL_MINUTES=30
ENABLE_AI_DECISIONS=true

# Redis (for caching)
REDIS_URL=redis://localhost:6379

# Frontend URL
FRONTEND_URL=http://localhost:8080
EOF
    
    echo -e "${GREEN}✓${NC} .env file created at: $ENV_FILE"
    echo -e "${YELLOW}⚠${NC}  Keep this file secure! It contains sensitive credentials."
}

# Function to display connection info
show_connection_info() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  Database Setup Complete! 🎉          ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}Database Connection Info:${NC}"
    echo -e "  Database: $DB_NAME"
    echo -e "  User:     $DB_USER"
    echo -e "  Password: $DB_PASSWORD"
    echo -e "  Host:     $DB_HOST"
    echo -e "  Port:     $DB_PORT"
    echo ""
    echo -e "${GREEN}Connection String:${NC}"
    echo -e "  postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"
    echo ""
    echo -e "${YELLOW}Test Users (password: 'password123'):${NC}"
    echo -e "  - shadow_hunter (Shadow archetype)"
    echo -e "  - cyber_monk (Monk archetype)"
    echo -e "  - data_alchemist (Alchemist archetype)"
    echo ""
    echo -e "${CYAN}Next Steps:${NC}"
    echo -e "  1. cd backend"
    echo -e "  2. npm install"
    echo -e "  3. npm run dev"
    echo ""
}

# Main script execution
main() {
    # Step 1: Check PostgreSQL installation
    if ! check_postgres; then
        echo ""
        echo -e "${YELLOW}Would you like to install PostgreSQL? (y/N)${NC}"
        read -p "> " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                install_postgres_mac
            else
                echo -e "${RED}Automatic installation only supported on macOS.${NC}"
                echo "Please install PostgreSQL manually:"
                echo "  Ubuntu/Debian: sudo apt-get install postgresql"
                echo "  Fedora: sudo dnf install postgresql-server"
                exit 1
            fi
        else
            echo -e "${RED}PostgreSQL is required. Exiting.${NC}"
            exit 1
        fi
    fi
    
    # Step 2: Check if PostgreSQL is running
    if ! check_postgres_running; then
        start_postgres
    fi
    
    # Step 3: Create database and user
    create_database
    
    # Step 4: Run migrations
    run_migrations
    
    # Step 5: Verify installation
    verify_installation
    
    # Step 6: Generate .env file
    generate_env_file
    
    # Step 7: Show connection info
    show_connection_info
}

# Run main function
main
