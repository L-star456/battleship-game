const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const port = 3000;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const games = {};
const players = {};

function createEmptyGrid() {
  return Array(10).fill().map(() => Array(10).fill('empty'));
}

function createHitGrid() {
  return Array(10).fill().map(() => Array(10).fill('unknown'));
}

io.on('connection', (socket) => {

  socket.on('join_game', (gameId) => {
    if (!games[gameId]) {
      games[gameId] = {
        player1: socket.id,
        player2: null,
        player1Grid: createEmptyGrid(),
        player2Grid: createEmptyGrid(),
        player1Hit: createHitGrid(),
        player2Hit: createHitGrid(),
        player1Done: false,
        player2Done: false,
        turn: null,
        status: "setup"
      };

      players[socket.id] = { gameId, player: 1 };

      socket.emit('game_joined', {
        playerNumber: 1,
        message: "Väntar på motståndare..."
      });

    } else if (!games[gameId].player2) {

      games[gameId].player2 = socket.id;
      players[socket.id] = { gameId, player: 2 };

      socket.emit('game_joined', {
        playerNumber: 2,
        message: "Börja placera dina skepp!"
      });

      io.to(games[gameId].player1).emit('game_ready', {
        message: "Motståndare ansluten! Börja placera dina skepp!"
      });

      io.to(games[gameId].player2).emit('game_ready', {
        message: "Motståndare ansluten! Börja placera dina skepp!"
      });

    } else {
      socket.emit('game_error', 'Spelet är fullt!');
    }
  });

  socket.on('place_ship', (packet) => {
    const { gameId, x, y, length, isHorizontal } = packet;
    const { player } = players[socket.id] || {};
    const game = games[gameId];
    if (!game || !player) return;

    let grid = player === 1 ? game.player1Grid : game.player2Grid;

    let canPlace = true;

    for (let i = 0; i < length; i++) {
      let nx = isHorizontal ? x + i : x;
      let ny = isHorizontal ? y : y + i;

      if (nx > 9 || ny > 9 || grid[ny][nx] !== "empty") {
        canPlace = false;
      }
    }

    if (!canPlace) {
      socket.emit('game_error', "Kan inte placera där.");
      return;
    }

    for (let i = 0; i < length; i++) {
      let nx = isHorizontal ? x + i : x;
      let ny = isHorizontal ? y : y + i;

      grid[ny][nx] = `ship_${length}`;
    }

    socket.emit('ship_placed', { x, y, length, isHorizontal });
  });

  
  socket.on('clear_ships', (gameId) => {
    const { player } = players[socket.id] || {};
    const game = games[gameId];
    if (!game || !player) return;

    if (player === 1) {
      game.player1Grid = createEmptyGrid();
      game.player1Done = false;
    } else {
      game.player2Grid = createEmptyGrid();
      game.player2Done = false;
    }
  });

  socket.on('ships_ready', (gameId) => {
    const { player } = players[socket.id] || {};
    const game = games[gameId];
    if (!game || !player) return;

    if (player === 1) game.player1Done = true;
    else game.player2Done = true;

    if (game.player1Done && game.player2Done) {
      game.status = "playing";

      
      game.turn = Math.random() < 0.5 ? 1 : 2;

      io.to(game.player1).emit('game_start', {
        currentPlayer: game.turn,
        yourPlayerNumber: 1
      });

      io.to(game.player2).emit('game_start', {
        currentPlayer: game.turn,
        yourPlayerNumber: 2
      });
    } else {
      socket.emit('waiting_message', 'Väntar på att motståndaren placerar sina skepp...');
    }
  });

  socket.on('fire', ({ gameId, x, y }) => {
    const game = games[gameId];
    const me = players[socket.id]?.player;

    if (!game || !me) return;

    if ((me === 1 && game.turn !== 1) || (me === 2 && game.turn !== 2)) {
      socket.emit('game_error', "Inte din tur!");
      return;
    }

    
    let myHitGrid = me === 1 ? game.player1Hit : game.player2Hit;
    let enemyGrid = me === 1 ? game.player2Grid : game.player1Grid;
    let enemySocket = me === 1 ? game.player2 : game.player1;

    if (myHitGrid[y][x] !== "unknown") {
      socket.emit('game_error', "Redan skjutit här!");
      return;
    }

    let result = "miss";
    if (enemyGrid[y][x].startsWith("ship_")) {
      result = "hit";
    }

    myHitGrid[y][x] = result;

    
    game.turn = me === 1 ? 2 : 1;
    const nextPlayer = game.turn;

    
    io.to(socket.id).emit('fire_result', {
      x,
      y,
      result,
      youAttacked: true,
      currentPlayer: nextPlayer
    });

    
    io.to(enemySocket).emit('fire_result', {
      x,
      y,
      result,
      youAttacked: false,
      currentPlayer: nextPlayer
    });

  
    let hits = 0;
    for (let row of myHitGrid) {
      for (let cell of row) {
        if (cell === "hit") hits++;
      }
    }

    if (hits >= 17) {
      io.to(game.player1).emit('game_over', { winner: socket.id });
      io.to(game.player2).emit('game_over', { winner: socket.id });
    }
  });

  socket.on('disconnect', () => {
    if (!players[socket.id]) return;

    const { gameId } = players[socket.id];
    delete players[socket.id];

    if (games[gameId]) {
      const game = games[gameId];
      const otherSocket = game.player1 === socket.id ? game.player2 : game.player1;
      if (otherSocket) {
        io.to(otherSocket).emit('opponent_left');
      }
      delete games[gameId];
    }
  });

});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});