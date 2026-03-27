# 🏦 Suraksha Bank (SafeVault) — Complete Setup Guide

> **Purpose**: Step-by-step instructions to set up and run the entire Suraksha Bank DBMS project on a fresh machine with locally installed Oracle 21c.

---

## Prerequisites

| Requirement | Details |
|---|---|
| **Oracle Database** | 21c XE (Express Edition) — locally installed |
| **Node.js** | v18+ (LTS recommended) |
| **npm** | Comes with Node.js |
| **Git** | To clone the repository |
| **OS** | Windows 10/11 (instructions assume Windows) |

---

## Step 1: Oracle Database Setup

### 1.1 Create the Application User

Open **SQL*Plus** as `SYSTEM` or `SYS`:

```sql
sqlplus SYSTEM/yourSysPassword@localhost:1521/XEPDB1
```

Then create the user:

```sql
ALTER SESSION SET "_ORACLE_SCRIPT" = TRUE;

CREATE USER yourusername IDENTIFIED BY YourSecurePassword123
  DEFAULT TABLESPACE USERS
  TEMPORARY TABLESPACE TEMP
  QUOTA UNLIMITED ON USERS;

GRANT CONNECT, RESOURCE, CREATE VIEW, CREATE PROCEDURE,
      CREATE TRIGGER, CREATE SEQUENCE, CREATE JOB,
      CREATE SESSION, UNLIMITED TABLESPACE TO yourusername;

GRANT EXECUTE ON DBMS_SCHEDULER TO yourusername;
GRANT CREATE JOB TO yourusername;
GRANT MANAGE SCHEDULER TO yourusername;
```

> **Note**: Replace `yourusername` and password with preferred values. If you change the username, update `backend/.env` accordingly.

### 1.2 Run All SQL Scripts

Navigate to the project's root `DBMS/` directory in SQL*Plus:

```sql
sqlplus yourusername/YourSecurePassword123@localhost:1521/XEPDB1

-- Once connected, run:
@run_all.sql
```

This single script executes **21 SQL files** in correct order:
- Tables, triggers, stored procedures
- Loan, KYC, cheque, deposit, standing instruction modules
- MIS views, service requests, OTP tables
- Seed data (branches, account types, customers, accounts)
- All patches and fixes
- DBMS_SCHEDULER jobs (SI executor, interest accrual, etc.)

**Expected output**: Each step prints `PROMPT` messages. Should end with `Complete Setup Finished Successfully!`

---

## Step 2: Backend Setup

### 2.1 Install Dependencies

```bash
cd DBMS/backend
npm install
```

This installs: `express`, `oracledb`, `bcryptjs`, `jsonwebtoken`, `cors`, `dotenv`, `resend`, `pdfkit`, `qr-image`, etc.

### 2.2 Create `.env` File

Create `backend/.env` with these variables:

```env
# Oracle Database Connection
DB_USER=yourusername
DB_PASSWORD=YourSecurePassword123
DB_CONNECTION_STRING=localhost:1521/XEPDB1

# Server
PORT=5000

# JWT Secret (any random string)
JWT_SECRET=suraksha_bank_jwt_secret_key_2026

# Resend API Key (for email notifications)
# Get a free key at https://resend.com — or leave blank to skip emails
RESEND_API_KEY=re_xxxxxxxxxxxx

# Mail Settings
MAIL_FROM=Suraksha Bank <notifications@resend.dev>
MAIL_REPLY_TO=support@surakshabank.com
```

> **Critical**: The `DB_CONNECTION_STRING` format is `hostname:port/service_name`. For Oracle XE it's typically `localhost:1521/XEPDB1` or `localhost:1521/XE`.

### 2.3 Oracle Instant Client

The `oracledb` npm package (v6+) uses **Thin mode** by default — **no Oracle Instant Client needed**. It connects directly to Oracle over the network.

If using oracledb < 6.0 (Thick mode), download Oracle Instant Client and set `PATH`.

### 2.4 Start Backend

```bash
cd DBMS/backend
node server.js
```

