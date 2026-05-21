# cult-fit-cli

An **unofficial** CLI for browsing, booking, and managing Cult.fit fitness classes via the mobile app's API.

> **Disclaimer:** This project uses Cult.fit's private mobile API without official authorisation. It likely violates Cult.fit's Terms of Use — specifically Section 6.2 (prohibition on automated access) and Section 6.5(18) (prohibition on reverse engineering). Using it may result in account suspension under Section 12.2. This is a personal project shared for educational purposes. **Use at your own risk.**

## How it works

The Cult.fit app communicates with a REST API (`www.cult.fit/api`). This project calls that API directly using an auth token (`AT`) obtained via the official OTP login flow on your own account. No web scraping — pure API calls.

---

## Prerequisites

- Node.js 18+
- A Cult.fit account with an active membership

---

## Installation

**Global install (recommended):**

```bash
npm install -g cult-fit-cli
```

**Or clone and run locally:**

```bash
git clone https://github.com/your-username/cult-fit-cli
cd cult-fit-cli
npm install
```

After cloning, replace `cult` with `node cult.js` in all commands below.

---

## Setup

```bash
cult setup
```

`setup` does everything in one go:
1. **Detects your location** via IP geolocation (no permission needed — uses your public IP) and asks you to confirm (or enter coordinates manually if wrong)
2. **Authenticates your device** via phone + OTP and writes your `AT` token to `.env`

No Charles Proxy, no manual coordinate lookup needed.

```
Detecting your location… detected Bengaluru, Karnataka (12.9634, 77.5855)
Use this location? [Y/n]:
✓ Location saved (12.9634, 77.5855)

Authenticating device… done
Phone number (10 digits, no country code): <your-phone-number>
Sending OTP… done
Enter OTP: <otp>
Verifying… done

✓ .env updated (AT + ENCRYPTED_DEVICE_ID)

Setup complete. Try: cult classes
```

If location detection fails or you want a different location, you can always edit `LAT`/`LON` in `.env` directly, then run `cult centers` to find the center IDs near you.

---

## CLI reference

### `centers` — discover nearby centers

```bash
cult centers
```
```
ID      CENTER                          TOTAL   OPEN    BOOKED
────────────────────────────────────────────────────────────────
3       Cult HSR 19th Main              40      29      3
220     Cult HSR 24th Main              106     84      0
267     Cult HSR 14th Main              76      57      0
```

### `classes` — browse available classes

```bash
cult classes                              # all upcoming classes
cult classes --center 3                   # filter by center ID
cult classes --date 2026-04-24            # filter by date
cult classes --time 07:00                 # filter by start time
cult classes --workout hrx                # workout name (partial match)
cult classes --available                  # hide full / waitlist-full
cult classes --no-names                   # skip center name lookup (faster)
cult classes --center 3 --time 07:00 --available   # combine filters
```

### `book` — book a class

Tries to book; automatically falls back to waitlist if full. Note the booking number in `[brackets]` — you need it to cancel.

```bash
cult book 7883216
# Booked: Tue, 21 Apr • 9:00 PM - 9:50 PM @ Cult HSR 19th Main [HSRVE09NO48F]

cult book 7883216 --waitlist-only         # join waitlist directly
```

### `cancel` — cancel a booking

```bash
cult cancel HSRVE09NO48F
# Class Cancelled — HSRVE09NO48F
```

### `bookings` — list your upcoming booked classes

```bash
cult bookings
```

### `info` — show details for a specific class

```bash
cult info 7883216
```

### `autobook` — find and book the next available slot

Useful for cron jobs or manual one-shot booking — finds the furthest-out date, locates your center+time slot, and books it (falls back to waitlist if full).

```bash
cult autobook --center 3 --time 07:00:00            # book for real
cult autobook --center 3 --time 07:00:00 --dry-run  # preview only
```

Run `cult centers` to find your center ID.

### `setup` — first-time token setup

Run once after installing (see [Setup](#setup) above).

### `login` — refresh your AT token

Run this whenever your token expires:

```bash
cult login
# Authenticating device… done
# Phone number (10 digits, no country code): <your-phone-number>
# Sending OTP… done
# Enter OTP: <otp>
# Verifying… done
#
# ✓ .env updated (AT + ENCRYPTED_DEVICE_ID)
```

Same 3-step flow as `setup` — sends an OTP to your phone, exchanges it for a fresh `AT`, and updates `.env`.

---

## Scheduling (optional)

Cult.fit opens booking 4 days in advance. Use `autobook` with any system scheduler to book a recurring slot automatically. For example, to book a 7am class at center 3 every night at 10:30pm IST:

```bash
# Run `crontab -e` and add:
30 22 * * 0,1,4,5  cd /path/to/cult-fit-cli && cult autobook --center 3 --time 07:00:00
```

The days `0,1,4,5` (Sun/Mon/Thu/Fri) book 4 days ahead for Mon/Tue/Fri/Sat. Adjust to match your workout days. Run `cult centers` to find your center ID.

---

## What's hardcoded and when it matters

| Value | Where | When to update |
|-------|-------|----------------|
| `DEVICE_INFO.deviceId` | `.env` (`DEVICE_ID`, set by `setup`) | Generated automatically on first run |
| `DEVICE_INFO.encryptedDeviceId` | `.env` (`ENCRYPTED_DEVICE_ID`, set by `setup`, refreshed by `login`) | Updated automatically — never edit manually |
| `lat` / `lon` | `.env` (`LAT` / `LON`) | Set to coordinates near your gym |
| `clientversion` / `user-agent` | `cult.js` headers | Only if Cult.fit blocks old app versions (unlikely) |
| `fromWidgetId` | `cult.js` listing params | Stable UI widget ref — unlikely to ever need changing |

### Changing location

Update `LAT` and `LON` in your `.env` file to coordinates near your gym, then run `cult centers` to find the center IDs near you.

---

## Credits

This project started from [arungk703/cultfit-booking-automation](https://github.com/arungk703/cultfit-booking-automation). The CLI and API integration were rebuilt from scratch with [Claude Code](https://claude.ai/code) to work with Cult.fit's current authentication flow and API structure.
