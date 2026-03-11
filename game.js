const STAGE_URL = "./stages/stage-01.json";
const FLOOR_SYMBOL = "#";
const EMPTY_SYMBOL = ".";
const INNER_LINE_WIDTH = 1;
const OUTER_LINE_WIDTH = 4;
const BOARD_PADDING = OUTER_LINE_WIDTH;
const PLAYER_SCALE = 0.80;
const stageAreaElement = document.getElementById("stage-area");
const stageBoardElement = document.getElementById("stage-board");
const controlElements = Array.from(document.querySelectorAll("[data-move]"));

let currentStage = null;
let currentPlayer = null;
let currentCellSize = 0;
let playerElement = null;

function keyForCell(x, y) {
  return `${x},${y}`;
}

function parseStage(stageData) {
  if (!Array.isArray(stageData.grid) || stageData.grid.length === 0) {
    throw new Error("Stage JSON must include a non-empty grid array.");
  }

  const rows = stageData.grid.length;
  const cols = Math.max(...stageData.grid.map((row) => row.length));
  const floorCells = [];
  const floorSet = new Set();

  stageData.grid.map((row) => row.padEnd(cols, EMPTY_SYMBOL)).forEach((row, y) => {
    Array.from(row).forEach((cell, x) => {
      if (cell === FLOOR_SYMBOL) {
        floorCells.push({ x, y });
        floorSet.add(keyForCell(x, y));
      }
    });
  });

  if (floorCells.length === 0) {
    throw new Error("Stage JSON does not contain any floor cells.");
  }

  const playerStart = parsePlayerStart(stageData.playerStart, floorSet, floorCells[0]);

  return {
    rows,
    cols,
    floorCells,
    floorSet,
    playerStart,
  };
}

function parsePlayerStart(playerStart, floorSet, fallbackCell) {
  if (
    playerStart
    && Number.isInteger(playerStart.x)
    && Number.isInteger(playerStart.y)
    && floorSet.has(keyForCell(playerStart.x, playerStart.y))
  ) {
    return { x: playerStart.x, y: playerStart.y };
  }

  return { x: fallbackCell.x, y: fallbackCell.y };
}

function hasFloor(stage, x, y) {
  return stage.floorSet.has(keyForCell(x, y));
}

function getStageAreaSize() {
  const styles = window.getComputedStyle(stageAreaElement);
  const horizontalPadding =
    Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
  const verticalPadding =
    Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);

  return {
    width: stageAreaElement.clientWidth - horizontalPadding,
    height: stageAreaElement.clientHeight - verticalPadding,
  };
}

function createTile(cell, cellSize) {
  const tile = document.createElement("div");
  tile.className = "stage-tile";
  tile.style.left = `${BOARD_PADDING + cell.x * cellSize}px`;
  tile.style.top = `${BOARD_PADDING + cell.y * cellSize}px`;
  tile.style.width = `${cellSize}px`;
  tile.style.height = `${cellSize}px`;

  return tile;
}

function createLine(x, y, width, height) {
  const line = document.createElement("div");
  line.className = "stage-line";
  line.style.left = `${x}px`;
  line.style.top = `${y}px`;
  line.style.width = `${width}px`;
  line.style.height = `${height}px`;
  return line;
}

function createPlayer(cellSize) {
  const player = document.createElement("div");
  player.className = "stage-player";
  updatePlayerPosition(player, cellSize);
  return player;
}

function updatePlayerPosition(player, cellSize) {
  if (!currentPlayer) {
    return;
  }

  const playerSize = Math.max(4, Math.floor(cellSize * PLAYER_SCALE));
  const offset = Math.floor((cellSize - playerSize) / 2);
  player.style.left = `${BOARD_PADDING + currentPlayer.x * cellSize + offset}px`;
  player.style.top = `${BOARD_PADDING + currentPlayer.y * cellSize + offset}px`;
  player.style.width = `${playerSize}px`;
  player.style.height = `${playerSize}px`;
}

