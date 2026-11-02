//Initialize and connect socket
let socket = io();

socket.on('connect', () => {
    console.log("Connected");
});

//---- Settings you can tweak ----
const STEPS = 16;
let bpm = 110;   //shared tempo, set by the slider (80-160)
//MIDI note numbers, top row to bottom row (C major pentatonic, so it always sounds ok)
const ROWS = [79, 76, 74, 72, 69, 67, 64, 62, 60, 57];

//Each instrument is a waveform + a simple volume envelope
const INSTRUMENTS = [
    { name: 'Bell',  color: '#ff5fc4', wave: 'sine',     vol: 0.30, len: 0.9 },
    { name: 'Chip',  color: '#ffe500', wave: 'square',   vol: 0.10, len: 0.2 },
    { name: 'Buzz',  color: '#5dff9a', wave: 'sawtooth', vol: 0.12, len: 0.3 },
    { name: 'Flute', color: '#ff9f1c', wave: 'triangle', vol: 0.30, len: 0.5 }
];

//---- State ----
let notes = {};          //"step,row" -> instrument number, mirrors the server
let myInst = 0;          //instrument this user is writing with
let playing = false;
let playStep = -1;
let timer = null;
let audioCtx = null;

//Layout numbers, recalculated on resize
let gridLeft = 8, gridTop = 8, cellW, cellH;

function setup() {
    let holder = document.getElementById('roll');
    let c = createCanvas(holder.clientWidth, holder.clientHeight);
    c.parent('roll');
    textFont('Orbitron');
    layout();
    buildToolbar();
}

function windowResized() {
    let holder = document.getElementById('roll');
    resizeCanvas(holder.clientWidth, holder.clientHeight);
    layout();
}

function layout() {
    cellW = (width - gridLeft * 2) / STEPS;
    cellH = (height - gridTop * 2) / ROWS.length;
}

//---- Toolbar ----
function buildToolbar() {
    let box = document.getElementById('instruments');
    INSTRUMENTS.forEach((inst, i) => {
        let b = document.createElement('button');
        b.className = 'inst';
        b.textContent = inst.name;
        b.style.setProperty('--c', inst.color);
        b.setAttribute('aria-pressed', i === myInst);
        b.addEventListener('click', () => {
            myInst = i;
            box.querySelectorAll('button').forEach((el, j) => el.setAttribute('aria-pressed', j === i));
            enableAudio();
            playNote(i, ROWS[5]);   //preview the sound you picked
        });
        box.appendChild(b);
    });

    document.getElementById('tempo').addEventListener('input', (e) => {
        socket.emit('tempo', Number(e.target.value));
    });

    document.getElementById('sound').addEventListener('click', enableAudio);
    document.getElementById('clear').addEventListener('click', () => socket.emit('clear'));
    document.getElementById('play').addEventListener('click', () => {
        enableAudio();
        socket.emit('transport', !playing);
    });
}

//Browsers block audio until the person interacts with the page
function enableAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    document.getElementById('sound').classList.add('on');
}

//---- Placing notes ----
function mousePressed() {
    let step = Math.floor((mouseX - gridLeft) / cellW);
    let row = Math.floor((mouseY - gridTop) / cellH);
    if (step < 0 || step >= STEPS || row < 0 || row >= ROWS.length) return;

    //Clicking a note you already have of the same instrument removes it
    let existing = notes[step + ',' + row];
    let inst = existing === myInst ? null : myInst;
    socket.emit('note', { step: step, row: row, inst: inst });
}

//---- Listening to the server ----
//Full state, sent on connect and after a clear
socket.on('init', (data) => {
    notes = data;
});

//One note changed
socket.on('note-share', (data) => {
    let key = data.step + ',' + data.row;
    if (data.inst === null) {
        delete notes[key];
    } else {
        notes[key] = data.inst;
        if (!playing) playNote(data.inst, ROWS[data.row]);   //hear what others write
    }
});

//Tempo changed (by anyone); keep playing without losing our place
socket.on('tempo-share', (value) => {
    bpm = value;
    document.getElementById('tempo').value = value;
    if (playing) {
        clearInterval(timer);
        timer = setInterval(tick, 60000 / bpm / 2);
    }
});

socket.on('users', (n) => {
    document.getElementById('users').textContent = n + (n === 1 ? ' person here' : ' people here');
});

socket.on('transport-share', (shouldPlay) => {
    playing = shouldPlay;
    let btn = document.getElementById('play');
    btn.textContent = playing ? 'Stop' : 'Play';
    btn.setAttribute('aria-pressed', playing);

    clearInterval(timer);
    playStep = -1;
    if (playing) {
        tick();
        timer = setInterval(tick, 60000 / bpm / 2);   //eighth notes
    }
});

//---- Playback ----
function tick() {
    playStep = (playStep + 1) % STEPS;
    for (let row = 0; row < ROWS.length; row++) {
        let inst = notes[playStep + ',' + row];
        if (inst !== undefined) playNote(inst, ROWS[row]);
    }
}

function playNote(instNum, midi) {
    if (!audioCtx) return;
    let inst = INSTRUMENTS[instNum];
    let t = audioCtx.currentTime;
    let osc = audioCtx.createOscillator();
    let gain = audioCtx.createGain();
    osc.type = inst.wave;
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(inst.vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + inst.len);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + inst.len + 0.05);
}

//---- Drawing ----
function draw() {
    clear();   //transparent, so the dark blue screen behind the canvas shows through

    let gap = 3;   //space between pads

    for (let row = 0; row < ROWS.length; row++) {
        let y = gridTop + row * cellH;

        for (let step = 0; step < STEPS; step++) {
            let px = gridLeft + step * cellW + gap / 2;
            let py = y + gap / 2;
            let pw = cellW - gap;
            let ph = cellH - gap;

            //Empty pad: slightly lighter for every other group of four beats
            noStroke();
            fill(255, 255, 255, Math.floor(step / 4) % 2 === 0 ? 46 : 28);
            rect(px, py, pw, ph);

            //Bevel: light top and left edges, dark bottom and right edges
            fill(255, 255, 255, 70);
            rect(px, py, pw, 2);
            rect(px, py, 2, ph);
            fill(12, 26, 82, 110);
            rect(px, py + ph - 2, pw, 2);
            rect(px + pw - 2, py, 2, ph);

            let inst = notes[step + ',' + row];
            if (inst !== undefined) {
                //Note pad: solid color, hard outline, glossy edges
                fill(INSTRUMENTS[inst].color);
                stroke('#0c1a52');
                strokeWeight(2);
                rect(px, py, pw, ph);

                noStroke();
                fill(255, 255, 255, 170);
                rect(px + 2, py + 2, pw - 4, 3);
                rect(px + 2, py + 2, 3, ph - 4);
                fill(0, 0, 0, 55);
                rect(px + 2, py + ph - 5, pw - 4, 3);

                //Flash white when the playhead hits it
                if (playing && step === playStep) {
                    fill(255, 255, 255, 140);
                    rect(px, py, pw, ph);
                }
            }
        }
    }

    //Playhead: a boxed white column
    if (playing && playStep >= 0) {
        fill(255, 255, 255, 40);
        stroke('#ffffff');
        strokeWeight(3);
        rect(gridLeft + playStep * cellW, gridTop, cellW, cellH * ROWS.length);
    }
}