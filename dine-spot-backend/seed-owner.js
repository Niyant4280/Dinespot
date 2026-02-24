const { db } = require("./firebase");
const bcrypt = require("bcryptjs");

async function seedOwner() {
    const email = "owner@skyhigh.com";
    const password = "owner123";
    const username = "Sky High Manager";
    const role = "restaurant_owner";
    const managedRestaurant = "The Sky High";

    try {
        const usersRef = db.collection("users");
        const existing = await usersRef.where("email", "==", email).get();

        if (!existing.empty) {
            console.log("User already exists. Updating role...");
            const docId = existing.docs[0].id;
            await usersRef.doc(docId).update({ role, managedRestaurant });
        } else {
            const hashedPassword = await bcrypt.hash(password, 10);
            await usersRef.add({
                email,
                password: hashedPassword,
                username,
                role,
                managedRestaurant
            });
            console.log("Restaurant owner created successfully!");
        }
        process.exit(0);
    } catch (error) {
        console.error("Error seeding user:", error);
        process.exit(1);
    }
}

seedOwner();
