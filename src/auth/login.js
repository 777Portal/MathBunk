const user = require('../db/users.js');
const db = require('../db/db.js');

async function attemptLogin(username, email){
    let createUser = await user.createUser({username, email});
    if (createUser.succeded) return {succeded: true, code:"succesful_account_creation", reason:"Created account.", };
    
    let code = createUser.code;
    if (code !== "email_already_exists") return createUser; // else don't really matter, client can handle.
    
    // login users
    const userInfo = await db.findOne("mathbunk", "users", {"email": email});
    console.log('user info: '+userInfo.email)
    return {succeded: true, code:"successful_login", reason:"Loged in.", userInfo};
}

module.exports = {
    attemptLogin
};