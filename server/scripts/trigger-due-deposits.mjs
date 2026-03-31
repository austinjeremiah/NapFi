/**
 * Calls POST /api/cron/enqueue-schedule-deposits once (same logic as the in-server timer).
 * Requires: API running, NAPFI_DEPOSIT_QUEUE_SOURCE=time, NAPFI_CRON_SECRET in server/.env
 *
 * Usage (from repo root or server/):
 *   cd server && node scripts/trigger-due-deposits.mjs
 */

import "dotenv/config"

const base = (process.env.NAPFI_API_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "")
const secret = process.env.NAPFI_CRON_SECRET?.trim()

if (!secret) {
  console.error(
    "Set NAPFI_CRON_SECRET in server/.env (same value the API uses). Optional: NAPFI_API_URL=http://127.0.0.1:3001"
  )
  process.exit(1)
}

const url = `${base}/api/cron/enqueue-schedule-deposits`
const res = await fetch(url, {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}` },
})

const text = await res.text()
console.log(res.status, text)
if (!res.ok) process.exit(1)
