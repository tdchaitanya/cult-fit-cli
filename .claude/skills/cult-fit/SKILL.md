---
name: cult-fit
description: Interact with Cult.fit via the CLI — browse classes, make or cancel bookings, view your schedule, or run autobook. Use when the user asks about their Cult.fit classes, wants to book or cancel, or asks what's available.
allowed-tools: Bash(cult *)
---

## cult-fit-cli

Unofficial Cult.fit CLI. Requires one-time setup: `cult setup`

### Commands

| Command | Purpose |
|---------|---------|
| `cult centers` | List nearby centers with slot counts |
| `cult classes [filters]` | Browse upcoming classes |
| `cult book <classId>` | Book a class (auto-falls back to waitlist) |
| `cult cancel <bookingRef>` | Cancel a booking |
| `cult bookings` | Your upcoming booked classes |
| `cult info <classId>` | Details on a specific class |
| `cult autobook --center <id> --time <HH:MM:SS>` | Book the next available slot |
| `cult login` | Refresh expired auth token |

### `cult classes` filters
`--center <id>` · `--date YYYY-MM-DD` · `--time HH:MM` · `--workout <name>` · `--available`

### Notes
- Class IDs come from `cult classes` output
- Booking refs (e.g. `HSRVE09NO48F`) come from `cult book` output — needed for `cancel`
- Run `cult centers` to find center IDs near you
- Location and auth token live in `.env`; re-run `cult setup` to reset both
