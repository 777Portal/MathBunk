async function render(){
    // console.log(JSON.stringify(moving))
    frames += 1;
    moved = false
    for (dir in moving){
        reallyMoving = moving[dir]
        if (!reallyMoving) continue // isn't moving in this dir

        moved = true;
    }

    ctx.clearRect(0, 0, canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height);
    drawMap();
    drawRocks();
    drawTrees();
    drawPlaceableObjects();
    drawPlayer();
    drawPlayers();
    drawHeldItem();
    drawPrompt();
}


var canvas = document.querySelector("canvas");
var ctx = canvas.getContext("2d", { alpha: false });

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
ctx.textBaseline = 'middle';
ctx.lineWidth = 10;

const dpr = window.devicePixelRatio;
const rect = canvas.getBoundingClientRect();

canvas.height = rect.height * dpr;
canvas.width = rect.width * dpr;

ctx.scale(dpr, dpr);
ctx.fillStyle = "red";

canvas.style.width = `${rect.width}px`;
canvas.style.height = `${rect.height}px`;

let offsetY = 0;
let offsetX = 0;

let objects = {};
let ghosts = {};

let world;
let worldIndex = 0;
let textures = {};

document.getElementById("dialogueHolder").style.display = 'none';

// we are getting WORLD frorm loading the manifest.js before this file.
async function initWorld(world){
    ghosts = world?.ghosts
    objects = world?.objects
    
    textures = {};
    for (const textureHolder in world.textures) {
        console.log("loading textures for element: " + textureHolder);

        const element = world.textures[textureHolder];

        world.textures.length

        // doesn't have multiple frames so we can just load the first
        if (element.static == true){
            let promise = await preloadTexture(element.link, element.scale, textureHolder).then(
                (value) => {
                  console.log(value);
                },
                (reason) => {
                  console.warn(reason);
                },
            );
            continue;
        }
        let frames = element.frames

        for (let frame in frames){
            let json = frames[frame]
            let flipped = json.flipped || false;
            await preloadTexture(json.link, json.scale, `${textureHolder}${frame}`, flipped)
        }
    }
    
    async function preloadTexture(src, scale, texture, flipped){
        const img = new Image();
        img.src = src;

        return new Promise((resolve, reject) => {
            img.onload = () => {
                const c = document.createElement("canvas");
                c.style.display = "none";
                c.width = img.width * scale;
                c.height = img.height * scale;
                c.id = texture
    
                const ctx = c.getContext("2d");
                ctx.imageSmoothingEnabled = false;
    
                if (flipped) {
                    ctx.translate(c.width/2, c.width/2);
                    ctx.scale(-1, 1);
                    ctx.translate(-(c.width/2), -(c.width/2));
                }
    
                ctx.drawImage(img, 0, 0, c.width, c.height);
    
                document.body.appendChild(c);
                textures[texture] = c;
                // console.log();
                resolve(`Texture "${texture}" loaded successfully.`);
            };
    
            img.onerror = () => {
                reject(`Texture "${texture}" failed to load.`);
            }
         });

    }
}

let body = document.querySelector('body');

let yMot = 0;
let xMot = 0;

moving = {
    left: false,
    right: false,
    down: false,
    up: false
};

let facing = "Left"
let sprinting = false

document.addEventListener("keydown", (e) => {
    if (e.shiftKey) sprinting = true
    
    let key = e.key.toLowerCase();

    if (key == "e"){
        return socket.emit("MINE", e);
    }

    if (key == "q"){
        return currentlyHolding = false;
    }

    if (e.shiftKey && key == "r"){
        document.getElementById("debugMenu").style.display = "block"
    }

    if (key == "w"){
        // facing = "Up"
        moving.up = true;
    }
    if (key == "s"){
        // facing = "Down"
        moving.down = true;
    }
    if (key == "a"){
        facing = "Left"
        moving.left = true;
    }
    if (key == "d"){
        facing = "Right"
        moving.right = true;
    }

    let {rows, cols} = calculateRowsAndColumns(100)

    socket.emit("update", {moving, centerX, centerY, sprinting, rows, cols})
});

