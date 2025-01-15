const login = require('../../auth/login.js');
const express = require('express');
const router = express.Router();

router.get('/success', function (req, res) {
      console.log(req.user)
  }
);