# Implementation Plan for Multi-Tenant Auth Module

This document outlines the architecture, database schema changes, backend implementation, and frontend scaffolding needed to build a production-ready authentication module for the Central Kitchen SaaS platform.

## User Review Required
> [!IMPORTANT]
> The original Prisma schema in the backend had `provider = "postgresql"`, but your requirement states `Database: MySQL`. I will update the Prisma schema to use MySQL. Please confirm if this is correct.

> [!WARNING]
> Since we need a `restaurants` reference for `restaurant_users`, I will create a minimal `restaurants` model stub in the schema to satisfy foreign key constraints. 

> [!CAUTION]
> The `backend` directory is missing TypeScript support and development dependencies (like `@types/express`, `typescript`, `ts-node`). I will initialize a proper TypeScript Express environment. Please confirm.

## Open Questions
- Do you want to use a specific email provider for Nodemailer (e.g., SendGrid, AWS SES, SMTP), or just a generic SMTP/Ethereal mock for development?
- For the frontend, I'll scaffold a new React + Vite + TypeScript project. Do you want it inside a `frontend` folder at the root level (`/home/ubuntu/Downloads/Central-Kitchen-Management/frontend`)?
- Should the frontend include a full Dashboard layout or just the authentication flows (Login, Forgot Password, Tenant Resolution)?

## Proposed Changes

### 1. Database & Prisma (MySQL)
I will update `backend/prisma/schema.prisma` with the following models:
- **Tenant Isolation:** `Tenant`
- **Users:** `User`, `RestaurantUser` (along with a stub `Restaurant`)
- **Roles & Permissions:** `Role`, `Permission`, `RolePermission`
- **Authentication & Security:** `PasswordResetToken`, `OtpCode`, `LoginAttempt`, `RefreshToken`, `DeviceSession`

### 2. Backend Architecture (Node.js + Express + TypeScript)
- **Scaffolding:** Initialize TypeScript configuration and directory structure (`src/controllers`, `src/routes`, `src/middlewares`, `src/services`, `src/utils`).
- **Middlewares:** 
  - `tenantMiddleware`: Extracts and validates tenant from requests.
  - `authMiddleware`: Validates JWT access tokens.
  - `rbacMiddleware`: Checks required permissions against `RolePermission`.
- **Controllers & Routes:** Implement the specified API endpoints:
  - `/auth/resolve-tenant`, `/auth/login`, `/auth/signup`, `/auth/logout`, etc.
  - `/users`, `/restaurants/:id/users`, `/roles`, `/permissions`, `/login-attempts`
- **Services:**
  - Token generation & refresh logic (JWT).
  - Password hashing (bcrypt).
  - Emailing & OTP generation (Nodemailer).

### 3. Frontend Scaffolding (React + Vite + TypeScript)
- **Setup:** Run `npx create-vite frontend --template react-ts` in the root folder.
- **Styling:** Develop a modern, glassmorphism-based, highly polished vanilla CSS framework (`index.css`) emphasizing micro-animations and rich colors.
- **Components:**
  - Tenant resolution dropdown.
  - Login form with email/mobile and password.
  - OTP / Forgot password flows.
- **State & Routing:** Setup React Router for navigation and a simple React Context / Zustand store for holding auth state and tenant context.

## Verification Plan
### Automated Tests
- Type-checking with `tsc`.
- Build process for Vite (`npm run build`).

### Manual Verification
- Seed the database with initial permissions and a Super Admin role.
- Start the Express server and use Swagger UI or Thunder Client / Postman to verify auth endpoints.
- Start the Vite dev server and verify the multi-tenant login flow on the browser.
