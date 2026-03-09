# Suraksha Bank Implementation Plan

## Goal Description
Build the "Suraksha Bank - Safe Vault System" based on the provided Architecture Design Document and role access layout. The project will be a 3-tier web application consisting of a Next.js frontend, a Node.js API backend, and an Oracle 21c Database. The goal is to implement **all pages with Role-Based Access Control (RBAC)** exactly as defined in the [suraksha_bank_roles.html](file:///c:/Users/admin/Desktop/Antigravity_workspace/DBMS/suraksha_bank_roles.html) document for the four roles: Customer, Teller, Branch Manager, and System Admin.

## User Review Required
> [!IMPORTANT]
> **Oracle Database Connection Credentials**: Since you are using a local Oracle Database, I will need the connection details to configure the Node.js backend. Please provide the following:
> 1. Database Username
> 2. Database Password
> 3. Connection String (e.g., `localhost/XEPDB1` or `localhost:1521/XE` or `localhost:1521/ORCLCDB`)
> 
> *Note: I will set these up in a `.env` file once you provide them.*

> [!CAUTION]
> **Styling Approach**: The architecture document mentions Tailwind CSS. However, to achieve the most premium, Apple-grade visual aesthetics you usually prefer (with glassmorphism, dynamic animations, and vibrant dark modes like the UI mockup), I plan to use Vanilla CSS / CSS Modules. The mockups show a very specific `Navy, Navy2, Gold, Gold2, Cream, Cream2` color palette. If you are okay with Vanilla CSS, we will proceed with that. Let me know if you strictly prefer Tailwind CSS (and which version).

## Proposed Changes

### Database Tier (Oracle 21c)
- **Schema Creation**: Create the 17 normalized tables. This includes the new loan tables: `LOAN_APPLICATIONS` (with app ID, requested amounts, status), `LOAN_ACCOUNTS` (with disbursed amounts, outstanding principal), `EMI_SCHEDULE` (with exact row-per-instalment due dates and amounts), and `LOAN_PAYMENTS` (immutable ledger of payments).
- **Stored Procedures**: Implement atomic procedures with `SERIALIZABLE` isolation: `sp_internal_transfer`, `sp_initiate_external_transfer`, `sp_deposit`, `sp_withdraw`, `sp_open_account`, `sp_submit_dual_approval`, `sp_approve_dual_queue`, `sp_set_account_status`, `sp_approve_external_transfer`, `sp_reject_external_transfer`, `sp_generate_statement`.
  - **Loan Lifecycle Procedures**: Implement `sp_generate_emi_schedule`, `sp_disburse_loan` (with auto-execution vs. DUAL_APPROVAL_QUEUE escalation logic), `sp_record_emi_payment` (with deterministic penalty calculation via due date, calling `sp_withdraw` via definer-rights), `sp_close_loan` (with zero outstanding check), `sp_update_loan_status` (state machine enforcement), and `sp_mark_loan_overdue` (for daily scheduler).
- **Triggers**: Implement audit triggers like `trg_audit_balance_change`, `trg_audit_status_change`, and `trg_audit_loan_status`.
- **Initialization Script**: Create a `db_setup.sql` script to bootstrap the schema, roles, and dummy seed data. Update `EMPLOYEES.role` constraint to include `LOAN_MANAGER`. Ensure `LOAN_MANAGER` has NO direct access to `ACCOUNTS` or `TRANSACTIONS` tables.

### Backend Tier (Node.js + Express)
#### [NEW] backend/
- Initialize Node.js project (`express`, `oracledb`, `cors`, `dotenv`, `joi`, `bcrypt`).
- **Authentication & RBAC**: Implement a session token middleware that verifies the user's role against the `USER_SESSIONS` and `PERMISSION_MATRIX`.
- **API Routes**:
  - `/api/auth`: Login, Logout, Session validation.
  - `/api/customer`: Endpoints for self-service portal (own accounts, internal/external transfers, statements).
  - `/api/teller`: Branch-scoped operations (queue, deposit, withdrawal, open account).
  - `/api/manager`: Branch-wide authority (approval queue, account lifecycle, settle transfers, branch reports).
  - `/api/loan-manager`: Specialist role for complete loan lifecycle (applications, EMI tracking, disbursement).
  - `/api/admin`: System-wide (system monitor, user/branch management, configuration).

### Frontend Tier (Next.js)
#### [NEW] frontend/
- Initialize Next.js (App Router).
- **Global Styles & Layout**: Implement the premium aesthetic based on the HTML mockup (Navy/Gold theme, glassmorphism, DM Sans/DM Mono fonts).
- **Authentication**: `frontend/src/app/login/page.js` with role selection.
- **RBAC Routing**: Higher-order components or layout wrappers to restrict access based on the logged-in user's role.

#### Page Implementations
1. **Customer Portal (8 Pages)**:
   - Dashboard, My Accounts, Internal Transfer, External Transfer, Statements, Profile & Security, Contact Branch.
2. **Teller Portal (13 Pages)**:
   - Counter Queue, Cash Deposit, Cash Withdrawal, Open New Account, Customer Lookup, Print Statement, Submit to Queue, Branch Reports (partial).
3. **Manager Portal (18 Pages)**:
   - Branch Overview Dashboard, Dual Approval Queue, Account Management, Settle External Transfers, Branch Audit Log, Compliance Flags, Full Branch Reports, Staff Management, Batch Job Status.
4. **Loan Manager Portal (Dashboard + Core Views)**:
   - **Loan Dashboard**: Overview of portfolio for the branch (e.g., "Loan Portfolio — Mumbai Central"), showing metrics like: Active Loans (count & value disbursed), Pending Review (awaiting terms setup), EMIs Due Today (count & total value), Closed This Month. A data table listing Loan ID, Customer, Type, Outstanding balance, and Status tags (e.g., Active, Pending Disburse, EMI Overdue). Quick action buttons: `New Application`, `Record Repayment`.
   - **New Application**: Setup form linking an existing customer, setting loan type (Personal, Home, Vehicle, Education), requested amount, tenure, and purpose.
   - **Applications**: View and update status tracking (RECEIVED → UNDER_REVIEW → APPROVED).
   - **EMI Schedules**: Interface to preview and generate `sp_generate_emi_schedule` before disbursement.
   - **Record Repayment**: UI to select an EMI and record payment against it. Shows deterministic penalty amounts based on due date.
   - **Submit Disbursement**: Interface to view APPROVED loans and trigger disbursement (handles auto-execution or escalation to manager queue).
   - **Loan Search & Reports**: Read-only views of loans by customer, type, status, outstanding portfolio, overdue EMIs, and repayment history.
   - Note: Savings/Current ops, Dual Approval execution, and System Config are strictly restricted/hidden.
5. **Admin Console (Live Data Implementation)**:
   - **System Monitor Dashboard**: Live API hitting `v$session`, `v$instance` (or `USER_TABLES` for storage stats if unprivileged) and aggregation of system activity.
   - **User Management**: Live CRUD interface securely updating the `USERS`, `CUSTOMERS`, and `EMPLOYEES` tables.
   - **Branch Management**: Live CRUD operations on the `BRANCHES` table.
   - **System Config**: UI modifying exact rows in `SYSTEM_CONFIG` with immediate DB commits.
   - **Global Audit Log**: Detailed read-only view of `AUDIT_LOG` and `PROCEDURE_EXECUTION_LOG`.
   - **Role & Permissions**: Dashboard over employee `ROLE` distributions and access tracking.
   - **Scheduler Monitor**: Real-time view on `ACCRUAL_BATCH_CONTROL`, `INTEREST_ACCRUAL_LOG` and `sp_mark_loan_overdue` execution.
   - **Backup & Recovery Status**: Showing live storage capacity metrics, objects count, and RMAN status via dictionary views (or user schema objects contextually). 
*(Note: As strictly requested, zero mock arrays will be used. Everything flows through actual Oracle table rows and dictionary queries).*

## Verification Plan
1. **Database Setup**: Execute the `db_setup.sql`.
2. **Backend Connection & Logic**: Run Node.js and verify Oracle DB connectivity. Use Jest/Supertest to test API RBAC rules (e.g., ensuring a Customer token gets a 403 on a Teller endpoint).
3. **Frontend Implementation**: Run Next.js. Log in with different dummy accounts (Customer, Teller, Manager, Admin, Loan Manager) and verify the Navigation menu restricts and allows access accurately according to [suraksha_bank_roles.html](file:///c:/Users/admin/Desktop/Antigravity_workspace/DBMS/suraksha_bank_roles.html).
4. **Loan Manager Verification**:
   - Create a loan application and ensure it uses correct `LOAN_MANAGER` endpoints.
   - Disburse a loan under threshold and check the database.
   - Disburse a high-value loan and ensure it accurately escalates to the `DUAL_APPROVAL_QUEUE` for Branch Manager.
