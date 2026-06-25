# OptiManage Desktop

A point-of-sale and shop-management desktop app for opticians. Manage customers,
prescriptions, orders, inventory, payments and expenses from a single Windows
app — with full **offline support** and automatic background sync to the cloud.

Built with Electron + React + TypeScript. Data lives in PostgreSQL (Supabase),
mirrored locally in SQLite so the shop keeps working when the internet drops.

## Features

- **Customers & Prescriptions** — patient records and full optical prescriptions (sphere, cylinder, axis, add, PD).
- **Orders** — build orders from frames + lens types/addons, print invoices (factures), order slips and receipts.
- **Quick Sale** — fast over-the-counter checkout.
- **Inventory** — frames, lens types, lens addons and contact lenses, with barcode support.
- **Payments & Expenses** — track installments, balances and shop expenses.
- **Dashboard** — revenue charts and lens summaries.
- **Barcode scanning** — camera scanner plus a phone-as-scanner bridge (mobile companion app over WebSocket).
- **Offline-first** — every action is queued locally and synced when back online; offline order numbers are preserved and never duplicated.
- **Users & roles** — multi-user login with bcrypt-hashed credentials.
- **Auto-updates** — ships signed Windows installers via `electron-updater` + GitHub releases.

## Tech Stack

| Layer | Tech |
|------|------|
| Desktop shell | Electron 33 |
| UI | React 18, React Router, Tailwind CSS, Radix UI, Framer Motion |
| Build | Vite 6, electron-builder |
| Cloud DB | PostgreSQL (Supabase) via Prisma |
| Local cache | better-sqlite3 |
| Sync / realtime | custom sync manager, `ws`, Supabase JS |
| Monitoring | Sentry, pino |

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase / PostgreSQL database

### Setup

```bash
git clone https://github.com/techvibedz/optimanage-desktop.git
cd optimanage-desktop
npm install
```

Create a `.env` from the example and fill in your credentials:

```bash
cp .env.example .env
```

```env
# Supabase (client)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Prisma (database)
DATABASE_URL=postgresql://...
DIRECT_DATABASE_URL=postgresql://...
```

Apply the schema:

```bash
npx prisma generate
npx prisma migrate deploy
```

### Run in development

```bash
npm run electron:dev
```

Starts Vite on `http://localhost:5173` and launches Electron once it's ready.

### Build a Windows installer

```bash
npm run electron:build      # build NSIS installer into ./release
npm run publish             # build and publish to GitHub releases
```

## Project Structure

```
electron/        Main process: window, local SQLite cache, sync manager, logging
src/
  pages/         Screens (Dashboard, Orders, Customers, Inventory, ...)
  components/    UI, layout, print templates, barcode scanner
  lib/           Auth + settings contexts, helpers
prisma/          PostgreSQL schema (Customer, Prescription, Order, Payment, ...)
```

## License

Private / proprietary. All rights reserved.
