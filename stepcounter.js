/* 
 * Step Counter
 * Author: Cris#6864
 * The UI is based on the work of kekilla#7036 from his TokenBar module
 * Many thanks to kekilla#7036 and cole#9640 for their help
 */

let timerCheck = 0;
new Date();
let timer = 0; 
let role;
let turnBlockSett;
let stepCounterSett;

function checkCombat(){
    if (game.combat) 
        return game.combat.data.active;
    else return false; 
}

function displayBar(token,stepsMoved,dashB){
    if (stepsMoved < 0) stepsMoved = token.getFlag('StepCounter','stepsTaken');
    stepsMoved = Math.round(stepsMoved);
    if (dashB < 0) dashB = token.getFlag('StepCounter','dash');
    if (stepCounterSett == 0) return;
    let inCombat = checkCombat();
    if (inCombat == false && game.settings.get('StepCounter','CombatOnly')==true) return;

    let oldBar = document.getElementById("show-action-dropdown-bar");
    if (oldBar != null)
        oldBar.remove();

    $(document.body).off("click.showTokenActionBar");
    $(document.body).off("contextmenu.showTokenActionBar");

    const cancel = () => {
        $dispOptions.remove();
        $(document.body).off("click.showTokenActionBar");
    };

    let targetActor = token;
    var display, data, targetId;
    if (targetActor == null) {
        display = "none";
        data = "";
        targetId = "";
    } else {
        display ="flex";
        let speed = getTokenSpeed(token);
        //let stepsMoved = Math.round(token.getFlag('StepCounter','stepsTaken'));
        let dash = "No";
        if (dashB) dash = "Yes";
        data = ["Moved: " + stepsMoved + "/" + speed + " Ft.   Dash: " + dash];
        targetId = targetActor._id;
    }

    //save coordiants and retrieve => client/user flag (TokenBar,Coord)
    //click on bar?? let them move it
    let navBounds = document.getElementById("navigation").getBoundingClientRect();
    let y = navBounds.bottom + 20;

    let controlBounds = document.getElementById("controls").getBoundingClientRect();
    let x = controlBounds.right + 50;

    const $dispOptions = $(`<div class="tokenbar" targetID="${targetId}" id="show-action-dropdown-bar" style="display: ${display}; z-index: 70; position: fixed; top: ${y}px; height: auto; left: ${x}px; background-color: #bbb">${data}</div>`).appendTo(document.body);
}

function getTokenSpeed(token){
    let speed = parseInt(token.actor.data.data.attributes.speed.value);
    let speedSpecial = parseInt(token.actor.data.data.attributes.speed.special);
    if (speedSpecial > speed) speed = speedSpecial;
    let dash = token.getFlag('StepCounter','dash');
    if (dash) speed *= 2;

    return speed;
}

function setFlags(token, X, Y, steps, dash, diagonal){
    token.setFlag('StepCounter','startCoordinateX', X);
    token.setFlag('StepCounter','startCoordinateY', Y);
    if (steps > -1) token.setFlag('StepCounter','stepsTaken', steps);
    if (dash > -1) token.setFlag('StepCounter','dash',dash);
    if (diagonal > -1) token.setFlag('StepCounter','diagonal',diagonal);
    displayBar(token,steps,dash);
    timerCheck = 0;
    timer = Date.now();
}

function whisperGM(message){
    for (let i=0; i<game.data.users.length; i++){
        if (game.data.users[i].role > 2) 
            ChatMessage.create({
                content: message,
                whisper: [game.data.users[i]._id]
        });                                                                                      
    }
}

