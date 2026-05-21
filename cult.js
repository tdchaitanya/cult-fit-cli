#!/usr/bin/env node
require('dotenv').config();
const axios = require('axios');
const { Command } = require('commander');

const BASE_URL = 'https://www.cult.fit';

const crypto = require('crypto');

// Device identity — stored in .env and managed by `setup` / `login`.
const DEVICE_INFO = {
    appId: 'fit.cure.ios',
    bundleId: 'fit.cure.ios',
    deviceId: process.env.DEVICE_ID || crypto.randomUUID().toUpperCase(),
    osName: 'iOS',
    brand: 'Apple',
    model: 'iPhone',
    osVersion: '26.3.1',
    encryptedDeviceId: process.env.ENCRYPTED_DEVICE_ID,
};

const headers = {
    'at': process.env.AT,
    'clientversion': '11.69',
    'user-agent': 'CureFit/906902 CFNetwork/3860.400.51 Darwin/25.3.0',
    'appsource': 'flutter',
    'microappversion': '4.0.0',
    'deviceid': DEVICE_INFO.deviceId,
    'encrypteddeviceid': DEVICE_INFO.encryptedDeviceId,
    'devicemodel': 'iPhone',
    'devicebrand': 'apple',
    'osname': 'ios',
    'timezone': 'IST',
    'x-tenant-id': 'curefit',
    'lat': process.env.LAT,
    'lon': process.env.LON,
    'accept': 'application/json',
    'accept-language': 'en-IN,en;q=0.9',
    'content-type': 'application/json; charset=utf-8',
};

const BOOKING_BODY = { productType: 'FITNESS', operatingSystemVersion: '26.3.1' };

// setup prompts for location interactively, so allow it through without LAT/LON
if (process.argv[2] !== 'setup' && (!process.env.LAT || !process.env.LON)) {
    console.error('Error: LAT and LON not set — run: cult setup');
    process.exit(1);
}

// ── API helpers ──────────────────────────────────────────────────────────────

async function fetchListing() {
    const res = await axios.get(`${BASE_URL}/api/v2/cult/classes/v2`, {
        headers,
        params: {
            productType: 'FITNESS', centerId: '', centerServiceId: '',
            isPilateGymPage: 'false', pageFrom: 'addActivity',
            fromWidgetId: 'b507aee2-7300-41b0-a6c7-c41167ec7284',
        },
    });
    return res.data?.classByDateMap ?? {};
}

async function fetchClassDetail(classId) {
    const res = await axios.get(`${BASE_URL}/api/cult/class/v3/${classId}`, { headers });
    return res.data;
}

// Flatten dateMap into a list of class rows with resolved date/time
function flattenClasses(dateMap) {
    const rows = [];
    for (const [date, day] of Object.entries(dateMap)) {
        for (const slot of day.classByTimeList ?? []) {
            for (const center of slot.centerWiseClasses ?? []) {
                for (const cls of center.classes ?? []) {
                    rows.push({
                        date,
                        time: slot.id,
                        centerId: center.centerId,
                        classId: cls.id,
                        workout: cls.workoutName,
                        seats: cls.availableSeats,
                        state: cls.state,
                        waitlisted: cls.waitlistInfo?.waitlistedUserCount ?? null,
                    });
                }
            }
        }
    }
    return rows.sort((a, b) => `${a.date}${a.time}` < `${b.date}${b.time}` ? -1 : 1);
}

// Resolve center names for unique centerIds (parallel fetch of one class each)
async function resolveCenterNames(rows) {
    const centerMap = {};
    const uniqueCenters = [...new Set(rows.map(r => r.centerId))];
    await Promise.all(uniqueCenters.map(async (centerId) => {
        const sample = rows.find(r => r.centerId === centerId);
        try {
            const detail = await fetchClassDetail(sample.classId);
            // Center name appears in widget or analyticsData
            const name =
                detail.widgets?.find(w => w.centerName)?.centerName ||
                detail.widgets?.flatMap(w => w.products ?? [])
                    .find(p => p.analyticsData?.workoutCenterId === centerId)
                    ?.analyticsData?.workoutCenter ||
                `Center ${centerId}`;
            centerMap[centerId] = name;
        } catch {
            centerMap[centerId] = `Center ${centerId}`;
        }
    }));
    return centerMap;
}