function calculateRowsAndColumns(tileSize) {
    let rows = Math.ceil(canvas.getBoundingClientRect().height / tileSize) + 3; // +2 to ensure it covers places that aren't completely in the visible area
    let cols = Math.ceil(canvas.getBoundingClientRect().width / tileSize) + 3;

    return { rows, cols };
}

document.getElementById("problemAnswer").addEventListener("keyup", (e) => {
    if (e.key !== "Enter") return;

    value = e.target.value
    socket.emit("QA", value)
    document.activeElement.blur();
    
    document.getElementById("problemHolder").classList.add('fade');
})

document.addEventListener("keyup", (e) => {
    // if (e.repeat) return;
    let key = e.key.toLowerCase();
    if (!e.shiftKey) sprinting = false

    if (key == "e"){
        return;
    }

    if (key == "w"){
        moving.up = false;
    }
    else if (key == "s"){
        moving.down = false;
    }
    else if (key == "a"){
        moving.left = false;
    }
    else if (key == "d"){
        moving.right = false;
    }

    let {rows, cols} = calculateRowsAndColumns(100);

    socket.emit("update", {moving, centerX, centerY, sprinting, rows, cols});
});

let nodeLocations = { trees:[], rocks:[], foodBushes:[]};
function drawMap(){
    let img = getCurrentImgOfTexture("ground", true)
    // console.log(img)
    let imgWidth = 100;
    let imgHeight = 100;

    // get the starting tiles considering offset
    let startX = Math.floor(offsetX / imgWidth);
    let startY = Math.floor(offsetY / imgHeight);
    
    // todo, add a check for scale to know how many extra rows to render
    // fun fact: canvas.width wasn't returning right size at > 33% scale, we love js guys
    let rows = Math.ceil(canvas.getBoundingClientRect().height / imgHeight) + 3; // +2 to ensure it covers places that aren't completely in the visible area
    let cols = Math.ceil(canvas.getBoundingClientRect().width / imgWidth) + 3;
    
    nodeLocations = { trees:[], rocks:[], foodBushes:[]};

    for (let row = -1; row < rows; row++) {
        for (let col = -1; col < cols; col++) {
            let gridX = col + startX;
            let gridY = row + startY;

            let x = gridX * imgWidth - offsetX; // calculate the corner x & y
            let y = gridY * imgHeight - offsetY;
            
            let scale = 0.1 // perlin library only supports doubles so we have to scale our own cordnates
            
            // noise.seed(world.seed); // this is the ground seed we don' need 2 seeds now
            let intensity = (noise.simplex2(gridX*scale, gridY*scale) + 1) / 2;

            let img;
            if (intensity < 0.4) {
                img = getCurrentImgOfTexture("ground", true);
            } else if (intensity < 0.9) {
                img = getCurrentImgOfTexture("ground1", true)
            } else {
                img = getCurrentImgOfTexture("ground1", true)
            }

            let locationHash = decimalHash(`${gridX * 0.0001}${gridY * 0.0001}`);

            if (locationHash > 0.995) {
              nodeLocations.trees.push({ x, y, type: "bigBurnedTree" });
            } else if (locationHash > 0.95) {
              nodeLocations.trees.push({ x, y, locationHash, type: "tree" });
            } else if (locationHash > 0.90) {
              nodeLocations.rocks.push({ x, y, locationHash, type: "rock" });
            }

            ctx.drawImage(img, x, y, imgWidth, imgHeight);            

            const renderDebugGrid = document.getElementById("debugGridEnabled");

            if (!renderDebugGrid.checked) continue;

            ctx.font = `5px Verdana`;    

            if (gridX == 0 || gridY == 0) ctx.fillStyle = "red";
            else ctx.fillStyle = "white";
            
            ctx.strokeStyle =  "white"
            ctx.beginPath();
            ctx.rect(x, y, imgWidth, imgWidth);
            ctx.stroke();
            ctx.fillText(`${img.id} X: ${gridX} Y: ${gridY}`, x+img.width/2, y+img.height/2);
        }
    }
}

