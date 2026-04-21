const socket = io();

let gameId;
let playerNumber;
let isYourTurn = false;
let gameState = {
  placedShips: [],
  currentShipIndex: 0,
  shipsToPlace: [5, 4, 3, 3, 2],
  enemyHitGrid: createEmptyGrid(),
  yourHitGrid: createEmptyGrid()
};

function createEmptyGrid() {
  return Array(10).fill(null).map(() => Array(10).fill('unknown'));
}


function joinGame() {
  const gameIdInput = document.getElementById('gameIdInput').value.trim();
  if (!gameIdInput) {
    showMessage('Ange ett Game ID', 'error', 'joinMessage');
    return;
  }
  gameId = gameIdInput;
  socket.emit('join_game', gameId);
}


socket.on('game_joined', (data) => {
  playerNumber = data.playerNumber;
  showMessage(data.message, 'success', 'joinMessage');
  setTimeout(() => {
    showScreen('placementScreen');
    updatePlacementUI();
    renderPlacementGrid();
  }, 500);
});

socket.on('game_ready', (data) => showMessage(data.message, 'success', 'placementMessage'));
socket.on('game_error', (message) => showMessage(message, 'error', 'placementMessage'));

socket.on('ship_placed', (data) => {
  gameState.placedShips.push(data);
  gameState.currentShipIndex++;
  updatePlacementUI();
  renderPlacementGrid();
  if (gameState.currentShipIndex >= gameState.shipsToPlace.length) {
    document.getElementById('readyBtn').disabled = false;
    showMessage('Alla fartyg placerade! Klicka "Börja spela"', 'success', 'placementMessage');
  }
});

socket.on('waiting_message', (message) => showMessage(message, 'info', 'placementMessage'));

socket.on('game_start', (data) => {
  if (data.yourPlayerNumber) {
    playerNumber = data.yourPlayerNumber;
  }
  setTimeout(() => {
    showScreen('gameScreen');
    updateGameStatus(data.currentPlayer);
    renderGameGrids();
    showMessage('Spelet börjar!', 'success', 'gameMessage');
  }, 500);
});

socket.on('fire_result', (data) => {
  if (data.youAttacked) {
    gameState.enemyHitGrid[data.y][data.x] = data.result;
  } else {
    gameState.yourHitGrid[data.y][data.x] = data.result;
  }
  updateGameStatus(data.currentPlayer);
  renderGameGrids();
});

socket.on('game_over', (data) => {
  const overlay = document.getElementById('gameOverOverlay');
  const gameOverMessage = document.getElementById('gameOverMessage');
  const gameOverSubtext = document.getElementById('gameOverSubtext');
  const youWon = data.winner === socket.id;

  if (youWon) {
    gameOverMessage.textContent = 'DU VANN!';
    gameOverMessage.className = 'win';
    gameOverSubtext.textContent = 'Alla fiendens skepp är sänkta!';
  } else {
    gameOverMessage.textContent = 'Du förlorade..';
    gameOverMessage.className = 'lose';
    gameOverSubtext.textContent = 'Alla dina skepp är sänkta.';
  }

  
  isYourTurn = false;
  renderGameGrids();

  setTimeout(() => {
    overlay.classList.add('show');
  }, 500);
});

socket.on('opponent_left', () => showScreen('opponentLeftScreen'));



function updatePlacementUI() {
  if (gameState.currentShipIndex >= gameState.shipsToPlace.length) {
    const total = gameState.shipsToPlace.length;
    document.getElementById('currentShip').textContent = `Alla fartyg placerade (${total}/${total})`;
    document.getElementById('placementProgress').textContent = '✅ Du är klar!';
  } else {
    const shipSize = gameState.shipsToPlace[gameState.currentShipIndex];
    const current = gameState.currentShipIndex + 1;
    const total = gameState.shipsToPlace.length;
    document.getElementById('currentShip').textContent = `Lägg ut ditt skepp på ${shipSize} rutor`;
    document.getElementById('placementProgress').textContent = `Fartyg ${current}/${total}`;
  }
}

function renderPlacementGrid() {
  const el = document.getElementById('placementGrid');
  el.innerHTML = '';

  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.x = x;
      cell.dataset.y = y;

      let hasShip = false;
      for (let ship of gameState.placedShips) {
        if ((ship.isHorizontal && ship.y === y && x >= ship.x && x < ship.x + ship.length) ||
            (!ship.isHorizontal && ship.x === x && y >= ship.y && y < ship.y + ship.length)) {
          cell.classList.add('ship');
          hasShip = true;
          break;
        }
      }

      if (!hasShip && gameState.currentShipIndex < gameState.shipsToPlace.length) {
        cell.style.cursor = 'pointer';

        cell.addEventListener('mouseenter', () => {
          highlightPreview(x, y);
        });

        cell.addEventListener('mouseleave', () => {
          clearPreview();
        });

        cell.addEventListener('click', (e) => {
          e.preventDefault();
          if (canPlaceHere(x, y)) {
            placeShip(x, y);
          } else {
            showMessage("Kan inte placera skeppet där!", "error", "placementMessage");
          }
        });
      }

      el.appendChild(cell);
    }
  }
}