// ── Formatting ───────────────────────────────────────────────────────────────

const STATE_LABEL = {
    AVAILABLE: '✓ available',
    WAITLIST_AVAILABLE: '⏳ waitlist',
    WAITLIST_FULL: '✗ waitlist full',
    BOOKED: '★ booked',
};

function stateLabel(row) {
    const label = STATE_LABEL[row.state] ?? row.state;
    if (row.state === 'WAITLIST_AVAILABLE') return `${label} (${row.waitlisted} ahead)`;
    if (row.state === 'AVAILABLE') return `${label} (${row.seats} seats)`;
    return label;
}

function col(str, width) {
    const s = String(str ?? '');
    return s.length >= width ? s.slice(0, width - 1) + '…' : s.padEnd(width);
}

function printTable(rows, centerMap) {
    const header = `${'DATE'.padEnd(12)}${'TIME'.padEnd(10)}${'CENTER'.padEnd(28)}${'WORKOUT'.padEnd(26)}${'STATUS'.padEnd(28)}CLASS ID`;
    console.log('\n' + header);
    console.log('─'.repeat(header.length + 8));
    for (const r of rows) {
        const centerName = centerMap?.[r.centerId] ?? `Center ${r.centerId}`;
        console.log(
            col(r.date, 12) +
            col(r.time.slice(0, 5), 10) +
            col(centerName, 28) +
            col(r.workout, 26) +
            col(stateLabel(r), 28) +
            r.classId
        );
    }
    console.log(`\n${rows.length} class(es)\n`);
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const program = new Command();

program
    .name('cult')
    .description('Cult.fit class browser & booking CLI')
    .version('1.0.0');

program
    .command('classes')
    .description('List nearby classes')
    .option('-d, --date <YYYY-MM-DD>', 'Filter by date')
    .option('-c, --center <id>', 'Filter by center ID', parseInt)
    .option('-t, --time <HH:MM>', 'Filter by start time')
    .option('-w, --workout <name>', 'Filter by workout name (case-insensitive)')
    .option('-a, --available', 'Only show bookable classes (available or waitlist)')
    .option('--no-names', 'Skip center name resolution (faster)')
    .action(async (opts) => {
        try {
            const dateMap = await fetchListing();
            let rows = flattenClasses(dateMap);

            if (opts.date)    rows = rows.filter(r => r.date === opts.date);
            if (opts.center)  rows = rows.filter(r => r.centerId === opts.center);
            if (opts.time)    rows = rows.filter(r => r.time.startsWith(opts.time));
            if (opts.workout) rows = rows.filter(r => r.workout?.toLowerCase().includes(opts.workout.toLowerCase()));
            if (opts.available) rows = rows.filter(r => r.state === 'AVAILABLE' || r.state === 'WAITLIST_AVAILABLE');

            if (rows.length === 0) { console.log('No classes match.'); return; }

            let centerMap = null;
            if (opts.names !== false) {
                process.stdout.write('Resolving center names…');
                centerMap = await resolveCenterNames(rows);
                process.stdout.write('\r' + ' '.repeat(30) + '\r');
            }

            printTable(rows, centerMap);
        } catch (err) {
            die(err);
        }
    });

program
    .command('centers')
    .description('List nearby centers with class counts')
    .action(async () => {
        try {
            const dateMap = await fetchListing();
            const rows = flattenClasses(dateMap);

            const byCenter = {};
            for (const r of rows) {
                if (!byCenter[r.centerId]) byCenter[r.centerId] = { total: 0, available: 0, booked: 0 };
                byCenter[r.centerId].total++;
                if (r.state === 'AVAILABLE') byCenter[r.centerId].available++;
                if (r.state === 'BOOKED') byCenter[r.centerId].booked++;
            }

            process.stdout.write('Resolving center names…');
            const centerMap = await resolveCenterNames(rows);
            process.stdout.write('\r' + ' '.repeat(30) + '\r');

            console.log('\n' + 'ID'.padEnd(8) + 'CENTER'.padEnd(32) + 'TOTAL'.padEnd(8) + 'OPEN'.padEnd(8) + 'BOOKED');
            console.log('─'.repeat(64));
            for (const [id, stats] of Object.entries(byCenter)) {
                console.log(
                    String(id).padEnd(8) +
                    col(centerMap[id] ?? `Center ${id}`, 32) +
                    String(stats.total).padEnd(8) +
                    String(stats.available).padEnd(8) +
                    stats.booked
                );
            }
            console.log();
        } catch (err) {
            die(err);
        }
    });

program
    .command('book <classId>')
    .description('Book a class (joins waitlist if full)')
    .option('--waitlist-only', 'Join waitlist directly without trying to book first')
    .action(async (classId, opts) => {
        try {
            if (opts.waitlistOnly) {
                const res = await axios.post(`${BASE_URL}/api/cult/class/${classId}/waitlist`, BOOKING_BODY, { headers });
                console.log('Joined waitlist:', extractConfirmation(res.data));
                return;
            }
            try {
                const res = await axios.post(`${BASE_URL}/api/cult/class/${classId}/book`, BOOKING_BODY, { headers });
                console.log('Booked:', extractConfirmation(res.data));
            } catch (bookErr) {
                const isFull = bookErr.response?.status === 409 ||
                    JSON.stringify(bookErr.response?.data ?? '').toLowerCase().includes('full');
                if (isFull) {
                    console.log('Class full — joining waitlist…');
                    const res = await axios.post(`${BASE_URL}/api/cult/class/${classId}/waitlist`, BOOKING_BODY, { headers });
                    console.log('Joined waitlist:', extractConfirmation(res.data));
                } else {
                    throw bookErr;
                }
            }
        } catch (err) {
            die(err);
        }
    });

program
    .command('autobook')
    .description('Find and book the next available slot matching center + time')
    .requiredOption('-c, --center <id>', 'Center ID to book at', parseInt)
    .requiredOption('-t, --time <HH:MM:SS>', 'Target start time (24h with seconds, e.g. 07:00:00)')
    .option('-n, --dry-run', 'Print what would be booked without actually booking')
    .action(async (opts) => {
        try {
            const dateMap = await fetchListing();
            const dates = Object.keys(dateMap).sort();
            if (dates.length === 0) throw new Error('No dates in listing response');

            const lastDate = dates[dates.length - 1];
            const lastDay = dateMap[lastDate];
            console.log(`Last available date: ${lastDate}`);

            const slot = lastDay.classByTimeList?.find(t => t.id === opts.time);
            if (!slot) throw new Error(`No ${opts.time} slot on ${lastDate}. Available: ${lastDay.classByTimeList?.map(t => t.id).join(', ')}`);

            const centerEntry = slot.centerWiseClasses?.find(c => c.centerId === opts.center);
            if (!centerEntry) {
                const ids = slot.centerWiseClasses?.map(c => c.centerId).join(', ');
                throw new Error(`Center ${opts.center} not in ${opts.time} slot on ${lastDate}. Available center IDs: ${ids}`);
            }

            const cls = centerEntry.classes?.[0];
            if (!cls) throw new Error('No class found in center entry');

            console.log(`Target: ${lastDate} ${opts.time} — class ${cls.id} (${cls.state}${cls.state === 'WAITLIST_AVAILABLE' ? `, ${cls.waitlistInfo?.waitlistedUserCount} ahead` : ''})`);

            if (opts.dryRun) { console.log('Dry run — skipping booking'); return; }

            try {
                const res = await axios.post(`${BASE_URL}/api/cult/class/${cls.id}/book`, BOOKING_BODY, { headers });
                console.log('Booked:', extractConfirmation(res.data));
            } catch (bookErr) {
                const isFull = bookErr.response?.status === 409 ||
                    JSON.stringify(bookErr.response?.data ?? '').toLowerCase().includes('full');
                if (isFull) {
                    console.log('Class full — joining waitlist…');
                    const res = await axios.post(`${BASE_URL}/api/cult/class/${cls.id}/waitlist`, BOOKING_BODY, { headers });
                    console.log('Waitlisted:', extractConfirmation(res.data));
                } else {
                    throw bookErr;
                }
            }
        } catch (err) {
            die(err);
        }
    });

program
    .command('cancel <bookingNumber>')
    .description('Cancel a booking by booking number (shown in brackets when you book)')
    .action(async (bookingNumber) => {
        try {
            const res = await axios.post(
                `${BASE_URL}/api/cult/booking/v2/${bookingNumber}/cancel`,
                { productType: null },
                { headers }
            );
            const title = res.data?.alertInfo?.title ?? 'Cancelled';
            console.log(`${title} — ${bookingNumber}`);
        } catch (err) {
            die(err);
        }
    });

program
    .command('bookings')
    .description('List your upcoming booked classes')
    .action(async () => {
        try {
            const dateMap = await fetchListing();
            const rows = flattenClasses(dateMap).filter(r => r.state === 'BOOKED');
            if (rows.length === 0) { console.log('No upcoming bookings.'); return; }
            process.stdout.write('Resolving center names…');
            const centerMap = await resolveCenterNames(rows);
            process.stdout.write('\r' + ' '.repeat(30) + '\r');
            printTable(rows, centerMap);
            console.log('To cancel: cult cancel <bookingNumber>');
            console.log('(Booking numbers are shown in [brackets] when you book via this CLI)');
        } catch (err) {
            die(err);
        }
    });

async function promptLocation() {
    const readline = require('readline');
    const fs = require('fs');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise(resolve => rl.question(q, resolve));

    let lat, lon;

    try {
        process.stdout.write('Detecting your location… ');
        const res = await axios.get('http://ip-api.com/json', { timeout: 5000 });
        if (res.data?.status === 'success') {
            lat = String(res.data.lat);
            lon = String(res.data.lon);
            const place = [res.data.city, res.data.regionName].filter(Boolean).join(', ');
            console.log(`detected ${place} (${lat}, ${lon})`);
            const answer = await ask('Use this location? [Y/n]: ');
            if (answer.trim().toLowerCase() === 'n') { lat = null; lon = null; }
        } else {
            console.log('could not detect');
        }
    } catch {
        console.log('could not detect');
    }

    if (!lat || !lon) {
        console.log("Find your coordinates at https://maps.google.com (right-click → \"What's here?\")");
        lat = (await ask('Latitude: ')).trim();
        lon = (await ask('Longitude: ')).trim();
    }

    rl.close();

    const envPath = `${__dirname}/.env`;
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    const setEnv = (content, key, value) =>
        content.includes(`${key}=`)
            ? content.replace(new RegExp(`^${key}=.*`, 'm'), `${key}=${value}`)
            : content.trimEnd() + `\n${key}=${value}`;
    envContent = setEnv(envContent, 'LAT', lat);
    envContent = setEnv(envContent, 'LON', lon);
    fs.writeFileSync(envPath, envContent.trimStart());

    // update in-memory state for this session
    process.env.LAT = lat;
    process.env.LON = lon;
    headers.lat = lat;
    headers.lon = lon;

    console.log(`✓ Location saved (${lat}, ${lon})\n`);
}

async function runAuthFlow(deviceInfo) {
    const readline = require('readline');
    const fs = require('fs');
    const { execSync } = require('child_process');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise(resolve => rl.question(q, resolve));
    const authHeaders = { ...headers, at: undefined };

    try {
        process.stdout.write('Authenticating device… ');
        const deviceRes = await axios.post(`${BASE_URL}/api/auth/deviceLogin`,
            { deviceInfo },
            { headers: authHeaders }
        );
        const anonymousAt = deviceRes.data?.session?.at;
        if (!anonymousAt) throw new Error('deviceLogin did not return a session token');
        console.log('done');

        const phone = await ask('Phone number (10 digits, no country code): ');
        process.stdout.write('Sending OTP… ');
        await axios.post(`${BASE_URL}/api/auth/loginPhoneSendOtp`, {
            phone: phone.trim(), medium: 'sms', countryCallingCode: '+91', deviceInfo,
        }, { headers: { ...authHeaders, at: anonymousAt } });
        console.log('done');

        const otp = await ask('Enter OTP: ');
        rl.close();

        process.stdout.write('Verifying… ');
        const verifyRes = await axios.post(`${BASE_URL}/api/auth/loginPhoneVerifyOtp`, {
            phone: phone.trim(), otp: otp.trim(), countryCallingCode: '+91',
            captchaResponse: null, deviceInfo,
        }, { headers: { ...authHeaders, at: anonymousAt } });

        const newAt = verifyRes.data?.session?.at;
        const newEncryptedDeviceId = verifyRes.data?.session?.encryptedDeviceId ?? deviceInfo.encryptedDeviceId;
        if (!newAt) {
            console.error('\nCould not find AT in response:', JSON.stringify(verifyRes.data, null, 2));
            process.exit(1);
        }
        console.log('done\n');

        const envPath = `${__dirname}/.env`;
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
        const setEnv = (content, key, value) =>
            content.includes(`${key}=`)
                ? content.replace(new RegExp(`^${key}=.*`, 'm'), `${key}=${value}`)
                : content.trimEnd() + `\n${key}=${value}`;
        envContent = setEnv(envContent, 'AT', newAt);
        if (newEncryptedDeviceId) envContent = setEnv(envContent, 'ENCRYPTED_DEVICE_ID', newEncryptedDeviceId);
        if (!process.env.DEVICE_ID) envContent = setEnv(envContent, 'DEVICE_ID', deviceInfo.deviceId);
        fs.writeFileSync(envPath, envContent.trimStart());
        console.log('✓ .env updated (AT + ENCRYPTED_DEVICE_ID)');

        try {
            const repo = execSync('gh repo view --json nameWithOwner -q .nameWithOwner', { encoding: 'utf8' }).trim();
            execSync(`echo "${newAt}" | gh secret set AT --repo ${repo}`, { stdio: ['pipe', 'inherit', 'inherit'] });
            console.log(`✓ GitHub secret AT updated (${repo})`);
        } catch {
            console.log('  (gh CLI not available — update GitHub secret manually with the token below)');
        }

        console.log(`\nNew token: ${newAt}`);
    } catch (err) {
        rl.close();
        if (err.response?.status === 400 || err.response?.status === 401) {
            console.error('\nAuth failed:', err.response.data?.message ?? JSON.stringify(err.response.data));
            process.exit(1);
        }
        throw err;
    }
}

program
    .command('setup')
    .description('First-time setup: detect location, then authenticate via phone + OTP')
    .action(async () => {
        const { encryptedDeviceId: _omit, ...coldDeviceInfo } = DEVICE_INFO;
        try {
            if (!process.env.LAT || !process.env.LON) await promptLocation();
            await runAuthFlow(coldDeviceInfo);
            console.log('\nSetup complete. Try: cult classes');
        } catch (err) { die(err); }
    });

program
    .command('login')
    .description('Refresh AT token via phone + OTP')
    .action(async () => {
        try {
            await runAuthFlow(DEVICE_INFO);
        } catch (err) { die(err); }
    });

program
    .command('info <classId>')
    .description('Show details for a specific class')
    .action(async (classId) => {
        try {
            const detail = await fetchClassDetail(classId);
            const widget = detail.widgets?.find(w => w.centerName);
            if (widget) {
                console.log(`\nClass:    ${widget.title}`);
                console.log(`Center:   ${widget.centerName}`);
                console.log(`When:     ${widget.timingDetails}`);
                console.log(`ID:       ${classId}`);
            } else {
                console.log(JSON.stringify(detail, null, 2));
            }
        } catch (err) {
            die(err);
        }
    });

function extractConfirmation(data) {
    const widgets = data?.widgets ?? [];
    const info = widgets.find(w => w.widgetType === 'ORDER_CONFIRMATION_INFO_WIDGET');
    const actions = widgets.find(w => w.widgetType === 'BOOKING_ACTION_LIST_WIDGET');
    const time = info?.textInfoItems?.find(t => t.title?.includes('•'))?.title ?? '';
    const center = info?.orderMeta?.title ?? '';
    const booking = actions?.bookingActions?.[0]?.action?.meta?.body?.bookingNumber
        ?? actions?.topDynamicWidget?.[0]?.bookingNumber
        ?? '';
    return `${time} @ ${center}${booking ? ` [${booking}]` : ''}`;
}

function die(err) {
    if (err.response?.status === 401 || err.response?.status === 403) {
        console.error('TOKEN_EXPIRED: AT token is invalid or expired — run: cult login');
        process.exit(2);
    }
    console.error('Error:', err.message);
    if (err.response) console.error(JSON.stringify(err.response.data, null, 2));
    process.exit(1);
}

program.parse();
