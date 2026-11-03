//Initialize the express 'app' object
let express = require("express");
let app = express();

//Initialize HTTP server
let http = require("http");
let server = http.createServer(app);

//Initialize socket.io
let io = require("socket.io");
io = new io.Server(server);

app.use("/", express.static("public"));

//'port' variable allows for deployment
let port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log("App listening at port: " + port);
});

//The shared composition lives on the server so late joiners see it too.
//Keys look like "step,row" and values are instrument numbers (0-3).
const STEPS = 16;
const ROWS = 10;
const INSTRUMENTS = 4;
let notes = {};
let bpm = 110;   //shared tempo, 80-160

io.on("connection", (socket) => {
  console.log("We have a new client: " + socket.id);

  //Catch the new client up on what has been written so far
  socket.emit("init", notes);
  socket.emit("tempo-share", bpm);
  io.emit("users", io.engine.clientsCount);

  //A client placed or removed a note (inst === null means remove)
  socket.on("note", (data) => {
    let { step, row, inst } = data;
    let valid =
      Number.isInteger(step) && step >= 0 && step < STEPS &&
      Number.isInteger(row) && row >= 0 && row < ROWS &&
      (inst === null || (Number.isInteger(inst) && inst >= 0 && inst < INSTRUMENTS));
    if (!valid) return;

    let key = step + "," + row;
    if (inst === null) delete notes[key];
    else notes[key] = inst;

    //Send to ALL clients, including the sender
    io.emit("note-share", { step, row, inst });
  });

  //Everyone starts and stops playback together
  socket.on("transport", (playing) => {
    io.emit("transport-share", !!playing);
  });

  //Anyone can change the tempo for everybody
  socket.on("tempo", (value) => {
    if (!Number.isFinite(value) || value < 80 || value > 160) return;
    bpm = Math.round(value);
    io.emit("tempo-share", bpm);
  });

  socket.on("clear", () => {
    notes = {};
    io.emit("init", notes);
  });

  socket.on("disconnect", () => {
    console.log("A client has disconnected: " + socket.id);
    io.emit("users", io.engine.clientsCount);
  });
});