# Suraksha Bank Management System (DBMS Project)

Suraksha Bank is a comprehensive banking management system designed with a robust Oracle database backend and a modern Next.js frontend. It supports multiple roles including Customer, Teller, Branch Manager, Loan Manager, and System Admin.

## Features

- **Multi-Role Authentication**: Secure login for various bank roles with role-based access control (RBAC).
- **Core Banking Operations**: Deposit, withdrawal, transfer, and account management.
- **Loan Management**: Application, processing, and tracking of various loan types.
- **Service Requests**: KYC updates, cheque book requests, and more.
- **Interactive Dashboards**: Real-time insights and management tools for bank staff.

## Technology Stack

- **Frontend**: Next.js, React, Tailwind CSS
- **Backend**: Node.js, Express
- **Database**: Oracle Database
- **Utilities**: `oracledb`, `jsonwebtoken`, `bcrypt`, `nodemailer`, `resend`, `pdfkit`

## Prerequisites

Before running the application, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- **Oracle Database** (locally or a remote instance)
- **Oracle Instant Client** (required by the `oracledb` package)

## Installation and Setup

### 1. Database Setup

1. Connect to your Oracle database.
2. Execute the SQL scripts in the root directory in the following order:
   - `db_setup.sql` (Creates base tables)
   - `db_triggers.sql`
   - `db_procedures_1.sql`
   - `db_procedures_2.sql`
   - `db_loan_procedures.sql`
   - `db_kyc_setup.sql`
   - `db_cheque_setup.sql`
   - `db_deposits_setup.sql`
   - `db_instructions_setup.sql`
   - `db_mis_setup.sql`
   - `db_service_requests_setup.sql`
   - `db_resend_setup.sql`
   - `create_otps_table.sql`
   - `db_seed.sql` (Seeds initial data)
   - `db_final_seed.sql`

Alternatively, you can try running `run_all.sql` if your environment supports it.

### 2. Backend Setup

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `backend` directory with the following variables:
   ```env
   PORT=5000
   DB_USER=your_oracle_user
   DB_PASSWORD=your_oracle_password
   DB_CONNECTION_STRING=your_oracle_connection_string
   JWT_SECRET=your_jwt_secret
   RESEND_API_KEY=your_resend_api_key
   EMAIL_USER=your_email_user
   EMAIL_PASS=your_email_pass
   ```
4. Start the backend server:
   ```bash
   node index.js
   ```

### 3. Frontend Setup

1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## Running the Application

Once both the backend and frontend are running, you can access the application at `http://localhost:3000`.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the ISC License.