let trees = ["snowyTree1", "snowyTree2", "bigBurnedTree"]
function drawTrees(){
    let treeArrr = nodeLocations.trees;
    
    for (treeObject in treeArrr){
        let json = treeArrr[treeObject]
        let { x, y, locationHash } = json
        
        let location;

        let nodesToHide = hiddenNodes.filter(node => {
            
            let matchesX = (node.x - offsetX == x)
            let matchesY = (node.y - offsetY == y)

            if (matchesY && matchesX) return true;
        })

        if(nodesToHide.length > 0) continue;
        
        if (locationHash > 0.995){
            location = trees[2]
        } else if (locationHash > 0.95) {
            location = trees[1]
        } else {
            location = trees[0]
        }

        drawObject(location, json)
        // if ( document.getElementById("ghostTracers").checked ) lineTo(x, y, centerX, centerY);
    }
}

let rocks = ["plainRock1", "plainRock2", "plainRock3", "plainRock4", "plainRock5"]
function drawRocks(){
    let rockArr = nodeLocations.rocks;
    
    let location;

    for (rockObj in rockArr){
        let json = rockArr[rockObj]
        let { x, y, locationHash } = json


        let nodesToHide = hiddenNodes.filter(node => {
            
            let matchesX = (node.x-offsetX == x)
            let matchesY = (node.y-offsetY == y)

            drawCircle(node.x, node.y, 4);

            if (matchesY && matchesX) return true;
        })

        if(nodesToHide.length > 0) continue;
        
        if (locationHash < 0.90){
            location = rocks[4]
        } else if (locationHash < 0.925) {
            location = rocks[3]
        } else if (locationHash < 0.975) {
            location = rocks[2]
        } else if (locationHash < 1.0) {
            location = rocks[1]
        } else {
            location = rocks[0]
        }

        drawObject(location, json)
    }
}

let centerX;
let centerY;

function drawPlayer() {
    let textureName = `player${facing}`;

    let viewOnly = false
    if (moved == false) viewOnly = true;

    let img = getCurrentImgOfTexture(textureName, viewOnly);

    centerX = (canvas.width / (2 * dpr)) - (img.width / 2);
    centerY = (canvas.height / (2 * dpr)) - (img.height / 2);

    ctx.beginPath();
    // ctx.rect(centerX, centerY, img.width, img.height);
    document.getElementById("generalDebug").innerText = `X: ${centerX + (img.width / 2) + offsetX} Y: ${centerY + (img.height / 2 ) + offsetY}`
    ctx.stroke();

    ctx.drawImage(img, centerX, centerY, img.width, img.height);
}

function drawPlayers(){
    let img = getCurrentImgOfTexture("playerLeft", true);
    for (let player in players){
        let playerJson = players[player]
        // console.log()

        ctx.beginPath();
        // ctx.rect(centerX, centerY, img.width, img.height);
        document.getElementById("generalDebug").innerText = `X: ${centerX + (img.width / 2) + offsetX} Y: ${centerY + (img.height / 2 ) + offsetY}`
        ctx.stroke();
        ctx.drawImage(img, playerJson.x - offsetX, playerJson.y - offsetY, img.width, img.height);
        drawStroked( playerJson.username, playerJson.x - offsetX, playerJson.y - offsetY )
    }
}