Hooks.on('ready', ()=>{
    game.socket.on(`module.StepCounter`, (payload) =>{
        //check if this user is the target, else return
        if (game.userId != payload.receiver) return;

        //check if the correct message has been received
        if (payload.msgType == "requestMovement_tooMuch" || payload.msgType == "requestMovement_noTurn"){
        
            //get the name of the requesting user, and his/her token data
            let user = game.users.get(payload.sender).data.name;
            let token;
            for (let i=0; i<canvas.tokens.children[0].children.length; i++)
                if (canvas.tokens.children[0].children[i].data._id == payload.tokenId) token = canvas.tokens.children[0].children[i];
            let dash = "No";
            if (payload.dash) dash = "Yes";
            
            //build dialog
            let applyChanges = 0;
            let buttons = {
            //Accept button is always available, accepts the request
                Accept: {
                    label: `Accept`,
                    callback: () => applyChanges = 0
                }
            }
            //Accept reset button, in case of too much movement, the step counter can be reset
            if (payload.msgType == "requestMovement_tooMuch")
                buttons.AcceptReset = {
                    label: `Accept + Reset`,
                    callback: () => applyChanges = 1
                }
            //Decline button is always available, declines the request
            buttons.Decline = {
                label: `Decline`,
                callback: () => applyChanges = 2
            }
            
            let content =  `Player '` + user + `' has requested extra movement for token '` + token.data.name + `':<br><br>Moved: ` + payload.totalSteps + ` Ft.<br>Speed: `+ getTokenSpeed(token) + ` Ft.<br>Dash: ` + dash + `<br><br>`;
            if (payload.msgType == "requestMovement_noTurn") content = `Player '` + user + `' has requested to move '` + token.data.name + `' outside his/her turn`;
            let d = new Dialog({
                title: `Movement request`,
                content,
                buttons,
                default: "Decline",
                close: html => {
                    //If 'Accept' is pressed, do nothing (accepts the movement)
                    let ret;
                    if (applyChanges == 0){ //accept
                        timer = Date.now();
                        ret = true;
                    }
                    //if 'AcceptReset' is pressed, reset stepCounter
                    else if (applyChanges == 1) { //Accept + Reset
                        token.setFlag('StepCounter','startCoordinateX', token.data.x);
                        token.setFlag('StepCounter','startCoordinateY', token.data.y);
                        token.setFlag('StepCounter','stepsTaken', payload.stepsTaken);
                        token.setFlag('StepCounter','dash',false);
                        token.setFlag('StepCounter','diagonal',0);
                        timer = Date.now();
                        ret = true;
                    }
                    //If 'Decline' is pressed, move token back to old location
                    else if (applyChanges == 2) { //Reject
                        token.shiftPosition((payload.oldX - token.data.x)/canvas.dimensions.size,(payload.oldY - token.data.y)/canvas.dimensions.size,true);
                        token.setFlag('StepCounter','startCoordinateX', payload.oldX);
                        token.setFlag('StepCounter','startCoordinateY', payload.oldY);
                        token.setFlag('StepCounter','stepsTaken', token.getFlag('StepCounter','stepsTaken')-payload.stepsTaken);
                        token.setFlag('StepCounter','diagonal',payload.diagonal);
                        timer = Date.now();
                        ret = false;
                    }
                    let payload2 = {
                        "msgType": "requestMovement_GMack",
                        "sender": game.userId, 
                        "receiver": payload.sender, 
                        "tokenId": token.data._id,
                        ret
                    };
                    game.socket.emit(`module.StepCounter`, payload2);
                }
            });
            d.render(true);
        }
        else if (payload.msgType == "requestMovement_GMack"){
            if (payload.ret == true) ui.notifications.info("The GM has granted your request");
            else ui.notifications.warn("The GM has declined your request");
            disableMoveKeys(false);
        }
    });
});

