const express = require('express');
const router = express.Router();

const db = require('../../../db/db.js');
const login = require('../../../auth/login.js');

const passport = require("passport");

const GoogleStrategy = require('passport-google-oauth2').Strategy;

const {
  web, 
} = require('../../../../config/googleConfig.json');  
const { attemptLogin } = require('../../../auth/login.js');

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});

passport.use(new GoogleStrategy({
    clientID: web.client_id,
    clientSecret: web.client_secret,
    callbackURL: "http://localhost:3000/auth/google/callback",
    passReqToCallback: true
  },
  function(request, accessToken, refreshToken, profile, done) {
    return done(null, profile);
  }
));

// give the redirct link
router.get('/google',
  passport.authenticate('google', {
    scope:
      ['email', 'profile']
  }
));

router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/',
  }),
  function (req, res) {
    res.redirect('/auth/google/success')
    // console.log(req.user)
  }
);
router.get('/google/success', async (req, res) => {
  if (!req.user)
    return res.redirect("/auth/google");

  req.session.authenticated = true;
  login.attemptLogin("exonautoo", req.user.email) // its funny that i added the succeded boolean and the reasons just to end up not using them.
  let data = await db.findOne("mathbunk", "users", {"email": req.user.email});
  req.session.info = data
  return res.redirect("/");
});


module.exports = router;