function getCurrentImgOfTexture(textureName, viewOnly){
    let world = WORLDS[worldIndex].textures;
    let textureHolder = world[textureName]
    
    if(textureHolder?.static && textures[textureName]){
        return textures[textureName]
    }

    // console.log(world, textureHolder, textureHolder.currentFrame, textureHolder.frames)
    if (!world || !textureHolder|| typeof textureHolder.currentFrame === "undefined" || !textureHolder.frames){
        // console.warn(`failed to load the texture ${textureName}`)
        return textures["fallback"]
    } 

    if (textureHolder.currentFrame > Object.keys(textureHolder.frames).length-1) textureHolder.currentFrame = 0;

    let img = textures[`${textureName}${textureHolder.currentFrame}`]
    
    if (!img) return textures["fallback"]

    if (viewOnly || textureHolder.static == true) return img;
    
    textureHolder.currentFpsFrame += 1;

    if (textureHolder.currentFpsFrame >= textureHolder.fps || (sprinting == true && textureHolder.currentFpsFrame >= textureHolder?.sprintingFps && textureHolder?.canSprint == true)){
        textureHolder.currentFrame += 1;
        textureHolder.currentFpsFrame = 0;
    }
    return img
}

let currentMusic = new Audio("assets/music/Gregor Quendel - Schubert - 4 Impromptus, No. 4 - D. 935, Op. 142.mp3.mp3");

function drawObjects(objects){
    let leastDist = {dist: 99999, x: 0, y: 0};
    
    ctx.strokeStyle = "white"
    
    for (let objectName in objects){
        let object = objects[objectName]

        if (object.render == false) continue;
        
        // if its going to go off array
        if (object.currentFrame+1 > object.frames.length-1){
            if (object.loop == true) object.currentFrame = 0;
            else continue; 
        }

        if (object.currentFrame < 0) object.currentFrame = 0;

        let frame = object.frames[object.currentFrame];

        let texture = frame.texture;
        let img = textures[texture];
        if (!img) img = textures["fallback"]

        if (!frame?.x || !frame?.y) continue;

        let x = parseInt(frame.x - offsetX)
        let y = parseInt(frame.y - offsetY)

        let ghostCenterX = x + (img.width / 2);
        let ghostCenterY = y + (img.height / 2)

        let img2 = getCurrentImgOfTexture(`player${facing}`, true);
        
        let x2 = centerX + (img2.width / 2 );
        let y2 = centerY + (img2.height / 2 );
        
        let dist = Math.sqrt(Math.pow(x2 - ghostCenterX, 2) + Math.pow(y2 - ghostCenterY, 2));

        ctx.drawImage(img, x, y, img.width, img.height);
        // console.log(JSON.stringify(ghost))
        if (dist < leastDist.dist) leastDist = {x, y, xW: img.width, yH : img.height, intensity: object.lightIntensity, dist, ghostCenterX, x2, ghostCenterY, y2};
        
        if ( document.getElementById("showGhostInfo").checked ) showGhostInfo(objectName, dist, object.currentFrame, x, y);

        // if ( document.getElementById("ghostTracers").checked ) lineTo(ghostCenterX, ghostCenterY, x2, y2);

        if (dist > object.activationDistance) continue;
        
        let interactions = object?.interactions
        for (let interactionFrame in interactions) {
            if (!interactions) continue;
            if (object.currentFrame !== parseInt(interactionFrame)) continue;

            document.getElementById("dialogueHolder").style.display = 'block';

            let dialougeHolder = interactions[interactionFrame];

            let currentDialogueIndex = dialougeHolder.currentDialogue
            let currentDialogue = dialougeHolder.dialogueTree[currentDialogueIndex]
            
            document.getElementById("ghostName").innerText = objectName
            document.getElementById("ghostImg").src = dialougeHolder.thumb
            document.getElementById("ghostText").innerText = currentDialogue.currentText
            // console.log(currentDialogue.currentText)

            let questions = currentDialogue.questions
            let responses = currentDialogue.responses

            let questionHolder = document.getElementById("questions")
            questionHolder.innerText = "";

            for (let questionIndex in questions){
                let response = questions[questionIndex];
                
                let btn = document.createElement("button")
                btn.innerText = response
                questionHolder.appendChild(btn)
                btn.onmousedown = function(){
                    console.log("clicked")
                    
                    if(responses[questionIndex].split("_")[0].includes("MUS[")){
                        let src = responses[questionIndex].split("_")[0].split("[")[1]
                        let audio = new Audio(src);
                        currentMusic.pause();
                        audio.play();
                        currentMusic = audio
                    }
                    handleResponse(objectName, interactionFrame, currentDialogueIndex, questionIndex)
                };
            }

            if (dialougeHolder.pause == true) return;
        }

        object.currentFrame += 1;
    }
    
    if ( !document.getElementById("fullbright").checked ){
        // console.log(leastDist)
        // document.getElementById("vignette").style.boxShadow = ` 0 0 200px ${-10+leastDist.dist * leastDist.intensity}px rgba(0,0,0,0.9) inset`;
    } else document.getElementById("vignette").style.boxShadow = ` 0 0 0px 0px rgba(0,0,0,0.9) inset`;

    const {x, y, xW, yH, ghostCenterX, ghostCenterY, x2, y2} = leastDist
    
    // if (document.getElementById("ghostTracers").checked){
    //     ctx.strokeStyle = "yellow"
    //     ctx.strokeRect(x, y, xW, yH);
    //     drawCircle(ghostCenterX, ghostCenterY, 4);
    //     lineToText(ghostCenterX, ghostCenterY, x2, y2, `distance🤣 : ${Math.round(leastDist.dist)}`);
    //     ctx.strokeStyle = "white"
    // }
}


