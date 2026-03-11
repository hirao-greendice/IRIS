const STAGE_URL = "./stages/stage-01.json";
const FLOOR_SYMBOL = "#";
const EMPTY_SYMBOL = ".";
const BLOCK_SCALE = 0.9;
const INNER_LINE_WIDTH = 1;
const OUTER_LINE_WIDTH = 4;
const BOARD_PADDING = OUTER_LINE_WIDTH;
const PLAYER_SCALE = 0.8;
const SWIPE_THRESHOLD = 24;
const SVG_NS = "http://www.w3.org/2000/svg";
const stageAreaElement = document.getElementById("stage-area");
const stageBoardElement = document.getElementById("stage-board");

let currentStage = null;
let currentPlayer = null;
let currentBlocks = [];
let swipeStart = null;
let blockMaskCounter = 0;

function keyForCell(x, y) {
  return `${x},${y}`;
}

function createBlock(id, color, cells) {
  return {
    id,
    color,
    cells,
    cellSet: new Set(cells.map((cell) => keyForCell(cell.x, cell.y))),
  };
}

function createBlockWithContent(id, color, cells, content) {
  return {
    ...createBlock(id, color, cells),
    content,
  };
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
  const initialBlocks = parseBlocks(stageData.blocks, floorSet);

  if (findBlockIndexAt(playerStart.x, playerStart.y, initialBlocks) !== -1) {
    throw new Error("Player start overlaps a block.");
  }

  return {
    rows,
    cols,
    floorCells,
    floorSet,
    showGrid: stageData.showGrid !== false,
    playerStart,
    initialBlocks,
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

function parseBlockContent(contentConfig) {
  if (!contentConfig || typeof contentConfig !== "object") {
    return null;
  }

  if (contentConfig.type === "text") {
    return {
      type: "text",
      text: String(contentConfig.text ?? ""),
      position: parsePlacement(contentConfig.position),
      size: parseSize(contentConfig.size, { width: 0.84, height: 0.42 }),
      rotation: Number.isFinite(contentConfig.rotation) ? contentConfig.rotation : 0,
      opacity: Number.isFinite(contentConfig.opacity) ? contentConfig.opacity : 1,
      align: contentConfig.align ?? "center",
      font: {
        family: contentConfig.font?.family ?? "\"Segoe UI\", sans-serif",
        size: Number.isFinite(contentConfig.font?.size) ? contentConfig.font.size : 0.24,
        sizeUnit: contentConfig.font?.sizeUnit === "px" ? "px" : "ratio",
        weight: contentConfig.font?.weight ?? "700",
        style: contentConfig.font?.style ?? "normal",
        color: contentConfig.font?.color ?? "#101010",
        lineHeight: Number.isFinite(contentConfig.font?.lineHeight) ? contentConfig.font.lineHeight : 1,
        letterSpacing: Number.isFinite(contentConfig.font?.letterSpacing) ? contentConfig.font.letterSpacing : 0,
      },
    };
  }

  if (contentConfig.type === "image" && typeof contentConfig.src === "string") {
    return {
      type: "image",
      src: contentConfig.src,
      alt: typeof contentConfig.alt === "string" ? contentConfig.alt : "",
      position: parsePlacement(contentConfig.position),
      size: parseSize(contentConfig.size, { width: 0.76, height: 0.76 }),
      rotation: Number.isFinite(contentConfig.rotation) ? contentConfig.rotation : 0,
      opacity: Number.isFinite(contentConfig.opacity) ? contentConfig.opacity : 1,
      fit: contentConfig.fit ?? "contain",
    };
  }

  return null;
}

function parsePlacement(positionConfig) {
  return {
    x: Number.isFinite(positionConfig?.x) ? positionConfig.x : 0.5,
    y: Number.isFinite(positionConfig?.y) ? positionConfig.y : 0.5,
    unit: positionConfig?.unit === "px" ? "px" : "ratio",
    offsetX: Number.isFinite(positionConfig?.offsetX) ? positionConfig.offsetX : 0,
    offsetY: Number.isFinite(positionConfig?.offsetY) ? positionConfig.offsetY : 0,
    anchor: positionConfig?.anchor ?? "center",
  };
}

function parseSize(sizeConfig, fallback) {
  return {
    width: Number.isFinite(sizeConfig?.width) ? sizeConfig.width : fallback.width,
    height: Number.isFinite(sizeConfig?.height) ? sizeConfig.height : fallback.height,
    unit: sizeConfig?.unit === "px" ? "px" : "ratio",
  };
}

function parseBlocks(blockConfigs, floorSet) {
  if (blockConfigs == null) {
    return [];
  }

  if (!Array.isArray(blockConfigs)) {
    throw new Error("Stage JSON blocks must be an array.");
  }

  const occupiedCells = new Set();

  return blockConfigs.map((blockConfig, index) => {
    const originX = blockConfig?.origin?.x;
    const originY = blockConfig?.origin?.y;
    const relativeCells = Array.isArray(blockConfig?.cells) && blockConfig.cells.length > 0
      ? blockConfig.cells
      : [[0, 0]];

    if (!Number.isInteger(originX) || !Number.isInteger(originY)) {
      throw new Error(`Block ${index} must include integer origin.x and origin.y.`);
    }

    const absoluteCells = relativeCells.map((relativeCell, cellIndex) => {
      if (
        !Array.isArray(relativeCell)
        || relativeCell.length !== 2
        || !Number.isInteger(relativeCell[0])
        || !Number.isInteger(relativeCell[1])
      ) {
        throw new Error(`Block ${index} cell ${cellIndex} must be [x, y].`);
      }

      return {
        x: originX + relativeCell[0],
        y: originY + relativeCell[1],
      };
    });

    const localCells = new Set();

    absoluteCells.forEach((cell) => {
      const cellKey = keyForCell(cell.x, cell.y);

      if (!floorSet.has(cellKey)) {
        throw new Error(`Block ${index} is outside the floor at ${cellKey}.`);
      }

      if (localCells.has(cellKey) || occupiedCells.has(cellKey)) {
        throw new Error(`Block ${index} overlaps at ${cellKey}.`);
      }

      localCells.add(cellKey);
      occupiedCells.add(cellKey);
    });

    return createBlockWithContent(
      blockConfig.id ?? `block-${index}`,
      blockConfig.color ?? "#d6a23a",
      absoluteCells,
      parseBlockContent(blockConfig.content),
    );
  });
}

function cloneBlocks(blocks) {
  return blocks.map((block) => createBlockWithContent(
    block.id,
    block.color,
    block.cells.map((cell) => ({ ...cell })),
    block.content ?? null,
  ));
}

function hasFloor(stage, x, y) {
  return stage.floorSet.has(keyForCell(x, y));
}

function findBlockIndexAt(x, y, blocks = currentBlocks) {
  return blocks.findIndex((block) => block.cellSet.has(keyForCell(x, y)));
}

function translateBlock(block, dx, dy) {
  return createBlockWithContent(
    block.id,
    block.color,
    block.cells.map((cell) => ({ x: cell.x + dx, y: cell.y + dy })),
    block.content ?? null,
  );
}

function canPlaceBlock(block, ignoredIndex) {
  return block.cells.every((cell) => {
    if (!hasFloor(currentStage, cell.x, cell.y)) {
      return false;
    }

    const collidingBlockIndex = findBlockIndexAt(cell.x, cell.y);
    return collidingBlockIndex === -1 || collidingBlockIndex === ignoredIndex;
  });
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

function createPiece(cellSize, x, y, scale, className, color) {
  const piece = document.createElement("div");
  const size = Math.max(4, cellSize * scale);
  const offset = (cellSize - size) / 2;

  piece.className = className;
  piece.style.left = `${BOARD_PADDING + x * cellSize + offset}px`;
  piece.style.top = `${BOARD_PADDING + y * cellSize + offset}px`;
  piece.style.width = `${size}px`;
  piece.style.height = `${size}px`;

  if (color) {
    piece.style.backgroundColor = color;
  }

  return piece;
}

function createPlayer(cellSize) {
  if (!currentPlayer) {
    return null;
  }

  return createPiece(
    cellSize,
    currentPlayer.x,
    currentPlayer.y,
    PLAYER_SCALE,
    "stage-player",
  );
}

function createBlockElement(block, cellSize) {
  const inset = Math.round(cellSize * (1 - BLOCK_SCALE) / 2);
  const radius = Math.max(2, Math.min(inset, Math.round(cellSize * 0.14)));
  const xs = block.cells.map((cell) => cell.x);
  const ys = block.cells.map((cell) => cell.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = (maxX - minX + 1) * cellSize;
  const height = (maxY - minY + 1) * cellSize;
  const wrapper = document.createElement("div");
  const svg = document.createElementNS(SVG_NS, "svg");
  const defs = document.createElementNS(SVG_NS, "defs");
  const mask = document.createElementNS(SVG_NS, "mask");
  const fill = document.createElementNS(SVG_NS, "rect");
  const maskId = `block-mask-${blockMaskCounter++}`;

  wrapper.className = "stage-block";
  wrapper.style.left = `${BOARD_PADDING + minX * cellSize}px`;
  wrapper.style.top = `${BOARD_PADDING + minY * cellSize}px`;
  wrapper.style.width = `${width}px`;
  wrapper.style.height = `${height}px`;
  svg.classList.add("stage-block__shape");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("shape-rendering", "crispEdges");
  mask.setAttribute("id", maskId);
  mask.setAttribute("maskUnits", "userSpaceOnUse");
  mask.setAttribute("x", "0");
  mask.setAttribute("y", "0");
  mask.setAttribute("width", String(width));
  mask.setAttribute("height", String(height));

  fill.setAttribute("x", "0");
  fill.setAttribute("y", "0");
  fill.setAttribute("width", String(width));
  fill.setAttribute("height", String(height));
  fill.setAttribute("fill", block.color);
  fill.setAttribute("mask", `url(#${maskId})`);

  block.cells.forEach((cell) => {
    const hasTop = block.cellSet.has(keyForCell(cell.x, cell.y - 1));
    const hasRight = block.cellSet.has(keyForCell(cell.x + 1, cell.y));
    const hasBottom = block.cellSet.has(keyForCell(cell.x, cell.y + 1));
    const hasLeft = block.cellSet.has(keyForCell(cell.x - 1, cell.y));
    const openTop = !hasTop;
    const openRight = !hasRight;
    const openBottom = !hasBottom;
    const openLeft = !hasLeft;
    const leftInset = block.cellSet.has(keyForCell(cell.x - 1, cell.y)) ? 0 : inset;
    const rightInset = block.cellSet.has(keyForCell(cell.x + 1, cell.y)) ? 0 : inset;
    const topInset = block.cellSet.has(keyForCell(cell.x, cell.y - 1)) ? 0 : inset;
    const bottomInset = block.cellSet.has(keyForCell(cell.x, cell.y + 1)) ? 0 : inset;
    const rect = document.createElementNS(SVG_NS, "rect");
    const cellX = (cell.x - minX) * cellSize;
    const cellY = (cell.y - minY) * cellSize;

    rect.setAttribute("x", String(cellX + leftInset));
    rect.setAttribute("y", String(cellY + topInset));
    rect.setAttribute("width", String(cellSize - leftInset - rightInset));
    rect.setAttribute("height", String(cellSize - topInset - bottomInset));
    rect.setAttribute("fill", "#ffffff");
    mask.appendChild(rect);

    if (hasTop && hasLeft && !block.cellSet.has(keyForCell(cell.x - 1, cell.y - 1))) {
      mask.appendChild(createMaskCutout(cellX, cellY, inset, inset));
    }

    if (hasTop && hasRight && !block.cellSet.has(keyForCell(cell.x + 1, cell.y - 1))) {
      mask.appendChild(createMaskCutout(cellX + cellSize - inset, cellY, inset, inset));
    }

    if (hasBottom && hasRight && !block.cellSet.has(keyForCell(cell.x + 1, cell.y + 1))) {
      mask.appendChild(createMaskCutout(cellX + cellSize - inset, cellY + cellSize - inset, inset, inset));
    }

    if (hasBottom && hasLeft && !block.cellSet.has(keyForCell(cell.x - 1, cell.y + 1))) {
      mask.appendChild(createMaskCutout(cellX, cellY + cellSize - inset, inset, inset));
    }

    if (openTop && openLeft) {
      appendRoundedOuterCorner(mask, cellX + leftInset, cellY + topInset, radius, "top-left");
    }

    if (openTop && openRight) {
      appendRoundedOuterCorner(
        mask,
        cellX + cellSize - rightInset,
        cellY + topInset,
        radius,
        "top-right",
      );
    }

    if (openBottom && openRight) {
      appendRoundedOuterCorner(
        mask,
        cellX + cellSize - rightInset,
        cellY + cellSize - bottomInset,
        radius,
        "bottom-right",
      );
    }

    if (openBottom && openLeft) {
      appendRoundedOuterCorner(
        mask,
        cellX + leftInset,
        cellY + cellSize - bottomInset,
        radius,
        "bottom-left",
      );
    }
  });

  defs.appendChild(mask);
  svg.appendChild(defs);
  svg.appendChild(fill);
  wrapper.appendChild(svg);

  if (block.content) {
    wrapper.appendChild(createBlockContentElement(block.content, width, height));
  }

  return wrapper;
}

function createMaskCutout(x, y, width, height) {
  const cutout = document.createElementNS(SVG_NS, "rect");
  cutout.setAttribute("x", String(x));
  cutout.setAttribute("y", String(y));
  cutout.setAttribute("width", String(width));
  cutout.setAttribute("height", String(height));
  cutout.setAttribute("fill", "#000000");
  return cutout;
}

function appendRoundedOuterCorner(mask, x, y, radius, corner) {
  const squareX = corner.includes("right") ? x - radius : x;
  const squareY = corner.includes("bottom") ? y - radius : y;
  const square = createMaskCutout(squareX, squareY, radius, radius);
  const circle = document.createElementNS(SVG_NS, "circle");

  let cx = x;
  let cy = y;

  if (corner === "top-left") {
    cx += radius;
    cy += radius;
  }

  if (corner === "top-right") {
    cx -= radius;
    cy += radius;
  }

  if (corner === "bottom-right") {
    cx -= radius;
    cy -= radius;
  }

  if (corner === "bottom-left") {
    cx += radius;
    cy -= radius;
  }

  circle.setAttribute("cx", String(cx));
  circle.setAttribute("cy", String(cy));
  circle.setAttribute("r", String(radius));
  circle.setAttribute("fill", "#ffffff");
  mask.appendChild(square);
  mask.appendChild(circle);
}

function createBlockContentElement(content, width, height) {
  const contentLayer = document.createElement("div");
  const item = content.type === "image"
    ? document.createElement("img")
    : document.createElement("div");
  const { left, top, translateX, translateY } = resolvePlacement(content.position, width, height);
  const itemWidth = resolveLength(content.size.width, content.size.unit, width);
  const itemHeight = resolveLength(content.size.height, content.size.unit, height);

  contentLayer.className = "stage-block__content";
  item.className = `stage-block__item stage-block__${content.type}`;
  item.style.left = `${left}px`;
  item.style.top = `${top}px`;
  item.style.width = `${itemWidth}px`;
  item.style.height = `${itemHeight}px`;
  item.style.transform = `translate(${translateX}%, ${translateY}%) rotate(${content.rotation}deg)`;
  item.style.opacity = String(content.opacity);

  if (content.type === "text") {
    item.textContent = content.text;
    item.style.color = content.font.color;
    item.style.fontFamily = content.font.family;
    item.style.fontWeight = String(content.font.weight);
    item.style.fontStyle = content.font.style;
    item.style.fontSize = `${resolveFontSize(content.font, width, height)}px`;
    item.style.lineHeight = String(content.font.lineHeight);
    item.style.letterSpacing = `${content.font.letterSpacing}px`;
    item.style.textAlign = content.align;
  } else {
    item.src = content.src;
    item.alt = content.alt;
    item.draggable = false;
    item.style.objectFit = content.fit;
  }

  contentLayer.appendChild(item);
  return contentLayer;
}

function resolvePlacement(position, width, height) {
  const left = resolveLength(position.x, position.unit, width) + position.offsetX;
  const top = resolveLength(position.y, position.unit, height) + position.offsetY;
  const anchorOffsets = {
    center: { x: -50, y: -50 },
    "top-left": { x: 0, y: 0 },
    "top-center": { x: -50, y: 0 },
    "top-right": { x: -100, y: 0 },
    "center-left": { x: 0, y: -50 },
    "center-right": { x: -100, y: -50 },
    "bottom-left": { x: 0, y: -100 },
    "bottom-center": { x: -50, y: -100 },
    "bottom-right": { x: -100, y: -100 },
  };
  const anchor = anchorOffsets[position.anchor] ?? anchorOffsets.center;

  return {
    left,
    top,
    translateX: anchor.x,
    translateY: anchor.y,
  };
}

function resolveLength(value, unit, total) {
  return unit === "px" ? value : value * total;
}

function resolveFontSize(font, width, height) {
  return font.sizeUnit === "px"
    ? font.size
    : font.size * Math.min(width, height);
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

  if (stage.showGrid) {
    lines.push(createLine(originX, originY - INNER_LINE_WIDTH / 2, cellSize, INNER_LINE_WIDTH));
    lines.push(createLine(originX - INNER_LINE_WIDTH / 2, originY, INNER_LINE_WIDTH, cellSize));

    if (openRight) {
      lines.push(
        createLine(
          originX + cellSize - INNER_LINE_WIDTH / 2,
          originY,
          INNER_LINE_WIDTH,
          cellSize,
        ),
      );
    }

    if (openBottom) {
      lines.push(
        createLine(
          originX,
          originY + cellSize - INNER_LINE_WIDTH / 2,
          cellSize,
          INNER_LINE_WIDTH,
        ),
      );
    }
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
    lines.push(createLine(
      originX - OUTER_LINE_WIDTH,
      originY - OUTER_LINE_WIDTH,
      OUTER_LINE_WIDTH,
      OUTER_LINE_WIDTH,
    ));
  }

  if (openTop && openRight && openTopRight) {
    lines.push(createLine(
      originX + cellSize,
      originY - OUTER_LINE_WIDTH,
      OUTER_LINE_WIDTH,
      OUTER_LINE_WIDTH,
    ));
  }

  if (openBottom && openRight && openBottomRight) {
    lines.push(createLine(
      originX + cellSize,
      originY + cellSize,
      OUTER_LINE_WIDTH,
      OUTER_LINE_WIDTH,
    ));
  }

  if (openBottom && openLeft && openBottomLeft) {
    lines.push(createLine(
      originX - OUTER_LINE_WIDTH,
      originY + cellSize,
      OUTER_LINE_WIDTH,
      OUTER_LINE_WIDTH,
    ));
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
  const blocks = currentBlocks.map((block) => createBlockElement(block, cellSize));
  const player = createPlayer(cellSize);

  stageBoardElement.style.width = `${boardWidth}px`;
  stageBoardElement.style.height = `${boardHeight}px`;
  stageBoardElement.replaceChildren(...tiles, ...lines, ...blocks, ...(player ? [player] : []));
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

  const blockIndex = findBlockIndexAt(nextX, nextY);

  if (blockIndex !== -1) {
    const movedBlock = translateBlock(currentBlocks[blockIndex], dx, dy);

    if (!canPlaceBlock(movedBlock, blockIndex)) {
      return;
    }

    currentBlocks = currentBlocks.map((block, index) => (
      index === blockIndex ? movedBlock : block
    ));
  }

  currentPlayer = { x: nextX, y: nextY };
  renderStage();
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

function resetSwipe() {
  swipeStart = null;
}

function handlePointerDown(event) {
  swipeStart = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
  };
}

function handlePointerUp(event) {
  if (!swipeStart || swipeStart.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - swipeStart.x;
  const deltaY = event.clientY - swipeStart.y;
  resetSwipe();

  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < SWIPE_THRESHOLD) {
    return;
  }

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    handleMove(deltaX > 0 ? "right" : "left");
    return;
  }

  handleMove(deltaY > 0 ? "down" : "up");
}

function bindInputs() {
  window.addEventListener("keydown", handleKeydown);
  stageAreaElement.addEventListener("pointerdown", handlePointerDown);
  stageAreaElement.addEventListener("pointerup", handlePointerUp);
  stageAreaElement.addEventListener("pointercancel", resetSwipe);
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
    currentBlocks = cloneBlocks(currentStage.initialBlocks);
    renderStage();
    bindInputs();

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
