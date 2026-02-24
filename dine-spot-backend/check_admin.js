const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: 'https://dinespot-a6885.firebaseapp.com'
    });
}

const db = admin.firestore();
const bcrypt = require('bcryptjs');

async function checkAndCreateAdmin() {
    const email = 'admin@dinespot.com';
    const password = 'admin123';

    console.log(`Checking for user: ${email}`);

    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('email', '==', email).get();

    if (snapshot.empty) {
        console.log('Admin user not found. Creating...');
        const hashedPassword = await bcrypt.hash(password, 10);
        await usersRef.add({
            email,
            password: hashedPassword,
            username: 'Admin',
            role: 'admin',
            createdAt: Date.now()
        });
        console.log('Admin user created successfully!');
    } else {
        console.log('Admin user already exists.');
        const userData = snapshot.docs[0].data();
        console.log(`Role: ${userData.role}`);

        // Re-hash password just in case it was stored as plain text or different hash
        console.log('Updating password hash to ensure admin123 works...');
        const hashedPassword = await bcrypt.hash(password, 10);
        await snapshot.docs[0].ref.update({
            password: hashedPassword,
            role: 'admin' // Ensure role is correct
        });
        console.log('Admin user updated successfully!');
    }
    process.exit(0);
}

checkAndCreateAdmin().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
