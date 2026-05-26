# cult-fit-cli

**Unofficial** CLI for browsing, booking, and managing Cult.fit fitness classes via the mobile app's API.

> **Disclaimer:** This project uses Cult.fit's private mobile API without official authorisation and likely violates their Terms of Use (Sections 6.2, 6.5(18)). Account suspension is possible under Section 12.2. Shared for educational purposes. **Use at your own risk.**

## Installation

```bash
npm install -g cult-fit-cli
```

## Setup

Run once after installing:

```bash
cult setup
```

This detects your location via IP geolocation, prompts you to confirm, then authenticates via phone + OTP and writes your token to `.env`. No proxy or manual coordinate lookup needed.

## Commands

### `cult centers`
List nearby centers with slot availability.

### `cult classes`
Browse upcoming classes. Supports filters:

```bash
cult classes                              # all upcoming
cult classes --center 3                   # by center ID
cult classes --date 2026-04-24            # by date
cult classes --time 07:00                 # by start time
cult classes --workout hrx                # by workout name (partial match)
cult classes --available                  # hide full / waitlist-full
cult classes --center 3 --time 07:00 --available
```

### `cult book <classId>`
Books a class; automatically falls back to waitlist if full. The `[BOOKING_REF]` in the output is what you need to cancel.

```bash
cult book 7883216
cult book 7883216 --waitlist-only
```

### `cult cancel <bookingRef>`
```bash
cult cancel HSRVE09NO48F
```

### `cult bookings`
List your upcoming booked classes.

### `cult info <classId>`
Show details for a specific class.

### `cult autobook`
Find and book the next available slot — useful for cron jobs.

```bash
cult autobook --center 3 --time 07:00:00            # book
cult autobook --center 3 --time 07:00:00 --dry-run  # preview
```

### `cult login`
Refresh your auth token when it expires (same OTP flow as `setup`).

## Scheduling

Cult.fit opens booking 4 days in advance. Automate with cron:

```bash
# crontab -e — books 7am at center 3, Sun/Mon/Thu/Fri night (4 days ahead)
30 22 * * 0,1,4,5  cult autobook --center 3 --time 07:00:00
```

## Credits

Started from [arungk703/cultfit-booking-automation](https://github.com/arungk703/cultfit-booking-automation). Rebuilt from scratch with [Claude Code](https://claude.ai/code).
