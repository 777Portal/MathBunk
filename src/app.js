#!/usr/bin/env node
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
function generateProblem() {
  let problemVars = {};
  let problemsArr = Object.values(problems);
  let randomQuestionIndex = getRandomInt(0, Object.keys(problems).length - 1);
  let question = problemsArr[randomQuestionIndex];

  let vars = question.vars;

  for (let questionVar in vars) {
    let varDefinition = vars[questionVar]; 
    
    let split = varDefinition.split("(");
    let functionName = split[0].toLowerCase();
    let args = split[1].replace(")", "").split(",");

    args = args.map(arg => parseInt(arg, 10));

    switch (functionName) {
      case "getrandomint":
        // console.log(JSON.stringify(args))
        problemVars[questionVar] = getRandomInt(args[0], args[1]);
        break;
      default:
        console.error(`Unknown function: ${functionName}`);
        break;
    }
  }

  let questionEquation =  question.actualEquation
  let problemQuestion = question.problem

  for (let variable in problemVars){
    problemQuestion = problemQuestion.replaceAll(`_${variable}_`, problemVars[variable])
    problemQuestion = problemQuestion.replaceAll(`\n`, "<br>")
    questionEquation = questionEquation.replaceAll(variable, problemVars[variable])
    // console.log(`filled ${variable}`)
  }

  // console.log(questionEquation, problemQuestion);
  let useKatex = question.type
  
  let questionAnswer = eval(questionEquation)

  return {questionAnswer, problemQuestion, useKatex}
}

function getRandomInt(min, max){
  return Math.floor(Math.random() * (max - min + 1) + min);
}

let problems = {
  question:{
    type: "static",
    vars: {
      fenceLength: "getRandomInt(50,100)",
      tomRate: "getRandomInt(2,10)",
      huckRate: "getRandomInt(3,12)",
      tomSoloTime: "getRandomInt(1,5)",
      combinedTime: "getRandomInt(1,5)",
      huckSoloTime: "getRandomInt(1,5)" 
    },    
    //     actualEquation: "tomRate * tomSoloTime + ( tomRate + huckRate ) * combinedTime + huckRate * huckSoloTime",
    actualEquation: "tomRate * tomSoloTime + ( tomRate + huckRate ) * combinedTime + huckRate * huckSoloTime",
    problem: "Tom is painting a fence _fenceLength_ feet long. \nHe starts at the West end of the fence and paints at a rate of _tomRate_ feet per hour.\nAfter _tomSoloTime_ hours, Huck joins Tom and begins painting from the East end of the fence at a rate of _huckRate_ feet per hour. \nAfter _combinedTime_ hours of the two boys painting at the same time, Tom leaves Huck to finish the job by himself.\m\nIf Huck completes painting the entire fence after Tom leaves, how many more hours will Huck work than Tom?"
  },
  question2:{
    "type": "static",
    "vars": {
      "initialSpeed": "getRandomInt(10,20)",
      "time": "getRandomInt(2,5)",
      "acceleration": "getRandomInt(2,6)",
      "initialPosition": "getRandomInt(0,10)"
    },    
    "actualEquation": "initialPosition + initialSpeed * time + 0.5 * acceleration * time^2",
    "problem": "A car starts at an initial position of _initialPosition_ meters and moves with an initial speed of _initialSpeed_ meters per second. The car accelerates at a rate of _acceleration_ meters per second squared.\nAfter _time_ seconds, how far will the car have traveled?"
  }
}

let hiddenNodes = []; // nodes that are used
let placedObjects = []; // stuff that is placed down

const sockets = {};

function updateUsers(){
  let players = {}
  
  for (socketIndex in sockets){
    let targetSocket = sockets[socketIndex]
    let info = targetSocket.request.session.info

    if (!info || !targetSocket) continue;
  
    let {username, position} = info
    let {x, y, moving} = position

    players[username] = {x, y, moving, username}

    // console.log("\n" + JSON.stringify(info.request.session.info));
    // console.log("- Updating player: " + username);
  }

  for (socketIndex in sockets){
    let targetSocket = sockets[socketIndex]
    let info = targetSocket.request.session.info

    let closestPlayers;

    closestPlayers = Object.values(players).filter(player => {
      const distance = getDistance(info.position.x, player.x, info.position.y, player.y)
      if (info.username == player.username) return false;
      return distance <= 10000;
    });

    if (closestPlayers.length < 0) return;

    targetSocket.emit('UPD', { closestPlayers })
  }
}

let placeables = {
  "bed":{
      cost:{
          rock: 10,
          tree: 10,
      },
      canRotate: true
  },
  "table":{
      cost:{
          rock: 10,
          tree: 10,
      },
      canRotate: false
  },
  "campfire":{
      cost:{
          rock: 50,
          tree: 50,
      },
      canRotate: false
  }
}

