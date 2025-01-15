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


function showGhostInfo(ghostName, dist, currentFrame, x, y){
    ctx.font = `20px Verdana`;
    let ghost = ghosts[ghostName]
    ctx.fillText(`Name: ${ghostName}`, x, y);
    ctx.fillText(`Frame: ${ghost.currentFrame}`, x, y+20);
    ctx.fillText(`Frames left: ${Object.keys(ghost.frames).length - ghost.currentFrame} `, x, y+40);
    ctx.fillText(`Darkness: ${-10+dist * ghost.lightIntensity} `, x, y+60);
}