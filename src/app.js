const db = require('./db/db.js');
const login = require('./auth/login.js');

async function initDatabase(){
    await db.initConnection();
    login.attemptLogin("exon", "info@nahid.win")
}
initDatabase();

const express = require('express');
const googleRoutes = require('./routes/auth/google/google.js');
const { error } = require('console');

const app = express();
const PORT = 3000;

app.use('/auth', googleRoutes);

app.get('/', (req, res) => {
    res.sendFile('main.html', { root: './src/' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

process.on('exit', async (code) => {
    db.closeConnection();
    console.log(`Exiting with code: ${code}`);
});  