Hooks.once('init', function(){
    //initialize all settings
    game.settings.register('StepCounter','TurnBlockPlayer', {
        name: "Turn Block (Player)",
        hint: "Determines behavior when token is moved when its not their turn",
        scope: "world",
        config: true,
        type:Number,
        default:2,
        choices:["Off","Warning Only","Dialog Box","Auto Block"],
    });
    game.settings.register('StepCounter','TurnBlockTrusted', {
        name: "Turn Block (Trusted)",
        hint: "Determines behavior when token is moved when its not their turn",
        scope: "world",
        config: true,
        type:Number,
        default:2,
        choices:["Off","Warning Only","Dialog Box","Auto Block"],
    });
    game.settings.register('StepCounter','TurnBlockAssistant', {
        name: "Turn Block (Assistant)",
        hint: "Determines behavior when token is moved when its not their turn",
        scope: "world",
        config: true,
        type:Number,
        default:1,
        choices:["Off","Warning Only","Dialog Box","Autoblock"],
    });
    game.settings.register('StepCounter','TurnBlockGM', {
        name: "Turn Block (GM)",
        hint: "Determines behavior when token is moved when its not their turn for the GM only",
        scope: "world",
        config: true,
        type:Number,
        default:1,
        choices:["Off","Warning Only","Dialog Box","Auto Block"],
    });


    game.settings.register('StepCounter','EnablePlayer', {
        name: "Step Counter (Player)",
        hint: "Enabled the step counter and sets the display type",
        scope: "world",
        config: true,
        type:Number,
        default:3,
        choices:["Off","Display Only","Display + Warning","Display + Dialog Box","Display + Auto Block"], 
    });
    game.settings.register('StepCounter','EnableTrusted', {
        name: "Step Counter (Trusted)",
        hint: "Enabled the step counter and sets the display type",
        scope: "world",
        config: true,
        type:Number,
        default:3,
        choices:["Off","Display Only","Display + Warning","Display + Dialog Box","Display + Auto Block"], 
    });
    game.settings.register('StepCounter','EnableAssistant', {
        name: "Step Counter (Assistant)",
        hint: "Enabled the step counter and sets the display type",
        scope: "world",
        config: true,
        type:Number,
        default:2,
        choices:["Off","Display Only","Display + Warning","Display + Dialog Box","Display + Auto Block"], 
    });
    game.settings.register('StepCounter','EnableGM', {
        name: "Step Counter (GM)",
        hint: "Enabled the step counter and sets the display type",
        scope: "world",
        config: true,
        type:Number,
        default:2,
        choices:["Off","Display Only","Display + Warning","Display + Dialog Box","Display + Auto Block"], 
    });
    
    game.settings.register('StepCounter','ResetButton', {
        name: "Step Counter Reset Button",
        hint: "Determines who can see the step counter reset button in the dialog box",
        scope: "world",
        config: true,
        type:Number,
        default:2,
        choices:["Everyone","Trusted & Up","Assistants & Up","Gamemaster only","Nobody"],
    });
    game.settings.register('StepCounter','IgnoreButton', {
        name: "Ignore Step Counter Button",
        hint: "Determines who can see the ignore button in the dialog box",
        scope: "world",
        config: true,
        type:Number,
        default:2,
        choices:["Everyone","Trusted & Up","Assistants & Up","Gamemaster only","Nobody"],
    });
    game.settings.register('StepCounter','RequestButton', {
        name: "GM Request Button",
        hint: "Allow players to request the GM to allow movement past their token's speed limit",
        scope: "world",
        config: true,
        default: true,
        type: Boolean
    });
    game.settings.register('StepCounter','CombatOnly', {
        name: "Combat Only",
        hint: "Only enable the step counter during combat",
        scope: "world",
        config: true,
        default: true,
        type: Boolean,
    });
    game.settings.register('StepCounter','AutoReset', {
        name: "Auto Reset",
        hint: "Automatically reset the step counter and dash flag on a new combat turn",
        scope: "world",
        config: true,
        default: true,
        type: Boolean
    });
    game.settings.register('StepCounter','ChatMessages', {
        name: "Chat Messages",
        hint: "Creates a chat message whenever a player uses dash, resets the step counter, or ignores a token's speed limit",
        scope: "world",
        config: true,
        default: true,
        type: Boolean
    });

    for (let i=0; i<game.data.users.length; i++)
        if (game.data.users[i]._id == game.userId) 
            role =  game.data.users[i].role;

    if (role == 1) {
        stepCounterSett = game.settings.get("StepCounter","EnablePlayer");
        turnBlockSett = game.settings.get("StepCounter","TurnBlockPlayer");
    }
    else if (role == 2) {
        stepCounterSett = game.settings.get("StepCounter","EnableTrusted");
        turnBlockSett = game.settings.get("StepCounter","TurnBlockTrusted");
    }
    else if (role == 3) {
        stepCounterSett = game.settings.get("StepCounter","EnableAssistant");
        turnBlockSett = game.settings.get("StepCounter","TurnBlockAssistant");
    }
    else if (role == 4) {
        stepCounterSett = game.settings.get("StepCounter","EnableGM");
        turnBlockSett = game.settings.get("StepCounter","TurnBlockGM");
    }
});

