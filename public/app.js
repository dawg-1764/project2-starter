//Initialize and connect socket
let socket = io();

socket.on('connect', () => {
    console.log("Connected");
});

//Each sound gets its own color
let soundColors = {
    kick: '#e63946',
    snare: '#f4a261',
    clap: '#2a9d8f',
    airhorn: '#6a4c93'
};

let soundNames = Object.keys(soundColors);
let sounds = {};
let soundEnabled = false;

let myDiameter;

function setup() {
    createCanvas(windowWidth, windowHeight);
    background(240);

    myDiameter = random(30, 100);

    //Load audio files
    for (let name of soundNames) {
        sounds[name] = new Audio('sounds/' + name + '.mp3');
    }

    let enableBtn = createButton('Click to enable sound');
    enableBtn.position(20, 20);
    enableBtn.mousePressed(() => {
        soundEnabled = true;
        enableBtn.hide();
    });

    //One button per sound, colored to match
    soundNames.forEach((name, i) => {
        let btn = createButton(name);
        btn.position(20 + i * 100, 70);
        btn.style('background-color', soundColors[name]);
        btn.style('color', 'white');
        btn.style('border', 'none');
        btn.style('padding', '10px 16px');
        btn.mousePressed(() => sendSound(name));
    });
}

function sendSound(name) {
    let soundData = {
        sound: name,
        x: random(width),
        y: random(height),
        color: soundColors[name],
        d: myDiameter
    };

    socket.emit('message', soundData);
}

socket.on('message-share', (data) => {
    console.log(data);
    playSound(data.sound);
    drawEllipse(data);
});

function playSound(name) {
    if (!soundEnabled || !sounds[name]) return;
    sounds[name].cloneNode().play();
}

function drawEllipse(obj) {
    let c = color(obj.color);
    c.setAlpha(150);
    fill(c);
    noStroke();
    ellipse(obj.x, obj.y, obj.d, obj.d);
}