let savedInfo = {}

function handleResponse(ghostName, frame, currentDialogueIndex, responseIndex){
    console.log("Handling response for" + ghostName);

    let object = ghosts[ghostName]

    let interactions = object.interactions
    
    let currentInteraction = interactions[frame]
    
    let dialogueTree = currentInteraction.dialogueTree
    
    let currentDialouge = dialogueTree[currentDialogueIndex]
    
    let response = currentDialouge.responses[responseIndex]

    let questionHolder = document.getElementById("questions")
    currentDialouge.currentText = response

    let responses = response.split("_")

    for (responseIndex in responses){
        response = responses[responseIndex]

        if (response.includes("SAVE[")){
            let saveParams = response.split("[")[1].split("=");
            savedInfo[saveParams[0]] = saveParams[1]

            console.log(`saved key ${saveParams[0]} with the value ${saveParams[1]}`)

            console.log(JSON.stringify(savedInfo))
        }
        
        if (response == "CONTINUE["){
            questionHolder.innerText = "";
    
            if (currentInteraction.currentDialogue+1 == Object.keys(dialogueTree).length) { // basically if it reached the end of the dialouges
                currentInteraction.paused = false;
                document.getElementById("dialogueHolder").style.display = 'none';
                object.currentFrame += 1;

                continue;
            }
            
            currentInteraction.currentDialogue += 1
            continue
        }
    }
}

var times = [];
var fps;

function refreshLoop() {
  window.requestAnimationFrame(function() {
    const now = performance.now();
    while (times.length > 0 && times[0] <= now - 1000) {
      times.shift();
    }
    times.push(now);
    fps = times.length;
    document.getElementById("debug").innerText = "Fps: " + fps + " | Facing: " + facing + " | frame: " + frames + " | X: "

    refreshLoop();
  });
}

refreshLoop();

let currentlyHeld = false

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
    },
    "wall":{
      cost:{
          rock: 0,
          tree: 1,
      },
      canRotate: true
    },
    "wall_corner":{
      cost:{
          rock: 0,
          tree: 1,
      },
      canRotate: true
    },
    "wall_diagonal":{
      cost:{
          rock: 0,
          tree: 1,
      },
      canRotate: true
    },
    "fallback":{
      cost:{
          rock: 99999,
          tree: 99999,
      },
      canRotate: true
    }
  }

let hiddenNodes = [];
let closeObjects = [];

let players = [];

