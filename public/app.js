//Initialize and connect socket
let socket = io();

socket.on('connect', () => {
    console.log("Connected");
});

//---- Settings you can tweak ----
const STEPS = 16;
const BPM = 110;
//MIDI note numbers, top row to bottom row (C major pentatonic, so it always sounds ok)
const ROWS = [79, 76, 74, 72, 69, 67, 64, 62, 60, 57];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

//Each instrument is a waveform + a simple volume envelope
const INSTRUMENTS = [
    { name: 'Bell',  color: '#ffd166', wave: 'sine',     vol: 0.30, len: 0.9 },
    { name: 'Chip',  color: '#ef476f', wave: 'square',   vol: 0.10, len: 0.2 },
    { name: 'Buzz',  color: '#06d6a0', wave: 'sawtooth', vol: 0.12, len: 0.3 },
    { name: 'Flute', color: '#4cc9f0', wave: 'triangle', vol: 0.30, len: 0.5 }
];

//---- State ----
let notes = {};          //"step,row" -> instrument number, mirrors the server
let myInst = 0;          //instrument this user is writing with
let playing = false;
let playStep = -1;
let timer = null;
let audioCtx = null;

//Layout numbers, recalculated on resize
let labelW = 52, cellW, cellH, gridTop = 10;

function setup() {
    let holder = document.getElementById('roll');
    let c = createCanvas(holder.clientWidth, holder.clientHeight);
    c.parent('roll');
    textFont('Bricolage Grotesque');
    layout();
    buildToolbar();
}

function windowResized() {
    let holder = document.getElementById('roll');
    resizeCanvas(holder.clientWidth, holder.clientHeight);
    layout();
}

function layout() {
    cellW = (width - labelW - 16) / STEPS;
    cellH = Math.min((height - gridTop - 10) / ROWS.length, 60);
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
    let step = Math.floor((mouseX - labelW) / cellW);
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
        timer = setInterval(tick, 60000 / BPM / 2);   //eighth notes
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
    background('#171a33');
    textAlign(RIGHT, CENTER);
    textSize(13);

    for (let row = 0; row < ROWS.length; row++) {
        let y = gridTop + row * cellH;
        fill('#9a9cc8');
        noStroke();
        text(NOTE_NAMES[ROWS[row] % 12] + (Math.floor(ROWS[row] / 12) - 1), labelW - 10, y + cellH / 2);

        for (let step = 0; step < STEPS; step++) {
            let x = labelW + step * cellW;

            //Darker cells mark each group of four beats
            fill(Math.floor(step / 4) % 2 === 0 ? '#20244a' : '#1b1f40');
            stroke('#2c3160');
            rect(x, y, cellW, cellH);

            let inst = notes[step + ',' + row];
            if (inst !== undefined) {
                fill(INSTRUMENTS[inst].color);
                noStroke();
                rect(x + 3, y + 3, cellW - 6, cellH - 6, 6);
            }
        }
    }

    //Playhead
    if (playing && playStep >= 0) {
        noFill();
        stroke('#eceaff');
        strokeWeight(2);
        rect(labelW + playStep * cellW, gridTop, cellW, cellH * ROWS.length);
        strokeWeight(1);
    }
}