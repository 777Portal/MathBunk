const express = require('express');
const router = express.Router();

const { 
  web: GOOGLE_CONFIG, 
} = require('../../../../config/googleConfig.json');  

// give the redirct link
router.get('/google', (req, res) => {
  res.status(500).send('Google Authentication Failed');
});

// get the code n do stuff with it.
router.get('/google/callback', async (req, res) => {
  res.status(500).send('Google Authentication Failed');
});

module.exports = router;