window.onload = async function init(){
    console.log("loading socket");
    socket = await io.connect();
    console.log("Loaded!");
    
    socket.onAny((event, ...args) => {
        // if (event == "RENDER") return;
        // console.log(hiddenNodes)
        const logSocket = document.getElementById("logSocket");

        if (!logSocket.checked) return;
        console.log(event, args);
    });

    socket.on("UPD", (nearbyPlayers) => {
        players = nearbyPlayers.closestPlayers
    })

    socket.on("RECUP", (inventoryJson) => {
        let inventoryDiv = document.getElementById("inventory");
        inventoryDiv.innerHTML = ""; // refresh the inventory

        for (let inventoryItem in inventoryJson){
            console.log(inventoryJson[inventoryItem])
            let item = inventoryJson[inventoryItem]
            let {displayName, thumb, amount} = item
            let li = createInventoryItem(displayName, amount, thumb)
            inventoryDiv.appendChild(li)
        }

        let actionBar = document.getElementById("actionBar");
        actionBar.innerHTML = "";

        // populate action bar with the things you can place.
        for( let placeable in placeables){
            let info = placeables[placeable]
            let costs = info.cost

            let canPlace = true;
            for (material in costs){
                let currentAmount = inventoryJson[material].amount
                let neededAmount = costs[material]

                if (currentAmount < neededAmount) canPlace = false;
            }
            if (canPlace == false) continue;

            let div = document.createElement("DIV");
            let img =  document.createElement("IMG");
            img.src = getCurrentImgOfTexture(placeable, true).toDataURL();
            div.appendChild(img)
            div.innerText += placeable
            div.onclick = function (){ hold(placeable) }
            actionBar.appendChild(div);
            
            console.log(`can place ${placeable}`)
        }

        function createInventoryItem(name, amount, thumb){
            let li = document.createElement("LI");
            let span = document.createElement("SPAN");
            span.style.margin = "1%" 
            span.style.fontSize = "28px"
            span.innerText += name + ": " + amount
            let img = document.createElement("IMG")
            img.src = thumb
            span.appendChild(img);
            li.appendChild(span);
            
            return li
        }
    })

    socket.on("tbAlert", (info) => {
        let {text, duration} = info

        let alertHolder = document.getElementById("alert");
        let alertText = document.getElementById("alertText");

        alertHolder.style.display = "box";
        
        console.log("Showing alert for " + duration )
        alertText.innerText = text;

        setTimeout(() => {
            alertHolder.classList.toggle('fade');
        }, duration);
    })

    socket.on("MINE", (info, problemJson) => {
        let {x, y, type, dist} = info

        let {problem, problemInfo} = problemJson
        let problemHolder = document.getElementById("problem");
        let problemInfoHolder = document.getElementById("problemInfo");

        document.getElementById("problemHolder").classList.remove('fade');
        let problemParent = problemInfoHolder.parentElement
        problemInfoHolder.style.display = "box";

        problemHolder.innerHTML = problem;
        problemInfoHolder.innerText = problemInfo;
    })

    // when disconnect by the socket
    socket.on("CloseConn", (info) => {
        let {showLogin, reason} = info

        // problemInfoHolder.style.display = none;
        let problemHolder = document.getElementById("problem");
        let problemInfoHolder = document.getElementById("problemInfo");

        let inventoryDiv = document.getElementById("inventory").style.display = 'none';

        document.getElementById("vignette").style.boxShadow = ` 0 0 200px 5000px rgba(0,0,0,0.9) inset`;
        document.getElementById("problemHolder").classList.remove('fade');
        
        // .style.display = none;
        problemHolder.style.display = "box"
        problemHolder.innerHTML = reason;
    })

    socket.on("RENDER", (json) => {
        const newXOffset = json.offsetX;
        const newYOffset = json.offsetY;
        offsetX = newXOffset;
        offsetY = newYOffset;

        let serverObjectLocations = json.serverObjects
        let treeArr = serverObjectLocations.trees;

        let {nodesToHide, nearbyObjects} = json
        if (hiddenNodes !== nodesToHide) hiddenNodes = nodesToHide;

        if (nearbyObjects) closeObjects = nearbyObjects;

        nodeLocations = json.nodeLocations
    })

    world = WORLDS[worldIndex];
    worldIndex = 0;

    await initWorld(world);
    
    setInterval(() => {
        render()
    }, 16.67);
}