let moveKeysOld;
function disableMoveKeys(enable){
    moveKeysOld = game.keyboard.moveKeys;
    if (enable){
        game.keyboard.moveKeys.w = "";
        game.keyboard.moveKeys.a = "";
        game.keyboard.moveKeys.s = "";
        game.keyboard.moveKeys.d = "";
        game.keyboard.moveKeys.W = "";
        game.keyboard.moveKeys.A = "";
        game.keyboard.moveKeys.S = "";
        game.keyboard.moveKeys.D = "";
        game.keyboard.moveKeys.ArrowUp = "";
        game.keyboard.moveKeys.ArrowRight = "";
        game.keyboard.moveKeys.ArrowDown = "";
        game.keyboard.moveKeys.ArrowLeft = "";
        game.keyboard.moveKeys.Numpad1 = "";
        game.keyboard.moveKeys.Numpad2 = "";
        game.keyboard.moveKeys.Numpad3 = "";
        game.keyboard.moveKeys.Numpad4 = "";
        game.keyboard.moveKeys.Numpad6 = "";
        game.keyboard.moveKeys.Numpad7 = "";
        game.keyboard.moveKeys.Numpad8 = "";
        game.keyboard.moveKeys.Numpad9 = "";
    }
    else {
        game.keyboard.moveKeys.w = ["up"];
        game.keyboard.moveKeys.s = ["down"];
        game.keyboard.moveKeys.a = ["left"];
        game.keyboard.moveKeys.d = ["right"];
        game.keyboard.moveKeys.W = ["up"];
        game.keyboard.moveKeys.S = ["down"];
        game.keyboard.moveKeys.A = ["left"];
        game.keyboard.moveKeys.D = ["right"];
        game.keyboard.moveKeys.ArrowUp = ["up"];
        game.keyboard.moveKeys.ArrowRight = ["right"];
        game.keyboard.moveKeys.ArrowDown = ["down"];
        game.keyboard.moveKeys.ArrowLeft = ["left"];
        game.keyboard.moveKeys.Numpad1 = ["down","left"];
        game.keyboard.moveKeys.Numpad2 = ["down"];
        game.keyboard.moveKeys.Numpad3 = ["down","right"];
        game.keyboard.moveKeys.Numpad4 = ["left"];
        game.keyboard.moveKeys.Numpad6 = ["right"];
        game.keyboard.moveKeys.Numpad7 = ["up","left"];
        game.keyboard.moveKeys.Numpad8 = ["up"];
        game.keyboard.moveKeys.Numpad9 = ["up","right"];
    }   
}

Hooks.on("updateCombat", (combat, updateData, otherData, userId) => {
    if (game.settings.get("StepCounter","AutoReset") && role > 2){
        for (let i=0; i<canvas.tokens.children[0].children.length; i++){
            let token;
            if (canvas.tokens.children[0].children[i].data._id == combat.current.tokenId) {
                token = canvas.tokens.children[0].children[i];
                setFlags(token, token.data.x, token.data.y, 0, false, 0);
            }
        }
    }
    if (canvas.tokens.controlled.length > 0) {
        if (canvas.tokens.controlled[0].data._id == combat.current.tokenId)
            displayBar(canvas.tokens.controlled[0],0,0);
    }
});

Hooks.on("deleteCombat", (combat, id, options) => {
    if (game.settings.get('StepCounter','CombatOnly')==false) return;
    let oldBar = document.getElementById("show-action-dropdown-bar");
    if (oldBar != null)
        oldBar.remove();
});

Hooks.on('controlToken', (token,controlled)=>{
    displayBar(token,-1,-1);
});

