# Database Setup for Phase 3

## Prerequisites
PostgreSQL is running on your system. We need to create the database and run migrations.

## Step 1: Create Database and User

Run these commands as the postgres superuser:

```bash
# Option A: If you can sudo to postgres user
sudo -u postgres psql <<EOF
CREATE DATABASE vireo;
CREATE USER postgres WITH ENCRYPTED PASSWORD 'postgres';
GRANT ALL PRIVILEGES ON DATABASE vireo TO postgres;
EOF

# Option B: If you have a different postgres setup
# Update the .env file with your actual credentials:
# DB_PASSWORD=your_actual_password
```

## Step 2: Run Migrations

Once the database is created:

```bash
cd /home/tomdev/Documents/coding/vireo-finance/backend
npm run migration:run
```

Expected output:
```
Migration AddBiometricTables1700000000003 has been executed successfully.
```

## Step 3: Verify Tables Were Created

```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d vireo -c "\dt"
```

You should see:
- `biometric_consents`
- `biometric_enrollments`
- `biometric_attempts`
- Plus all existing tables (users, accounts, ledger_entries, etc.)

## Alternative: Manual SQL Execution

If the migration command doesn't work, you can run the SQL directly:

```bash
cd /home/tomdev/Documents/coding/vireo-finance/backend
PGPASSWORD=postgres psql -h localhost -U postgres -d vireo -f manual_migration.sql
```

Where `manual_migration.sql` contains the SQL from the migration file.

## Troubleshooting

### Password Authentication Failed

If you get "password authentication failed for user postgres":

1. **Check pg_hba.conf:**
```bash
sudo cat /etc/postgresql/*/main/pg_hba.conf | grep "local.*all.*postgres"
```

Should have:
```
local   all             postgres                                peer
# or
local   all             postgres                                md5
```

2. **Set postgres password:**
```bash
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"
```

3. **Reload PostgreSQL:**
```bash
sudo systemctl reload postgresql
```

### Database Doesn't Exist

```bash
sudo -u postgres createdb vireo
sudo -u postgres psql -d vireo -c "GRANT ALL ON SCHEMA public TO postgres;"
```

### Using a Different Database

If you want to use a different database name or credentials:

1. Update `.env`:
```
DB_NAME=your_db_name
DB_USER=your_username
DB_PASSWORD=your_password
```

2. Create the database:
```bash
sudo -u postgres createdb your_db_name
sudo -u postgres psql -c "GRANT ALL ON DATABASE your_db_name TO your_username;"
```

3. Run migrations:
```bash
npm run migration:run
```
