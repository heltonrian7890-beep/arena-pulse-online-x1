const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const rooms = {};

function makeCode() {
  return "AP" + Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on("connection", (socket) => {
  socket.on("createRoom", (name) => {
    const code = makeCode();
    rooms[code] = {
      players: {
        p1: { id: socket.id, name: name || "Jogador 1", input: {} },
        p2: null
      },
      state: null
    };

    socket.join(code);
    socket.emit("roomCreated", { code, player: "p1" });
  });

  socket.on("joinRoom", ({ code, name }) => {
    code = String(code || "").toUpperCase();

    if (!rooms[code]) {
      socket.emit("errorMsg", "Sala não encontrada.");
      return;
    }

    if (rooms[code].players.p2) {
      socket.emit("errorMsg", "Sala cheia.");
      return;
    }

    rooms[code].players.p2 = { id: socket.id, name: name || "Jogador 2", input: {} };
    socket.join(code);

    socket.emit("roomJoined", { code, player: "p2" });
    io.to(code).emit("startMatch", {
      code,
      p1Name: rooms[code].players.p1.name,
      p2Name: rooms[code].players.p2.name
    });
  });

  socket.on("playerInput", ({ code, player, input }) => {
    const room = rooms[code];
    if (!room || !room.players[player]) return;
    if (room.players[player].id !== socket.id) return;

    room.players[player].input = input || {};
    socket.to(code).emit("remoteInput", { player, input });
  });

  socket.on("gameState", ({ code, state }) => {
    const room = rooms[code];
    if (!room) return;

    // P1 será o host da física.
    if (room.players.p1 && room.players.p1.id === socket.id) {
      room.state = state;
      socket.to(code).emit("syncState", state);
    }
  });

  socket.on("disconnect", () => {
    for (const code of Object.keys(rooms)) {
      const room = rooms[code];
      if (room.players.p1 && room.players.p1.id === socket.id) {
        io.to(code).emit("errorMsg", "O jogador 1 saiu da sala.");
        delete rooms[code];
      } else if (room.players.p2 && room.players.p2.id === socket.id) {
        io.to(code).emit("errorMsg", "O jogador 2 saiu da sala.");
        room.players.p2 = null;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Arena Pulse X1 rodando em http://localhost:${PORT}`);
});