Hooks.on('controlToken', (token,controlled)=>{
    if (controlled == false) {
        disableMoveKeys(false);
        let oldBar = document.getElementById("show-action-dropdown-bar");
        if (oldBar != null)
            oldBar.remove();
        return;
    }
    if(token.data.flags["StepCounter"]){}
    else setFlags(token, token.data.x, token.data.y, 0, false, 0);
    token.setFlag('StepCounter','startCoordinateX', token.data.x);
    token.setFlag('StepCounter','startCoordinateY', token.data.y);

    Hooks.on('updateToken',(a,b,c,d,user)=>{
        //To prevent the dialog from appearing multiple times, set a timer
        if (Date.now() - timer < 200 || timerCheck == 1) 
            return;
        
        timer = Date.now();

        if (token._controlled == false) return;
        if (user != game.userId) return;
        
        //Check if combat is currently going on. Do not continue if not
        let inCombat = checkCombat();

        if (inCombat == false && game.settings.get('StepCounter','CombatOnly')==true) return;

        //Calculate the steps taken in the X and Y direction by comparing the current position to the previous position. Divide by canvas.dimensions.size to get grid boxes
        let currentPositionX = token.data.x;
        let currentPositionY = token.data.y;
        let oldPositionX = token.getFlag('StepCounter','startCoordinateX');
        let oldPositionY = token.getFlag('StepCounter','startCoordinateY');
        let stepsTakenX = Math.abs(oldPositionX - currentPositionX)/canvas.dimensions.size; 
        let stepsTakenY = Math.abs(oldPositionY - currentPositionY)/canvas.dimensions.size;
        let diagonal = token.getFlag('StepCounter','diagonal');

        //Check what kind of diagonal movement rules are being used.
        let stepsTaken = 0;
        let diagonalMovement = game.settings.get("dnd5e","diagonalMovement");
        
        //Default DND rules: Diagonal movement is free, so take the biggest value of stepsTakenX or stepsTakenY
        if (diagonalMovement == "555"){
            stepsTaken = stepsTakenX;
            if (stepsTakenY > stepsTaken) stepsTaken = stepsTakenY;
        }
        //Variant rules: Alternating 5/10/5 ft. for diagonal movement
        else if (diagonalMovement == "5105"){
            
            let diagonalSteps = 0;
            let remainder = 0;
            if (stepsTakenX == stepsTakenY) diagonalSteps = stepsTakenX;
            else if (stepsTakenX > stepsTakenY) {
                diagonalSteps = stepsTakenY;
                remainder = stepsTakenX - stepsTakenY;
            }
            else if (stepsTakenX < stepsTakenY) {
                diagonalSteps = stepsTakenX;
                remainder = stepsTakenY - stepsTakenX;
            }
            stepsTaken = remainder;
            if (diagonalSteps%2 == 0){//even diagonal steps
                stepsTaken += (diagonalSteps/2)*3;
                diagonal = 0;
            }
            else {//uneven diagonal steps
                let evenSteps = Math.floor(diagonalSteps/2);
                diagonalSteps += evenSteps + diagonal;
                stepsTaken += diagonalSteps;
                if (diagonal == 0) diagonal = 1;
                else diagonal = 0;
            }
        }
        //Euclidian rules: use pythagorean theorem to calculate the distance
        else if (diagonalMovement = "EUCL") stepsTaken = Math.sqrt(stepsTakenX * stepsTakenX + stepsTakenY * stepsTakenY);
        
        //Multiply by the canvas.dimensions.distance to get feet
        stepsTaken *= canvas.dimensions.distance;

        //If the token has moved, and timerCheck is 0, continue
        if (stepsTaken > 0){
            timerCheck = 1;
            //set timerCheck to 1, get the speed of the token, get the amount of steps the token has already moved
            timerCheck = 1;
            let speed = getTokenSpeed(token);
            let totalSteps = token.getFlag('StepCounter','stepsTaken');
            
            let turnBlock = false;
            if (turnBlockSett>0 && inCombat)
                for (let i=0; i<game.combat.data.combatants.length; i++)
                    if (game.combat.data.combatants[i].tokenId == token.data._id)
                        turnBlock = !game.combat.data.combatants[i].active;

            //Check if the previous movement + new movement is bigger than the token's speed. Or if the token is moved when its not their turn
            if (Math.round(stepsTaken + token.getFlag('StepCounter','stepsTaken'))>speed || turnBlock) {
                //Check if autoblock applies, which will automatically force the token back to its original position
                if (stepCounterSett == 4 || turnBlock && turnBlockSett == 3){
                    token.shiftPosition((oldPositionX - currentPositionX)/canvas.dimensions.size,(oldPositionY - currentPositionY)/canvas.dimensions.size,true);
                    setFlags(token, oldPositionX, oldPositionY, -1, -1, -1);
                    if (turnBlock) ui.notifications.warn("It is not your turn"); 
                    else ui.notifications.warn("You cannot move more than your speed allows"); 
                    timer = Date.now();
                }
                //Check if 'display only' is set for 'disable', if so, continue movement
                else if (turnBlock == false && stepCounterSett == 0) {
                    totalSteps = token.getFlag('StepCounter','stepsTaken') + stepsTaken;
                    setFlags(token, token.data.x, token.data.y, totalSteps, -1, diagonal);
                }
                //Check if 'display only' is set for 'enable', if so, continue movement
                else if (turnBlock == false && stepCounterSett == 1) {
                    totalSteps = token.getFlag('StepCounter','stepsTaken') + stepsTaken;
                    setFlags(token, token.data.x, token.data.y, totalSteps, -1, diagonal);
                    if (game.settings.get("StepCounter","ChatMessages")==true && role < 3) {
                        let dash = "No";
                        if (token.getFlag('StepCounter','dash')) dash = "Yes";
                        whisperGM(token.name + " moved more than its speed allows<br>Moved: " + totalSteps + "/" + speed + " Ft.<br>Dash: " + dash);
                    }
                }
                //Check if 'display + warning' is set for 'enable', if so, continue movement and give warning
                else if (turnBlock == false && stepCounterSett ==2){
                    totalSteps = token.getFlag('StepCounter','stepsTaken') + stepsTaken;
                    setFlags(token, token.data.x, token.data.y, totalSteps, -1, diagonal);              
                    ui.notifications.warn("You moved more than your speed allows"); 
                    if (game.settings.get("StepCounter","ChatMessages")==true && role < 3) {
                        let dash = "No";
                        if (token.getFlag('StepCounter','dash')) dash = "Yes";
                        whisperGM(token.name + " moved more than its speed allows<br>Moved: " + totalSteps + "/" + speed + " Ft.<br>Dash: " + dash);
                    }
                }
                //Check if 'warning only' is set for the turn block function, if so, continue movement and give warning
                else if (turnBlock && turnBlockSett == 1){
                    totalSteps = token.getFlag('StepCounter','stepsTaken') + stepsTaken;
                    setFlags(token, token.data.x, token.data.y, totalSteps, -1, diagonal);
                    ui.notifications.warn("It is not your turn");
                    if (game.settings.get("StepCounter","ChatMessages")==true && role < 3) 
                        whisperGM(token.name + " moved when it was not its turn");
                }
                //In all other cases, create a dialog box
                else {
                    disableMoveKeys(true);
                    //Create a dialog, with buttons based on the current situation
                    let applyChanges = 0;
                    let buttons = {
                        //Undo button is always available
                        Undo: {
                            label: `Undo`,
                            callback: () => applyChanges = 0
                        }
                    }
                    //Check if token is using dash. If not, add a button to apply it
                    if (token.getFlag('StepCounter','dash')==false && turnBlock == false){
                        buttons.Dash = {
                            label: `Dash`,
                            callback: () => applyChanges = 1
                        }
                    }
                    //Check if the role of the user. If applicable, add reset button
                    if (game.settings.get("StepCounter","ResetButton")<role && turnBlock == false){
                        buttons.Reset = {
                            label: `Reset`,
                            callback: () => applyChanges = 2
                        }
                    }
                    //Check if the role of the user. If applicable, add ignore button
                    if (game.settings.get("StepCounter","IgnoreButton")<role){
                        buttons.Ignore = {
                            label: `Ignore`,
                            callback: () => applyChanges = 3
                        }
                    }
                    //Check if the user is player, add request button if enabled
                    if (game.settings.get("StepCounter","RequestButton")==true && role <4){
                        buttons.Request = {
                            label: `Request`,
                            callback: () => applyChanges = 4
                        }
                    }

                    let title = 'Too much movement!';
                    let content = ` You moved more than your speed allows<br><br>Moved: ` + Math.round(stepsTaken + token.getFlag('StepCounter','stepsTaken')) + ` Ft.<br>Speed: `+ speed + ` Ft.<br><br>`;
                    if (turnBlock) {
                        title = 'It is not your turn!';
                        content = ` You're trying to move, but it is not your turn<br><br>`;
                    }
                    let d = new Dialog({
                        title,
                        content,
                        buttons,
                        default: "Ignore",
                        close: html => {
                            //If 'Undo' is pressed, move token back to previous position
                            if (applyChanges == 0){ //undo
                                token.shiftPosition((oldPositionX - currentPositionX)/canvas.dimensions.size,(oldPositionY - currentPositionY)/canvas.dimensions.size,true);
                                setFlags(token, oldPositionX, oldPositionY, -1, -1, -1);
                                disableMoveKeys(false);
                            }
                            //if 'Dash' is pressed, apply dash and continue movement
                            else if (applyChanges == 1) { //dash
                                totalSteps = token.getFlag('StepCounter','stepsTaken') + stepsTaken;
                                setFlags(token, token.data.x, token.data.y, totalSteps, true, diagonal);
                                if (game.settings.get("StepCounter","ChatMessages")==true) 
                                    whisperGM(token.name + " used dash.");
                                disableMoveKeys(false);
                            }
                            //If 'Reset' is pressed, reset step counter and continue movement
                            else if (applyChanges == 2){ //reset
                                if (game.settings.get("StepCounter","ChatMessages")==true && role < 3) {
                                    let dash = "No";
                                    totalSteps = token.getFlag('StepCounter','stepsTaken') + stepsTaken;
                                    if (token.getFlag('StepCounter','dash')) dash = "Yes";
                                    whisperGM(token.name + "'s step counter was reset<br>Moved: " + totalSteps + "/" + speed + " Ft.<br>Dash: " + dash);
                                }
                                setFlags(token, token.data.x, token.data.y, stepsTaken, false, 0);
                                disableMoveKeys(false);
                            }
                            //If 'Ignore' is pressed, continue movement
                            else if (applyChanges == 3) { //ignore
                                totalSteps = token.getFlag('StepCounter','stepsTaken') + stepsTaken;
                                if (game.settings.get("StepCounter","ChatMessages")==true && role < 3) {
                                    let dash = "No";
                                    if (token.getFlag('StepCounter','dash')) dash = "Yes";
                                    if (turnBlock == false) 
                                        whisperGM(token.name + "'s step counter was ignored<br>Moved: " + totalSteps + "/" + speed + " Ft.<br>Dash: " + dash);
                                    else if (turnBlock == true) 
                                        whisperGM(token.name + " moved outside his/her turn");                                                                                    
                                }
                                setFlags(token, token.data.x, token.data.y, totalSteps, -1, diagonal);
                                disableMoveKeys(false);
                            }  
                            else if (applyChanges == 4) { //request movement
                                //Request movement from GM, then apply movement (GM can undo this)
                                totalSteps = token.getFlag('StepCounter','stepsTaken') + stepsTaken;
                                setFlags(token, token.data.x, token.data.y, totalSteps, -1, diagonal);
                                for (let i=0; i<game.data.users.length; i++)
                                    if (game.data.users[i].role > 2) {
                                        let msgType = "requestMovement_tooMuch";
                                        if (turnBlock == true) msgType = "requestMovement_noTurn";
                                        let payload = {
                                            msgType,
                                            "sender": game.userId, 
                                            "receiver": game.data.users[i]._id, 
                                            "tokenId": token.data._id,
                                            "oldX": oldPositionX,
                                            "oldY": oldPositionY,
                                            "stepsTaken": stepsTaken,
                                            "totalSteps": Math.floor(totalSteps),
                                            "diagonal": token.getFlag('StepCounter','diagonal')
                                        };
                                        game.socket.emit(`module.StepCounter`, payload);
                                    }
                            }
                        }
                    });
                    d.render(true);
                }               
            }
            else {
                totalSteps += stepsTaken;
                setFlags(token, token.data.x, token.data.y, totalSteps, -1, diagonal);
            }
            //displayBar(token,-1,-1);
        }
        timer = Date.now();
    })
})