**Expected output**:
```
Initializing Oracle DB connection pool...
Oracle DB connection pool started.
Connected to Oracle DB successfully.
Server running on http://localhost:5000
```

---

## Step 3: Frontend Setup

### 3.1 Install Dependencies

```bash
cd DBMS/frontend
npm install
```

This installs: `next` (v16), `react` (v19), `framer-motion`, `lucide-react`, `tailwindcss`.

### 3.2 Start Frontend

```bash
cd DBMS/frontend
npm run dev
```

**Expected output**:
```
▲ Next.js 16.x.x
- Local: http://localhost:3000
```

---

## Step 4: Access the Application

Open **http://localhost:3000** in a browser.

### Default Login Credentials (from seed data)

| Role | Username | Password | Portal |
|---|---|---|---|
| **System Admin** | `admin1` | `admin123` | `/admin/dashboard` |
| **Branch Manager** | `manager1` | `manager123` | `/manager/dashboard` |
| **Teller** | `teller1` | `teller123` | `/teller/dashboard` |
| **Loan Manager** | `loanmgr1` | `loan123` | `/loan/dashboard` |
| **Customer** | `ravi.verma` | `cust123` | `/customer/dashboard` |
| **Customer** | `priya.sharma` | `cust123` | `/customer/dashboard` |

> Passwords are bcrypt-hashed in the database. These are the plaintext values used during seeding.

---

## Project Structure

```
DBMS/
├── backend/                  # Express.js API server (Node.js)
│   ├── server.js             # Entry point
│   ├── db.js                 # Oracle connection pool
│   ├── .env                  # Environment config (create manually)
│   ├── middleware/auth.js     # JWT auth + role middleware
│   ├── routes/
│   │   ├── authRoutes.js     # Login/register
│   │   ├── customerRoutes.js # Customer operations
│   │   ├── tellerRoutes.js   # Teller operations
│   │   ├── managerRoutes.js  # Branch manager operations
│   │   ├── adminRoutes.js    # System admin CRUD
│   │   ├── loanManagerRoutes.js  # Loan lifecycle
│   │   └── otpRoutes.js      # OTP verification
│   ├── lib/
│   │   ├── dispatchEmail.js  # Email notification dispatcher
│   │   └── mailer.js         # Resend client
│   └── services/
│       └── emailService.js   # Email HTML templates
│
├── frontend/                 # Next.js 16 + React 19
│   └── src/app/
│       ├── login/            # Login page
│       ├── customer/         # Customer portal (13 pages)
│       ├── teller/           # Teller portal (8 pages)
│       ├── manager/          # Branch manager portal (11 pages)
│       ├── admin/            # System admin portal (8 pages)
│       └── loan/             # Loan manager portal (5 pages)
│
├── *.sql                     # Oracle PL/SQL scripts
├── run_all.sql               # Master setup script (runs all SQL in order)
└── README.md
```

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `ORA-01017: invalid username/password` | Check `.env` credentials match the Oracle user |
| `ORA-12541: TNS: no listener` | Oracle service not running. Start it: `lsnrctl start` |
| `ORA-01950: no privileges on tablespace` | Run `GRANT UNLIMITED TABLESPACE TO C##USERNAME;` |
| `Error: NJS-518` | Oracle not reachable. Check `DB_CONNECTION_STRING` |
| Frontend shows blank | Ensure backend is running on port 5000 first |
| Emails not sending | `RESEND_API_KEY` missing or invalid. Non-critical — app works without it |
| `DBMS_SCHEDULER` jobs not created | Run `GRANT CREATE JOB, MANAGE SCHEDULER TO C##USERNAME;` then re-run `db_si_scheduler.sql` |

---

## Quick Start Summary

```bash
# 1. Clone repo
git clone <repo-url>
cd DBMS

# 2. Set up Oracle DB
sqlplus yourusername/pass@localhost:1521/XEPDB1 @run_all.sql

# 3. Set up backend
cd backend
npm install
# Create .env file (see above)
node server.js

# 4. Set up frontend (new terminal)
cd frontend
npm install
npm run dev

# 5. Open http://localhost:3000
```