io.on('connection', async (socket) => {
  socketSessionData = socket.request.session
  
  // check auth, if no auth kick em.
  if (!socketSessionData || !socketSessionData.authenticated) {
    socket.emit( 'tbAlert', {text: 'Not logged in...', duration:1} )
    socket.emit( 'CloseConn', {reason: 'You are not logged in!<br><a href="/auth/google">sign in?</a><br><a href="/assets/credits.txt">credits</a>'} )
    return socket.disconnect(true);
  }
  // refresh the data
  let data = await db.findOne("mathbunk", "users", {"email": socketSessionData.passport.user.email});
  socket.request.session.info = data

  // to acess user data
  let session = socket.request.session
  let info = session.info;
  session.ssocid = socket.id;
  
  socket.emit( 'tbAlert', {text: `Logged in as ${info.username}`, duration: 5000} )

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
  
  inventory = info.inventory
  socket.emit("RECUP", inventory)

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

    let nodesToHide = [];

    if (hiddenNodes.length > 0) {
      nodesToHide = hiddenNodes.filter(node => {
        // console.log(node)
        const distance = getDistance(x, node.x, y, node.y)
        // console.log(distance)
        return distance <= 10000;
      });
    }


    let nearbyObjects = [];
    if (placedObjects.length > 0) {
      nearbyObjects = placedObjects.filter(object => {
        const distance = getDistance(x, object.x, y, object.y)
        return distance <= 10000;
      });
    }

    updateUsers();
    socket.emit( 'RENDER', {x, y, offsetX, offsetY, serverObjects, nodesToHide, nearbyObjects});
  }, 16.7);

  socket.on("MINE", (arg) => {
    pos = info.position

    let nodeLocations = getObjects(pos.offsetX, pos.offsetY, pos.rows, pos.cols);
    // console.log(JSON.stringify(nodeLocations.trees))

    let closest = getClosestObject(nodeLocations, pos.offsetX, pos.offsetY, pos.x, pos.y)
    
    inventory = info.inventory
        
    socket.emit("RECUP", inventory)
    
    let problemJson = generateProblem();
    problemJson.attemped = false;
    problemJson.closest = closest;
    info.currentQuestion = problemJson;

    let {questionAnswer, useKatex, problemQuestion} = problemJson;


    let problemInfo = "Find C"
    let problem = ""
    
    if (useKatex == "static"){problem = `<p>${problemQuestion} \n ${questionAnswer}</p>`}
    else problem = katex.renderToString(problemQuestion, { throwOnError: false });

    socket.emit("MINE", {closest}, {problemInfo, problem})
    // console.log(problemJson.questionAnswer)
  });

  socket.on("PLCE", (arg) => {
    let {imgWidth, currentlyHolding, imgHeight} = arg // have to make a better way to do this this is super unsafe
    if (!currentlyHolding in placeables) return;

    let pos = info.position
    inventory = info.inventory

    let x = pos.x 
    let y = pos.y 

    let locationX = Math.floor(x);
    let locationY = Math.floor(y-imgHeight);

    let costArr = placeables[currentlyHolding].cost;

    for (cost in costArr){
      let price = costArr[cost]

      let inventoryItem = inventory[cost]
      if (inventoryItem.amount - price < 0) return;
      
      inventory[cost].amount -= price
    }
    
    placedObjects.push({type:currentlyHolding, x:locationX, y:locationY})
  })

  socket.on("QA", (arg) => {
    inventory = info.inventory
    // console.log("\n\n"+arg)
    
    if (!info.currentQuestion) return;
    let currentQuestion = info.currentQuestion
    
    let closest = currentQuestion.closest;
    let questionAnswer = currentQuestion.questionAnswer;
    let type = closest.type 
    
    // console.log(questionAnswer, arg, (questionAnswer == arg))
    if (closest.type == "bigBurnedTree") type = "tree";
    if (questionAnswer != arg) { return socket.emit("MINE", {closest}, {problemInfo:"Incorrect!", problem:`You got the answer "<b>${arg}</b>", but the actual answer was <b>${questionAnswer}</b>`}); }

    let amount = getRandomInt(10, 15)
    let inventoryItem = inventory[type]
    inventory[type].amount += amount;

    hiddenNodes.push(closest)
    
    socket.emit("RECUP", inventory)
    socket.emit( 'tbAlert', {text: `Successfully got ${amount} of ${inventoryItem.displayName}`, duration: 1500} )
  });


  socket.on('update', (json) => {
    let pos = info.position
    let {moving, centerX, centerY, sprinting, rows, cols} = json
    
    info.position.rows = rows ? rows : 11 // defaults to size of my screen cuz its better then erroring when getting closest object lol
    info.position.cols = cols ? cols : 18

    let offsetX = pos.offsetX 
    let offsetY = pos.offsetY

    pos.sprinting = sprinting

    pos.moving = moving

    pos.x = centerX+offsetX;  
    pos.y = centerY+offsetY;

    updateUsers();
  })

  const socketStatus = {};

  // Handling disconnection
  socket.on('disconnecting', () => {
    socketStatus[socket.id] = 'disconnecting';
    let email = socketSessionData.passport.user.email
    console.log("saving info for " + email)
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

    updateUsers();
  });

  updateUsers();
});


function getClosestObject(nodeLocations, offsetX, offsetY, x2, y2) {
  let searchArray = [...nodeLocations.trees, ...nodeLocations.rocks];

  let leastDist = { x: 0, y: 0, dist: Infinity };
  
  for (let objectInfo of searchArray) {
    let { x, y } = objectInfo;
    let distance = getDistance(x, x2, y, y2);
    // console.log(x, x2, y, y2)
    objectInfo.dist = distance;

    let nodesToHide = hiddenNodes.filter(node => {
            
      let matchesX = (node.x == x)
      let matchesY = (node.y == y)

      if (matchesY && matchesX) return true;
    })
    
    if(nodesToHide.length > 0) continue;

    if (distance < leastDist.dist) {
      leastDist = objectInfo;
    }
  }

  return leastDist.dist === Infinity ? false : leastDist;
}


function decimalHash(string) {
  string
  let sum = 0;
  for (let i = 0; i < string.length; i++)
      sum += (i + 1) * string.codePointAt(i) / (1 << 8)
  return sum % 1;
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

      let x = gridX * imgWidth;
      let y = gridY * imgHeight;

      let locationHash = decimalHash(`${gridX * 0.0001}${gridY * 0.0001}`);

      if (locationHash > 0.995) {
        nodeLocations.trees.push({ x, y, type: "tree" });
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