frames = 0;
let moved = false;

let socket;
function connect(){
    profile;
}  

let currentlyHolding;
function hold(placeable){
    if (currentlyHolding == placeable) return currentlyHolding = false;
    currentlyHolding = placeable
}

let rotationalValue = 90;
function drawHeldItem() {  
    if (!currentlyHolding) return;

    let img = getCurrentImgOfTexture(currentlyHolding, true)
    
    let imgWidth = img.width;
    let imgHeight = img.height;

    let locX = Math.floor(centerX);
    let locY = Math.floor(centerY-imgHeight)
    
    drawCircle(centerX, centerY-imgHeight, 4);

    ctx.drawImage(img, locX, locY, imgWidth, imgHeight)
    ctx.rect(locX, locY, imgWidth, imgWidth);
}

function drawPlaceableObjects(){
    for (object in closeObjects){
        let objectInfo = closeObjects[object]
        let {type, x, y} = objectInfo
        // console.log(x, y)
        
        let img = getCurrentImgOfTexture(type, true)
        let imgWidth = img.width;
        let imgHeight = img.height;
        
        // drawCircle(centerX, centerY-imgHeight, 4);
        ctx.drawImage(img, x-offsetX, y-offsetY, imgWidth, imgHeight)
    }
}

document.addEventListener("mousedown", (e) => {
    if (!currentlyHolding) return;

    let img = getCurrentImgOfTexture(currentlyHolding, true)
    
    let imgWidth = img.width;
    let imgHeight = img.height;
    
    socket.emit("PLCE", {currentlyHolding, imgWidth, imgHeight})
})

const xInputHandler = function(e) {
  centerX = e.target.value;
}
document.getElementById("x").addEventListener('input', xInputHandler);

const yInputHandler = function(e) {
    offsetY = e.target.value;
}
document.getElementById("y").addEventListener('input', yInputHandler);


function drawPrompt(){
    let closest = getClosestObject();
    let {x, y, type, dist} = closest;
    let getCenter = getPlayerCenter()
    let pX = getCenter.x
    let pY = getCenter.y

    lineToPrompt(x, y, pX, pY, `${type}: hold | to break`, "prompt_e");
}

function getClosestObject(arr){
    let searchArray = arr;
    if (!arr){
        let treeArr = nodeLocations.trees;
        let rockArr = nodeLocations.rocks;
        searchArray = treeArr.concat(rockArr);    
    }

    let leastDist = {x:0, y:0, dist:Infinity}

    for (let object in searchArray){
        let objectInfo = searchArray[object];
        let {x, y} = objectInfo
        let distance = getDistance(x, centerX, y, centerY)
        objectInfo.dist = distance


        let nodesToHide = hiddenNodes.filter(node => {
            
            let matchesX = (node.x - offsetX == x)
            let matchesY = (node.y - offsetY == y)

            if (matchesY && matchesX) return true;
        })

        if(nodesToHide.length > 0) continue;
        
        if (distance < leastDist.dist) leastDist = objectInfo;
    }

    if (leastDist.dist == 999999999) return false;

    return leastDist
}

function getDistance(x, x2, y, y2){
    return Math.sqrt(Math.pow(x - x2, 2) + Math.pow(y - y2, 2));
}

function getPlayerCenter(){
    let img = getCurrentImgOfTexture(`player${facing}`, true);

    let x = centerX + (img.width / 2 );
    let y = centerY + (img.height / 2 );

    return {x, y}
}

