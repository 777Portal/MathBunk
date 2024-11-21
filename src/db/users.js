const db = require('./db.js');

async function updateUser(email) { // need to work on
    const client = await db.get();
    const clientDb = client.db("mathbunk");
    const coll = clientDb.collection("users");

    // db.collection.update(query, update, options)
}

async function createUser(json) {
    const { email, username } = json;

    const emailAlreadyExists = await db.checkIfKeyExists("mathbunk", "users", "email", email);
    if (emailAlreadyExists) return {succeded: false, code:"email_already_exists", reason:"Email already exists"};
    
    const usernameAlreadyExists = await db.checkIfKeyExists("mathbunk", "users", "email", email);
    if (usernameAlreadyExists) return {succeded: false, code:"username_already_exists", reason:"username already exists."};

    const client = await db.get();
    const clientDb = client.db("mathbunk");
    const coll = clientDb.collection("users");

    const user = {
        email,
        username,
        position: { x: 0, z: 0 },
        world: "tutorial",
        badges: {},
        currency: {},
        friends: {},
        avatar: {},
        firstJoined: Date.now(),
        lastOnline: Date.now()
    };

    try {
        await coll.insertOne(user);
        console.log("User created successfully:", user);
        return {succeded: true, code:"success", reason:"Succeded.", user};
    } catch (error) {
        console.error("Failed to create user:", error.stack);
        return {succeded: false, code:"internalError", reason:error};
    }
}

async function deleteUser(email) {
    const client = await db.get();
    const clientDb = client.db("mathbunk");
    const coll = clientDb.collection("users");

    const emailAlreadyExists = await db.checkIfKeyExists("mathbunk", "users", "email", email);
    if (!emailAlreadyExists) return {succeded: false, reason:"Email doesn't exists"};

    try {
        await coll.deleteOne( { email } );
        return {succeded: true, reason: "N/A"};
    } catch (error) {
        return {succeded: false, reason: error};
    }
}

async function deleteUser(email) {
    const client = await db.get();
    const clientDb = client.db("mathbunk");
    const coll = clientDb.collection("users");

    const emailAlreadyExists = await db.checkIfKeyExists("mathbunk", "users", "email", email);
    if (!emailAlreadyExists) return {succeded: false, reason:"Email doesn't exists"};

    try {
        await coll.deleteOne( { email } );
        return {succeded: true, reason: "N/A"};
    } catch (error) {
        return {succeded: false, reason: error};
    }
}

module.exports = {
    createUser,
    deleteUser
};