const STAGE_URL = "./stages/stage-01.json";
const FLOOR_SYMBOL = "#";
const EMPTY_SYMBOL = ".";
const INNER_LINE_WIDTH = 1;
const OUTER_LINE_WIDTH = 4;
const BOARD_PADDING = OUTER_LINE_WIDTH;
const stageAreaElement = document.getElementById("stage-area");
const stageBoardElement = document.getElementById("stage-board");

let currentStage = null;

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

  return {
    id: stageData.id ?? "stage",
    rows,
    cols,
    floorCells,
    floorSet,
  };
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

  stageBoardElement.style.width = `${boardWidth}px`;
  stageBoardElement.style.height = `${boardHeight}px`;
  stageBoardElement.replaceChildren(...tiles, ...lines);
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
    renderStage();

    const resizeObserver = new ResizeObserver(() => {
      renderStage();
    });

    resizeObserver.observe(stageAreaElement);
    window.addEventListener("resize", renderStage);
  } catch (error) {
    console.error(error);
    stageBoardElement.replaceChildren();
  }
}

bootstrap();