function createLinesForCell(stage, cell, cellSize) {
  const lines = [];
  const originX = BOARD_PADDING + cell.x * cellSize;
  const originY = BOARD_PADDING + cell.y * cellSize;
  const openTop = !hasFloor(stage, cell.x, cell.y - 1);
  const openRight = !hasFloor(stage, cell.x + 1, cell.y);
  const openBottom = !hasFloor(stage, cell.x, cell.y + 1);
  const openLeft = !hasFloor(stage, cell.x - 1, cell.y);
  const openTopLeft = !hasFloor(stage, cell.x - 1, cell.y - 1);
  const openTopRight = !hasFloor(stage, cell.x + 1, cell.y - 1);
  const openBottomRight = !hasFloor(stage, cell.x + 1, cell.y + 1);
  const openBottomLeft = !hasFloor(stage, cell.x - 1, cell.y + 1);

  if (hasFloor(stage, cell.x, cell.y - 1)) {
    lines.push(createLine(originX, originY, cellSize, INNER_LINE_WIDTH));
  }

  if (hasFloor(stage, cell.x - 1, cell.y)) {
    lines.push(createLine(originX, originY, INNER_LINE_WIDTH, cellSize));
  }

  if (openTop) {
    lines.push(createLine(originX, originY - OUTER_LINE_WIDTH, cellSize, OUTER_LINE_WIDTH));
  }

  if (openRight) {
    lines.push(createLine(originX + cellSize, originY, OUTER_LINE_WIDTH, cellSize));
  }

  if (openBottom) {
    lines.push(createLine(originX, originY + cellSize, cellSize, OUTER_LINE_WIDTH));
  }

  if (openLeft) {
    lines.push(createLine(originX - OUTER_LINE_WIDTH, originY, OUTER_LINE_WIDTH, cellSize));
  }

  if (openTop && openLeft && openTopLeft) {
    lines.push(
      createLine(
        originX - OUTER_LINE_WIDTH,
        originY - OUTER_LINE_WIDTH,
        OUTER_LINE_WIDTH,
        OUTER_LINE_WIDTH,
      ),
    );
  }

  if (openTop && openRight && openTopRight) {
    lines.push(
      createLine(
        originX + cellSize,
        originY - OUTER_LINE_WIDTH,
        OUTER_LINE_WIDTH,
        OUTER_LINE_WIDTH,
      ),
    );
  }

  if (openBottom && openRight && openBottomRight) {
    lines.push(
      createLine(
        originX + cellSize,
        originY + cellSize,
        OUTER_LINE_WIDTH,
        OUTER_LINE_WIDTH,
      ),
    );
  }

  if (openBottom && openLeft && openBottomLeft) {
    lines.push(
      createLine(
        originX - OUTER_LINE_WIDTH,
        originY + cellSize,
        OUTER_LINE_WIDTH,
        OUTER_LINE_WIDTH,
      ),
    );
  }

  return lines;
}

function renderStage() {
  if (!currentStage) {
    return;
  }

  const { width: availableWidth, height: availableHeight } = getStageAreaSize();

  if (!availableWidth || !availableHeight) {
    return;
  }

  const cellSize = Math.max(
    1,
    Math.floor(
      Math.min(
        (availableWidth - BOARD_PADDING * 2) / currentStage.cols,
        (availableHeight - BOARD_PADDING * 2) / currentStage.rows,
      ),
    ),
  );

  const boardWidth = cellSize * currentStage.cols + BOARD_PADDING * 2;
  const boardHeight = cellSize * currentStage.rows + BOARD_PADDING * 2;
  const tiles = currentStage.floorCells.map((cell) => createTile(cell, cellSize));
  const lines = currentStage.floorCells.flatMap((cell) => createLinesForCell(currentStage, cell, cellSize));
  currentCellSize = cellSize;
  playerElement = createPlayer(cellSize);

  stageBoardElement.style.width = `${boardWidth}px`;
  stageBoardElement.style.height = `${boardHeight}px`;
  stageBoardElement.replaceChildren(...tiles, ...lines, playerElement);
}

function movePlayer(dx, dy) {
  if (!currentStage || !currentPlayer) {
    return;
  }

  const nextX = currentPlayer.x + dx;
  const nextY = currentPlayer.y + dy;

  if (!hasFloor(currentStage, nextX, nextY)) {
    return;
  }

  currentPlayer = { x: nextX, y: nextY };

  if (playerElement) {
    updatePlayerPosition(playerElement, currentCellSize);
  }
}

function handleMove(direction) {
  if (direction === "up") {
    movePlayer(0, -1);
  }

  if (direction === "right") {
    movePlayer(1, 0);
  }

  if (direction === "down") {
    movePlayer(0, 1);
  }

  if (direction === "left") {
    movePlayer(-1, 0);
  }
}

function handleKeydown(event) {
  const key = event.key.toLowerCase();

  if (key === "arrowup" || key === "w") {
    event.preventDefault();
    handleMove("up");
  }

  if (key === "arrowright" || key === "d") {
    event.preventDefault();
    handleMove("right");
  }

  if (key === "arrowdown" || key === "s") {
    event.preventDefault();
    handleMove("down");
  }

  if (key === "arrowleft" || key === "a") {
    event.preventDefault();
    handleMove("left");
  }
}

function bindControls() {
  window.addEventListener("keydown", handleKeydown);

  controlElements.forEach((controlElement) => {
    controlElement.addEventListener("click", () => {
      handleMove(controlElement.dataset.move);
    });
  });
}

async function loadStage() {
  const response = await fetch(`${STAGE_URL}?t=${Date.now()}`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to load stage JSON: ${response.status}`);
  }

  return response.json();
}

async function bootstrap() {
  try {
    const stageData = await loadStage();
    currentStage = parseStage(stageData);
    currentPlayer = { ...currentStage.playerStart };
    renderStage();
    bindControls();

    const resizeObserver = new ResizeObserver(() => {
      renderStage();
    });

    resizeObserver.observe(stageAreaElement);
  } catch (error) {
    console.error(error);
    stageBoardElement.replaceChildren();
  }
}

bootstrap();
