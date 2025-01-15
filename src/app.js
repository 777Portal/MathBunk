const db = require('./db/db.js');
const passport = require("passport");
const PORT = 3000; // Move to config.json soon

const express = require('express');
const katex = require('katex');
const app = express();

const users = require('./db/users.js');

app.use('/assets', express.static('../assets'))

// save login state
const session = require('express-session');
const sessionMiddleware = session({
  secret: "sessionSecretKey",
  resave: true,
  saveUninitialized: true,
});
app.use(sessionMiddleware)

// auth lib
app.use(passport.initialize());
app.use(passport.session());

// socket.io
const server = require('http').createServer(app);
const io = require('socket.io')(server);

io.engine.use(sessionMiddleware);

// start db
async function initDatabase(){
  await db.initConnection();
}
initDatabase();

// google auth
const googleRoutes = require('./routes/auth/google/google.js');
app.use('/auth', googleRoutes);

app.get('/', (req, res) => {
  res.sendFile('index.html', { root: '../assets/game/' });
});

app.get('/katex', (req, res) => {
  res.send(katex.renderToString("c = \\pm\\sqrt{a^2 + b^2}", {
    throwOnError: false
  }));
})

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

// on shutdown cleanly close the db connection
process.on('exit', async (code) => {
  db.closeConnection();
  console.log(`Exiting with code: ${code}`);
});

// wss stuff
const sockets = {};

function generateProblem(){
  let problemVars = {}
  let randomQuestionIndex = getRandomInt(0, Object.keys(questions).length - 1)
  let question = questions[randomQuestionIndex]

  console.log(questions[0], JSON.stringify(questions))

  let vars = question.vars;

  for (let questionVar in vars){
    let split = question.split("[")

    let questionFunction = split[0]
    questionFunction = questionFunction.toLowerCase()
    let arguments = split[1].split("_")
    
    switch (questionFunction) {
      case "getrandomint":
        problemVars[questionVar] = getRandomInt(arguments[0], arguments[1])
        break
      default:
        break;
    }
  }
  console.log(JSON.stringify(problemVars))
}

function getRandomInt(min, max){
  return Math.floor(Math.random() * (max - min + 1) + min);
}

let questions = {
  question:{
    type: "dynamic",
    // 2x + 5 = 11
    vars: {
      b: "getRandomInt[19_19",
      a: "divide[b_2",
      c: "getRandomInt[1_999"
    },
    problem: "A = B / 2"
  },
  question2:{
    type: "dynamic",
    vars: {
      b: "getRandomInt[19_19",
      a: "divide[b_2"
    },
    problem: "A = B / 2"
  },
  question3:{
    type: "dynamic",
    vars: {
      b: "getRandomInt[19_19",
      a: "divide[b_2"
    },
    problem: "A = B / 2"
  }
}

io.on('connection', async (socket) => {
  socketSessionData = socket.request.session
  
  // check auth, if no auth kick em.
  if (!socketSessionData || !socketSessionData.authenticated) {
    socket.emit( 'CloseConn', {reason: 'You are not logged in!<br><a href="/auth/google">sign in?</a>'} )
    return socket.disconnect(true);
  }
  // refresh the data
  let data = await db.findOne("mathbunk", "users", {"email": socketSessionData.passport.user.email});
  socket.request.session.info = data

  // console.log(JSON.stringify(socketSessionData))

  // to acess user data
  let session = socket.request.session
  let info = session.info;
  session.ssocid = socket.id;
  
  if (!session.ssocid) {
    socket.emit( 'CloseConn', {showLogin: false, reason: 'SSOCID missing [Error code 0]'} )
    return socket.disconnect(true);
  }

  // to iterate over all sockets if we want to send smth in the future
  sockets[socket.id] = socket;

  // debug stuff
  socket.onAny((event, ...args) => {
    // console.log(event, args);
  });
  
  let localInterval = setInterval(async () => {
    if (session.ssocid !== socket.id) // to prevent funny bug where you could just have multiple tabs open at the same time to get money faster :P
    {
      socket.emit( 'CloseConn', {reason: 'logged in at another location (tab, page, ect.)'} )
      return socket.disconnect(true);
    }

    pos =  info.position
    let moving = checkIfMoving(pos.direction)
    let {sprinting, rows, cols} = pos
    // if (!moving.moved) return;

    let oldOffsetX = pos.offsetX
    let oldOffsetY = pos.offsetY

    pos.rows = rows
    pos.cols = cols

    let {offsetX, offsetY} = getNewOffset(oldOffsetX, oldOffsetY, pos.moving, sprinting)

    info.position.offsetX = offsetX
    info.position.offsetY = offsetY

    let x = pos.x;
    let y = pos.y;

    let serverObjects = getObjects(offsetX,offsetY, rows, cols)

    socket.emit( 'RENDER', {x, y, offsetX, offsetY, serverObjects});
  }, 16.7);


  socket.on("MINE", (arg) => {
    pos = info.position

    let nodeLocations = getObjects(pos.offsetX, pos.offsetY, pos.rows, pos.cols);
    // console.log(JSON.stringify(nodeLocations.trees))

    let closest = getClosestObject(nodeLocations, pos.offsetX, pos.offsetY, pos.x, pos.y)
    // console.log(closest);

    socket.emit("RECUP", {
      stone:{
        displayName: "stone",
        thumb: "/assets/game/rocks/plainRock1.png",
        amount: 10000000000,
      }, 
      wood: {
        displayName: "wood",
        thumb: "/assets/game/rocks/plainRock1.png",
        amount: 21
      }
    })

    let problemInfo = "Find C"
    let problem = katex.renderToString(`c = \\sqrt{${Math.round(Math.random()*10)}^2 + ${Math.round(Math.random()*10)}^2}`, { throwOnError: false })
    socket.emit("MINE", {closest}, {problemInfo, problem})
  });

  socket.on('update', (json) => {
    let pos = info.position
    let {moving, centerX, centerY, sprinting, rows, cols} = json
    
    pos.rows = rows
    pos.cols = cols

    let offsetX = pos.offsetX 
    let offsetY = pos.offsetY


    pos.sprinting = sprinting

    pos.moving = moving

    pos.x = centerX+offsetX;  
    pos.y = centerY+offsetY;
  })

  const socketStatus = {};

  // Handling disconnection
  socket.on('disconnecting', () => {
    socketStatus[socket.id] = 'disconnecting';
    let email = socketSessionData.passport.user.email
    console.log("\n\n\nsaving info for " + email, JSON.stringify(info))
    delete info._id // to not conflit with mongo db's auto id stuff.
    users.updateUser(email, info)
  });

  socket.on('disconnect', () => {
    console.log(`Socket ${socket.id} disconnected`);

    if (socketStatus[socket.id] === 'disconnecting') {
      delete sockets[socket.id];
      delete socketStatus[socket.id];
      clearInterval(localInterval)
    }
  });
});


