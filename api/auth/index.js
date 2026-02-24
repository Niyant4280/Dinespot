const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');

// ── Firebase Admin Init (uses Vercel env var in prod, file in dev) ──
if (!admin.apps.length) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        : require('../../dine-spot-backend/serviceAccountKey.json');

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: 'https://dinespot-a6885.firebaseapp.com'
    });
}

const db = admin.firestore();
const SECRET_KEY = process.env.SECRET_KEY || 'dinespot_secure_production_secret_2024';

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Strip /api prefix that Vercel adds via rewrites
app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
        req.url = req.url.replace('/api', '') || '/';
    }
    next();
});

// ── AUTH MIDDLEWARE ──
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn(`[Auth] No valid Bearer token found in header: ${authHeader}`);
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const token = authHeader.split(' ')[1];
        req.user = jwt.verify(token, SECRET_KEY);
        console.log(`[Auth] Verified user: ${req.user.email} (Role: ${req.user.role})`);
        next();
    } catch (err) {
        console.error(`[Auth] JWT Verification failed: ${err.message}`);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

// Helpers
function isOverlapping(time1, time2) {
    const [h1, m1] = time1.split(':').map(Number);
    const [h2, m2] = time2.split(':').map(Number);
    const start1 = h1 * 60 + m1;
    const end1 = start1 + 60;
    const start2 = h2 * 60 + m2;
    const end2 = start2 + 60;
    return start1 < end2 && start2 < end1;
}

// ── SIGNUP ──
app.post('/signup', async (req, res) => {
    try {
        const { email, password, username } = req.body;
        if (!email || !password || !username)
            return res.status(400).json({ error: 'All fields are required' });

        const usersRef = db.collection('users');
        const existing = await usersRef.where('email', '==', email).get();
        if (!existing.empty)
            return res.status(400).json({ error: 'Email already in use' });

        const hashedPassword = await bcrypt.hash(password, 10);
        let role = 'user';
        if (req.body.role === 'restaurant_owner') role = 'restaurant_owner';
        const managedRestaurant = req.body.managedRestaurant || null;

        const newUser = await usersRef.add({
            email, password: hashedPassword, username, role, managedRestaurant, createdAt: Date.now()
        });
        res.status(201).json({ message: 'User registered successfully', userId: newUser.id });
    } catch (error) {
        console.error('Signup Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ── LOGIN ──
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ error: 'Email and password are required' });

        const snapshot = await db.collection('users').where('email', '==', email).get();
        if (snapshot.empty)
            return res.status(400).json({ error: 'Invalid email or password' });

        let userData, userId;
        snapshot.forEach((doc) => { userData = doc.data(); userId = doc.id; });

        const isMatch = await bcrypt.compare(password, userData.password);
        if (!isMatch)
            return res.status(400).json({ error: 'Invalid email or password' });

        const token = jwt.sign({ userId, email, role: userData.role }, SECRET_KEY, { expiresIn: '24h' });
        res.json({
            message: 'Login successful',
            token,
            user: {
                username: userData.username,
                email: userData.email,
                role: userData.role || 'user',
                managedRestaurant: userData.managedRestaurant || null
            }
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ── DASHBOARD (protected) ──
app.get('/dashboard', authMiddleware, async (req, res) => {
    try {
        const userDoc = await db.collection('users').doc(req.user.userId).get();
        if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
        const data = userDoc.data();
        delete data.password;
        res.json({ message: 'Welcome to the Dashboard', user: data });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ── USER PROFILE UPDATE ──
app.put('/user/profile', authMiddleware, async (req, res) => {
    try {
        const { username, email } = req.body;
        await db.collection('users').doc(req.user.userId).update({
            username: username || req.user.username,
            email: email || req.user.email
        });
        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ── CHECK AVAILABILITY ──
app.get('/check-availability', async (req, res) => {
    try {
        const { restaurant, date, time, guests } = req.query;
        const guestCount = parseInt(guests);
        if (!restaurant || !date || !time || !guestCount)
            return res.status(400).json({ error: 'Missing required parameters' });

        const tablesSnap = await db.collection('tables').get();
        const allTables = [];
        tablesSnap.forEach(doc => allTables.push({ id: doc.id, ...doc.data() }));

        const resSnap = await db.collection('reservations')
            .where('restaurant', '==', restaurant).where('date', '==', date).get();
        const bookedReservations = [];
        resSnap.forEach(doc => { const d = doc.data(); if (d.status !== 'cancelled') bookedReservations.push(d); });

        const now = Date.now();
        const holdsSnap = await db.collection('holds')
            .where('restaurant', '==', restaurant).where('date', '==', date).get();
        const activeHolds = [];
        holdsSnap.forEach(doc => { const d = doc.data(); if (d.expiresAt > now) activeHolds.push(d); });

        const availableTables = allTables.filter(t => {
            const hasBookingConflict = bookedReservations.filter(r => r.tableId === t.id).some(r => isOverlapping(r.time, time));
            const hasHoldConflict = activeHolds.filter(h => h.tableId === t.id).some(h => isOverlapping(h.time, time));
            return !hasBookingConflict && !hasHoldConflict && (t.capacity || 4) >= guestCount;
        });

        if (availableTables.length === 0)
            return res.status(404).json({ error: 'No tables available for the selected slot and guest count.' });

        availableTables.sort((a, b) => (a.capacity || 4) - (b.capacity || 4));
        res.json({ message: 'Table available', table: availableTables[0], allAvailableCount: availableTables.length });
    } catch (error) {
        console.error('Check Availability Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ── HOLD TABLE ──
app.post('/hold-table', authMiddleware, async (req, res) => {
    try {
        const { tableId, restaurant, date, time, guests } = req.body;
        if (!tableId || !restaurant || !date || !time)
            return res.status(400).json({ error: 'Missing required details for hold' });

        const holdData = {
            tableId, restaurant, date, time, guests,
            userId: req.user.userId,
            createdAt: Date.now(),
            expiresAt: Date.now() + (5 * 60 * 1000)
        };
        const holdRef = await db.collection('holds').add(holdData);
        res.json({ message: 'Table held for 5 minutes', holdId: holdRef.id, expiresAt: holdData.expiresAt });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── RESERVE TABLE ──
app.post('/reserve-table', authMiddleware, async (req, res) => {
    console.log(`[RESERVE] Incoming request from ${req.user.email} for ${req.body.restaurant} on ${req.body.date}`);
    try {
        const { tableId, restaurant, date, time, guests, totalCost, holdId } = req.body;
        if (!tableId || !restaurant || !date || !time)
            return res.status(400).json({ error: 'Missing required reservation details' });

        const result = await db.runTransaction(async (transaction) => {
            if (holdId) {
                const holdRef = db.collection('holds').doc(holdId);
                const holdDoc = await transaction.get(holdRef);
                if (!holdDoc.exists || holdDoc.data().expiresAt < Date.now()) throw new Error('HOLD_EXPIRED');
            }
            const resQuery = db.collection('reservations')
                .where('restaurant', '==', restaurant).where('date', '==', date).where('tableId', '==', tableId);
            const resSnap = await transaction.get(resQuery);
            let conflict = false;
            resSnap.forEach(doc => { const d = doc.data(); if (d.status !== 'cancelled' && isOverlapping(d.time, time)) conflict = true; });
            if (conflict) throw new Error('TABLE_OCCUPIED');

            const reservationData = {
                status: 'booked', bookedBy: req.user.userId, bookedByEmail: req.user.email,
                restaurant, date, time, guests: guests || 1, bookedAt: Date.now(),
                cancelledAt: null, largeGroup: (guests >= 6), totalCost: totalCost || '₹0', tableId
            };
            const resRef = db.collection('reservations').doc();
            transaction.set(resRef, reservationData);
            if (holdId) transaction.delete(db.collection('holds').doc(holdId));
            return { reservationId: resRef.id };
        });

        console.log(`[RESERVE] Successfully created reservation ${result.reservationId}`);
        res.json({ message: `Table ${tableId} booked successfully at ${restaurant}`, reservationId: result.reservationId });
    } catch (error) {
        if (error.message === 'HOLD_EXPIRED') return res.status(410).json({ error: 'Session expired. Please select the table again.' });
        if (error.message === 'TABLE_OCCUPIED') return res.status(409).json({ error: 'This table was just booked for an overlapping slot.' });
        console.error('Reserve Table Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ── MY RESERVATIONS ──
app.get('/my-reservations', authMiddleware, async (req, res) => {
    try {
        const snapshot = await db.collection('reservations')
            .where('bookedBy', '==', req.user.userId).orderBy('bookedAt', 'desc').get();
        const reservations = [];
        snapshot.forEach((doc) => reservations.push({ id: doc.id, ...doc.data() }));
        res.json({ reservations });
    } catch {
        const snap = await db.collection('reservations').where('bookedBy', '==', req.user.userId).get();
        const list = [];
        snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
        res.json({ reservations: list.sort((a, b) => b.bookedAt - a.bookedAt) });
    }
});

// ── CANCEL RESERVATION ──
app.post('/cancel-reservation', authMiddleware, async (req, res) => {
    try {
        const { reservationId } = req.body;
        if (!reservationId) return res.status(400).json({ error: 'Reservation ID is required' });

        const resRef = db.collection('reservations').doc(reservationId);
        const resDoc = await resRef.get();
        if (!resDoc.exists) return res.status(404).json({ error: 'Reservation not found' });

        const data = resDoc.data();
        if (data.bookedBy !== req.user.userId && req.user.role !== 'admin')
            return res.status(403).json({ error: 'Unauthorized to cancel this reservation' });
        if (data.status === 'cancelled')
            return res.status(400).json({ error: 'Reservation is already cancelled' });

        await resRef.update({ status: 'cancelled', cancelledAt: Date.now(), cancellationReason: req.body.reason || 'User requested' });
        res.json({ message: 'Reservation cancelled successfully', refund: 0, percent: 0 });
    } catch (error) {
        console.error('Cancel Reservation Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ── ADMIN — ALL RESERVATIONS ──
app.get('/admin/reservations', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'restaurant_owner')
            return res.status(403).json({ error: 'Forbidden' });
        let query = db.collection('reservations');
        if (req.user.role === 'restaurant_owner' && req.user.managedRestaurant)
            query = query.where('restaurant', '==', req.user.managedRestaurant);
        const snap = await query.get();
        const reservations = [];
        snap.forEach(doc => reservations.push({ id: doc.id, ...doc.data() }));
        res.json({ reservations });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ── ADMIN — UPDATE RESERVATION STATUS ──
app.put('/admin/reservations/:id/status', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'restaurant_owner')
            return res.status(403).json({ error: 'Forbidden' });
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Status required' });
        await db.collection('reservations').doc(req.params.id).update({ status });
        res.json({ message: `Reservation marked as ${status}` });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ── REVIEWS ──
app.post('/reviews', authMiddleware, async (req, res) => {
    try {
        const { restaurant, rating, comment } = req.body;
        if (!restaurant || !rating) return res.status(400).json({ error: 'Restaurant and rating required' });
        await db.collection('reviews').add({
            restaurant, rating: Number(rating), comment: comment || '',
            userId: req.user.userId, username: req.user.username || 'Guest', createdAt: Date.now()
        });
        res.json({ message: 'Review submitted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/reviews/:restaurant', async (req, res) => {
    try {
        const snap = await db.collection('reviews')
            .where('restaurant', '==', req.params.restaurant).orderBy('createdAt', 'desc').get();
        const reviews = [];
        snap.forEach(doc => reviews.push({ id: doc.id, ...doc.data() }));
        res.json({ reviews });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/reviews/:id/respond', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'restaurant_owner')
            return res.status(403).json({ error: 'Unauthorized' });
        await db.collection('reviews').doc(req.params.id).update({
            ownerResponse: req.body.response, respondedAt: Date.now()
        });
        res.json({ message: 'Response added' });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ── TABLE STATUS ──
app.get('/table-status', async (req, res) => {
    try {
        const { restaurant, date, time } = req.query;
        if (!restaurant || !date || !time)
            return res.status(400).json({ error: 'Missing restaurant, date, or time' });

        const resSnap = await db.collection('reservations')
            .where('restaurant', '==', restaurant).where('date', '==', date).get();
        const statusMap = {};
        resSnap.forEach(doc => {
            const d = doc.data();
            if (d.status !== 'cancelled' && isOverlapping(d.time, time)) statusMap[d.tableId] = 'booked';
        });

        const now = Date.now();
        const holdsSnap = await db.collection('holds')
            .where('restaurant', '==', restaurant).where('date', '==', date).get();
        holdsSnap.forEach(doc => {
            const d = doc.data();
            if (d.expiresAt > now && isOverlapping(d.time, time)) statusMap[d.tableId] = statusMap[d.tableId] || 'held';
        });

        res.json({ tables: statusMap });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ── RESTAURANTS ──
app.get('/restaurants', async (req, res) => {
    try {
        const snap = await db.collection('restaurants').where('status', '==', 'approved').get();
        const list = [];
        snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        res.json({ restaurants: list });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/admin/restaurants', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
        const { name, category, image, layout } = req.body;
        const docRef = await db.collection('restaurants').add({ name, category, image, layout, status: 'approved', createdAt: Date.now() });
        res.json({ message: 'Restaurant added', id: docRef.id });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/admin/restaurants/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
        await db.collection('restaurants').doc(req.params.id).update({ status: req.body.status });
        res.json({ message: 'Restaurant updated' });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ── SEED TABLES ──
app.post('/seed-tables', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can seed' });
    try {
        const tables = [
            { id: 'M1', capacity: 2, zone: 'Main Hall' }, { id: 'M2', capacity: 2, zone: 'Main Hall' },
            { id: 'M3', capacity: 4, zone: 'Main Hall' }, { id: 'M4', capacity: 4, zone: 'Main Hall' },
            { id: 'P1', capacity: 6, zone: 'Private Booth' }, { id: 'P2', capacity: 6, zone: 'Private Booth' },
            { id: 'P3', capacity: 6, zone: 'Private Booth' }
        ];
        const batch = db.batch();
        tables.forEach(t => batch.set(db.collection('tables').doc(t.id), { ...t, status: 'available' }, { merge: true }));
        await batch.commit();
        res.json({ message: 'Tables seeded successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = app;