function highlightPreview(startX, startY) {
  clearPreview();
  if (gameState.currentShipIndex >= gameState.shipsToPlace.length) return;

  const length = gameState.shipsToPlace[gameState.currentShipIndex];
  const hor = document.getElementById('horizontalToggle').checked;
  const valid = canPlaceHere(startX, startY);

  for (let i = 0; i < length; i++) {
    const px = hor ? startX + i : startX;
    const py = hor ? startY : startY + i;

    if (px > 9 || py > 9) continue;

    const cell = document.querySelector(
      `#placementGrid .cell[data-x="${px}"][data-y="${py}"]`
    );

    if (cell) {
      cell.classList.add(valid ? 'preview-valid' : 'preview-invalid');
    }
  }
}

function clearPreview() {
  document.querySelectorAll('#placementGrid .cell').forEach(cell => {
    cell.classList.remove('preview-valid', 'preview-invalid');
  });
}

function canPlaceHere(x, y) {
  if (gameState.currentShipIndex >= gameState.shipsToPlace.length) return false;
  const length = gameState.shipsToPlace[gameState.currentShipIndex];
  const hor = document.getElementById('horizontalToggle').checked;
  for (let i = 0; i < length; i++) {
    let xx = hor ? x + i : x;
    let yy = hor ? y : y + i;
    if (xx > 9 || yy > 9) return false;
    for (let ship of gameState.placedShips) {
      if (ship.isHorizontal && ship.y === yy && xx >= ship.x && xx < ship.x + ship.length) return false;
      if (!ship.isHorizontal && ship.x === xx && yy >= ship.y && yy < ship.y + ship.length) return false;
    }
  }
  return true;
}

function placeShip(x, y) {
  const length = gameState.shipsToPlace[gameState.currentShipIndex];
  const isHorizontal = document.getElementById('horizontalToggle').checked;
  socket.emit('place_ship', { gameId, x, y, length, isHorizontal });
}

function clearShips() {
  
  socket.emit('clear_ships', gameId);

  gameState.placedShips = [];
  gameState.currentShipIndex = 0;
  document.getElementById('readyBtn').disabled = true;
  updatePlacementUI();
  renderPlacementGrid();
  showMessage('Alla fartyg rensade!', 'info', 'placementMessage');
}

function readyToPlay() {
  socket.emit('ships_ready', gameId);
  document.getElementById('readyBtn').disabled = true;
  showMessage('Väntar på motståndaren...', 'info', 'placementMessage');
}


function renderGameGrids() {
  renderEnemyGrid();
  renderYourGrid();
  updateStats();
}

function renderEnemyGrid() {
  const container = document.getElementById('enemyGrid');
  container.innerHTML = '';
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const status = gameState.enemyHitGrid[y][x];
      if (status === 'hit') {
        cell.classList.add('hit');
        cell.textContent = '💥';
      } else if (status === 'miss') {
        cell.classList.add('miss');
        cell.textContent = '✕';
      }
      if (isYourTurn && status === 'unknown') {
        cell.style.cursor = 'crosshair';
        cell.addEventListener('click', () => fireAtTarget(x, y));
      } else if (status !== 'unknown') {
        cell.style.cursor = 'not-allowed';
        cell.style.opacity = '0.7';
      } else {
        cell.style.cursor = 'default';
      }
      container.appendChild(cell);
    }
  }
}

function renderYourGrid() {
  const container = document.getElementById('yourGrid');
  container.innerHTML = '';
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const status = gameState.yourHitGrid[y][x];
      if (status === 'hit') {
        cell.classList.add('hit');
        cell.textContent = '💥';
      } else if (status === 'miss') {
        cell.classList.add('miss');
        cell.textContent = '✕';
      }
      let hasShip = false;
      for (let ship of gameState.placedShips) {
        if ((ship.isHorizontal && ship.y === y && x >= ship.x && x < ship.x + ship.length) ||
            (!ship.isHorizontal && ship.x === x && y >= ship.y && y < ship.y + ship.length)) {
          hasShip = true;
          break;
        }
      }
      if (hasShip && status !== 'hit') cell.classList.add('ship');
      container.appendChild(cell);
    }
  }
}

function fireAtTarget(x, y) {
  if (!isYourTurn) return;
  if (gameState.enemyHitGrid[y][x] !== 'unknown') {
    showMessage('Du har redan skjutit där!', 'error', 'gameMessage');
    return;
  }
  socket.emit('fire', { gameId, x, y });
  isYourTurn = false;
  renderGameGrids();
}

function updateGameStatus(currentPlayer) {
  const statusEl = document.getElementById('status');
  isYourTurn = (currentPlayer === playerNumber);
  if (isYourTurn) {
    statusEl.className = 'your-turn';
    statusEl.textContent = 'Din tur - klicka på fiendens grid!';
  } else {
    statusEl.className = 'enemy-turn';
    statusEl.textContent = 'Motståndarens tur...';
  }
}

function updateStats() {
  const enemyHits = gameState.enemyHitGrid.flat().filter(cell => cell === 'hit').length;
  const yourHits = gameState.yourHitGrid.flat().filter(cell => cell === 'hit').length;
  document.getElementById('enemy-stats').textContent = `Träffar: ${enemyHits}/17`;
  document.getElementById('your-stats').textContent = `Träffar på dig: ${yourHits}/17`;
}


function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

function showMessage(message, type, elementId) {
  const element = document.getElementById(elementId);
  if (element.tagName === 'P') {
    element.textContent = message;
  } else {
    element.textContent = message;
    element.className = `message-zone show ${type}`;
    setTimeout(() => { element.classList.remove('show'); }, 4000);
  }
}