function getClosestObject(nodeLocations, offsetX, offsetY, x2, y2) {
  let searchArray = [...nodeLocations.trees, ...nodeLocations.rocks];

  let leastDist = { x: 0, y: 0, dist: Infinity };

  for (let objectInfo of searchArray) {
    let { x, y } = objectInfo;
    let distance = getDistance(x+offsetX, x2, y+offsetY, y2);
    console.log(x, x2, y, y2)
    objectInfo.dist = distance;

    if (distance < leastDist.dist) {
      leastDist = objectInfo;
    }
  }

  return leastDist.dist === Infinity ? false : leastDist;
}

function getObjects(offsetX, offsetY, rows, cols){
  
  let imgWidth = 100;
  let imgHeight = 100;
  
  // get the starting tiles considering offset
  let startX = Math.floor(offsetX / imgWidth);
  let startY = Math.floor(offsetY / imgHeight);
  
  let nodeLocations = { trees:[], rocks:[], foodBushes:[]};

  for (let row = -1; row < rows; row++) {
    for (let col = -1; col < cols; col++) {
      let gridX = col + startX;
      let gridY = row + startY;

      let x = gridX * imgWidth - offsetX;
      let y = gridY * imgHeight - offsetY;

      let locationHash = decimalHash(`${gridX * 0.0001}${gridY * 0.0001}`);

      if (locationHash > 0.995) {
        nodeLocations.trees.push({ x, y, type: "bigBurnedTree" });
      } else if (locationHash > 0.95) {
        nodeLocations.trees.push({ x, y, locationHash, type: "tree" });
      } else if (locationHash > 0.90) {
        nodeLocations.rocks.push({ x, y, locationHash, type: "rock" });
      }
    }
  }

  return nodeLocations
}

function getDistance(x, x2, y, y2){
  return Math.sqrt(Math.pow(x - x2, 2) + Math.pow(y - y2, 2));
}

function getNewOffset(offsetX, offsetY, moving, sprinting){
  if (sprinting == true) offsetAmount = 5
  else offsetAmount = 2.5
  
  let direction;

  for (dir in moving){
    reallyMoving = moving[dir]
    if (!reallyMoving) continue // isn't moving in this dir
    
    switch (dir) {
      case "left":
        offsetX -= offsetAmount;
        break;
      case "right":
        offsetX += offsetAmount;
        break;
      case "up":
        offsetY -= offsetAmount;
        break;
      case "down":
        offsetY += offsetAmount;
        break;
    } 

    direction = dir
    moved = true;
  }

  // javascript fuckery; for some reason html canvas the Y is inverted, so down is up and up is down.
  return {offsetX, offsetY}
}

function checkIfMoving(moving){
  let direction;
  let moved = false;
  for (dir in moving){
    reallyMoving = moving[dir]
    if (!reallyMoving) continue // isn't moving in this dir

    direction = dir
    moved = true;
  }

  return {moved, direction}
}

function decimalHash(string) {
  string
  let sum = 0;
  for (let i = 0; i < string.length; i++)
      sum += (i + 1) * string.codePointAt(i) / (1 << 8)
  return sum % 1;
}