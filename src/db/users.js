const db = require('./db.js');

async function updateUser(email, update) { // need to work on
    const client = await db.get();
    const clientDb = client.db("mathbunk");
    const coll = clientDb.collection("users");

    const updated = await db.update("mathbunk", "users", "email", email, update);
    return updated
}

async function checkIfEmailExists(email){
    const emailAlreadyExists = await db.checkIfKeyExists("mathbunk", "users", "email", email);
    return emailAlreadyExists
}

async function checkIfUsernameExists(username){
    const usernameAlreadyExists = await db.checkIfKeyExists("mathbunk", "users", "username", username);
    return usernameAlreadyExists
}


async function createUser(json) {
    const { email, username } = json;

    const emailAlreadyExists = await checkIfEmailExists(email);
    if (emailAlreadyExists) return {succeded: false, code:"email_already_exists", reason:"Email already exists"};
    
    const usernameAlreadyExists = await checkIfUsernameExists(email);
    if (usernameAlreadyExists) return {succeded: false, code:"username_already_exists", reason:"username already exists."};

    const client = await db.get();
    const clientDb = client.db("mathbunk");
    const coll = clientDb.collection("users");

    const user = {
        email,
        username,
        position: { 
            x: 0, 
            y: 0, 
            offsetX:0,
            offsetY:0,
            sprinting: false,
            moving:{ left: false, right: false, down: false, up: false},
            facing:"left"
        },
        world: 0,
        badges: {},
        currency: {},
        friends: {},
        inventory: {},
        avatar: {},
        firstJoined: Date.now(),
        lastSeen: Date.now()
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

async function getUser(email) {
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
    deleteUser,
    updateUser
};