// add stroke so you can actually read the text.
function drawStroked(text, x, y) {
    ctx.font = '10px Sans-serif';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 6;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = 'white';
    ctx.fillText(text, x, y);
}

// helper functions
function drawCircle(x, y, r){
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.stroke();
}

function lineTo(x, y, x2, y2){
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2 );
    ctx.stroke();
}

function lineToText(x, y, x2, y2, text){
    // console.log(text)
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2 ); 
    ctx.stroke();

    let midX = (x + x2) / 2;
    let midY = (y + y2) / 2;

    ctx.font = `20px Verdana`;    
    ctx.fillStyle = "red"
    ctx.fillText(text, midX, midY);
}

function lineToPrompt(x, y, x2, y2, text, prompt) {
    let alpha = Math.max(2 - (getDistance(x, x2, y, y2) * 0.01), 0) // makes it so it gets clearer when closer to the obj
    ctx.globalAlpha = alpha; 


    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.font = `10px Sans-serif`;
    ctx.fillStyle = 'black';

    let textArr = text.split("|");
    let textWidth1 = ctx.measureText(textArr[0]).width;
    let textWidth2 = ctx.measureText(textArr[1]).width;

    let promptTexture = getCurrentImgOfTexture(prompt, true);
    let bgTexture = getCurrentImgOfTexture("ui_panel_brown_damaged_dark", true);

    let midX = (x + x2) / 2;
    let midY = (y + y2) / 2;

    let totalWidth = textWidth1 + promptTexture.width + textWidth2;
    
    // adding margins cuz the image has invisble portion.
    // let bgWidth = totalWidth + 20 * 2;
    // let bgHeight = bgTexture.height - 10 * 2;
    
    // ctx.drawImage(bgTexture, midX - bgWidth / 2, midY - bgHeight / 2, bgWidth, bgHeight); 
    drawStroked(textArr[0], midX - totalWidth / 2, midY);

    let textureX = midX - totalWidth / 2 + textWidth1
    let textureY = midY - promptTexture.height / 1.5 // its 1.5 cuz the kenney.nl textures have some weird height thing with invis stuff but yea

    ctx.fillStyle = 'black';
    ctx.fillRect(textureX, textureY, promptTexture.width, promptTexture.height)
    ctx.drawImage(promptTexture, textureX, textureY);

    drawStroked(textArr[1], midX + totalWidth / 2 - textWidth2, midY);
    ctx.globalAlpha = 1;
}


function decimalHash(string) {
    string
    let sum = 0;
    for (let i = 0; i < string.length; i++)
        sum += (i + 1) * string.codePointAt(i) / (1 << 8)
    return sum % 1;
}

function drawObject(texture, cords, rotation) {
    let { x, y } = cords;
    // console.log(texture)
    // console.log('drawing '+texture)
    let img = getCurrentImgOfTexture(texture, true);
    let imgWidth = img.width;
    let imgHeight = img.height;

    let centeredX = x - imgWidth / 2;
    let centeredY = y - imgHeight / 2;

    if (rotation){
        ctx.rotate( ( 90 * rotation ) );
        ctx.fillStyle = "red";
        ctx.fillRect(100, 0, 80, 20);

        // Reset transformation matrix to the identity matrix
        ctx.setTransform(1, 0, 0, 1, 0, 0);

    }

    // ctx.fillRect(centeredX, centeredY, imgWidth, imgHeight);
    ctx.drawImage(img, centeredX, centeredY, imgWidth, imgHeight);

    if (rotation){
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
}

function showGhostInfo(ghostName, dist, currentFrame, x, y){
    ctx.font = `20px Verdana`;
    let ghost = ghosts[ghostName]
    ctx.fillText(`Name: ${ghostName}`, x, y);
    ctx.fillText(`Frame: ${ghost.currentFrame}`, x, y+20);
    ctx.fillText(`Frames left: ${Object.keys(ghost.frames).length - ghost.currentFrame} `, x, y+40);
}