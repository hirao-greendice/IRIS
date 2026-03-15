const STORAGE_KEY = "iris-stage-editor-v1";
const MIN_BOARD_SIZE = 1;
const MAX_BOARD_SIZE = 20;

const BLOCK_SHAPES = {
  single: [[0, 0]],
  "bar-h": [[0, 0], [1, 0]],
  "bar-v": [[0, 0], [0, 1]],
  square: [[0, 0], [1, 0], [0, 1], [1, 1]],
};

const MOVE_VECTORS = {
  up: { dx: 0, dy: -1 },
  right: { dx: 1, dy: 0 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
};

const elements = {
  board: document.getElementById("editor-board"),
  boardWidth: document.getElementById("board-width"),
  boardHeight: document.getElementById("board-height"),
  applyBoardSize: document.getElementById("apply-board-size"),
  resetEditor: document.getElementById("reset-editor"),
  toolButtons: Array.from(document.querySelectorAll("[data-tool]")),
  blockShape: document.getElementById("block-shape"),
  status: document.getElementById("editor-status"),
  mode: document.getElementById("editor-mode"),
  floorCount: document.getElementById("floor-count"),
  blockCount: document.getElementById("block-count"),
  playerPosition: document.getElementById("player-position"),
  jsonOutput: document.getElementById("json-output"),
  copyJson: document.getElementById("copy-json"),
  clearStorage: document.getElementById("clear-storage"),
  startPreview: document.getElementById("start-preview"),
  stopPreview: document.getElementById("stop-preview"),
  resetPreview: document.getElementById("reset-preview"),
  moveButtons: Array.from(document.querySelectorAll("[data-move]")),
};

let activeTool = "block";
let state = loadState() ?? createDefaultState();
let previewState = null;
let blockIdCounter = getNextBlockId(state.blocks);

function keyForCell(x, y) {
  return `${x},${y}`;
}

function clampBoardSize(value) {
  return Math.max(MIN_BOARD_SIZE, Math.min(MAX_BOARD_SIZE, value));
}

function createDefaultState() {
  return {
    width: 7,
    height: 8,
    voidCells: new Set(),
    player: { x: 0, y: 7 },
    blocks: [],
  };
}

function clonePlayer(player) {
  return player ? { ...player } : null;
}

function cloneBlocks(blocks) {
  return blocks.map((block) => ({
    id: block.id,
    origin: { ...block.origin },
    cells: block.cells.map(([offsetX, offsetY]) => [offsetX, offsetY]),
    color: block.color,
  }));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch (error) {
    console.warn("Failed to load editor state.", error);
    return null;
  }
}

function normalizeState(rawState) {
  const width = clampBoardSize(Number.parseInt(rawState?.width, 10) || 7);
  const height = clampBoardSize(Number.parseInt(rawState?.height, 10) || 8);
  const voidCells = new Set(
    Array.isArray(rawState?.voidCells)
      ? rawState.voidCells.filter((cellKey) => typeof cellKey === "string")
      : [],
  );
  const blocks = Array.isArray(rawState?.blocks)
    ? rawState.blocks
      .map((block, index) => normalizeBlock(block, index))
      .filter(Boolean)
    : [];
  const player = Number.isInteger(rawState?.player?.x) && Number.isInteger(rawState?.player?.y)
    ? { x: rawState.player.x, y: rawState.player.y }
    : null;

  return ensureStateConsistency({
    width,
    height,
    voidCells,
    player,
    blocks,
  });
}

function normalizeBlock(block, index) {
  const originX = Number.parseInt(block?.origin?.x, 10);
  const originY = Number.parseInt(block?.origin?.y, 10);
  const cells = Array.isArray(block?.cells) && block.cells.length > 0
    ? block.cells.filter((cell) => (
      Array.isArray(cell)
      && cell.length === 2
      && Number.isInteger(cell[0])
      && Number.isInteger(cell[1])
    ))
    : [[0, 0]];

  if (!Number.isInteger(originX) || !Number.isInteger(originY) || cells.length === 0) {
    return null;
  }

  return {
    id: typeof block.id === "string" ? block.id : `block-${index + 1}`,
    origin: { x: originX, y: originY },
    cells,
    color: typeof block.color === "string" ? block.color : "#ffffff",
  };
}

function getAbsoluteCells(block) {
  return block.cells.map(([offsetX, offsetY]) => ({
    x: block.origin.x + offsetX,
    y: block.origin.y + offsetY,
  }));
}

function getOccupiedSet(blocks) {
  return new Set(
    blocks.flatMap((block) => getAbsoluteCells(block).map((cell) => keyForCell(cell.x, cell.y))),
  );
}

function isInsideBoard(width, height, x, y) {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function isVoidCellIn(targetState, x, y) {
  return targetState.voidCells.has(keyForCell(x, y));
}

function hasFloorCell(x, y) {
  return isInsideBoard(state.width, state.height, x, y) && !isVoidCellIn(state, x, y);
}

function ensureStateConsistency(nextState) {
  const width = clampBoardSize(nextState.width);
  const height = clampBoardSize(nextState.height);
  const voidCells = new Set(
    Array.from(nextState.voidCells).filter((cellKey) => {
      const [xText, yText] = cellKey.split(",");
      const x = Number.parseInt(xText, 10);
      const y = Number.parseInt(yText, 10);
      return x >= 0 && y >= 0 && x < width && y < height;
    }),
  );
  const blocks = [];
  const occupied = new Set();

  nextState.blocks.forEach((block, index) => {
    const normalizedBlock = normalizeBlock(block, index);

    if (!normalizedBlock) {
      return;
    }

    const absoluteCells = getAbsoluteCells(normalizedBlock);

    if (absoluteCells.some((cell) => !isInsideBoard(width, height, cell.x, cell.y))) {
      return;
    }

    if (absoluteCells.some((cell) => voidCells.has(keyForCell(cell.x, cell.y)))) {
      return;
    }

    if (absoluteCells.some((cell) => occupied.has(keyForCell(cell.x, cell.y)))) {
      return;
    }

    absoluteCells.forEach((cell) => occupied.add(keyForCell(cell.x, cell.y)));
    blocks.push(normalizedBlock);
  });

  let player = nextState.player && isInsideBoard(width, height, nextState.player.x, nextState.player.y)
    ? { ...nextState.player }
    : null;

  if (player && voidCells.has(keyForCell(player.x, player.y))) {
    player = null;
  }

  if (player && occupied.has(keyForCell(player.x, player.y))) {
    player = null;
  }

  if (!player) {
    player = findFirstAvailableFloor(width, height, voidCells, occupied);
  }

  return {
    width,
    height,
    voidCells,
    player,
    blocks,
  };
}

function findFirstAvailableFloor(width, height, voidCells, occupied) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cellKey = keyForCell(x, y);

      if (!voidCells.has(cellKey) && !occupied.has(cellKey)) {
        return { x, y };
      }
    }
  }

  return null;
}

function serializeState(currentState) {
  return JSON.stringify({
    width: currentState.width,
    height: currentState.height,
    voidCells: Array.from(currentState.voidCells),
    player: currentState.player,
    blocks: currentState.blocks,
  });
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, serializeState(state));
}

function getNextBlockId(blocks) {
  const blockNumbers = blocks
    .map((block) => Number.parseInt(String(block.id).replace("block-", ""), 10))
    .filter(Number.isFinite);

  return blockNumbers.length > 0 ? Math.max(...blockNumbers) + 1 : 1;
}

function getBlockIndexAt(x, y, blocks = state.blocks) {
  return blocks.findIndex((block) => (
    getAbsoluteCells(block).some((cell) => cell.x === x && cell.y === y)
  ));
}

function translateBlock(block, dx, dy) {
  return {
    ...block,
    origin: {
      x: block.origin.x + dx,
      y: block.origin.y + dy,
    },
  };
}

function canPlaceBlock(shapeCells, originX, originY) {
  return shapeCells.every(([offsetX, offsetY]) => {
    const x = originX + offsetX;
    const y = originY + offsetY;

    if (!hasFloorCell(x, y)) {
      return false;
    }

    if (state.player && state.player.x === x && state.player.y === y) {
      return false;
    }

    return getBlockIndexAt(x, y, state.blocks) === -1;
  });
}

function canPlaceMovedBlock(block, blocks, ignoredIndex) {
  return getAbsoluteCells(block).every((cell) => {
    if (!hasFloorCell(cell.x, cell.y)) {
      return false;
    }

    const collidingIndex = getBlockIndexAt(cell.x, cell.y, blocks);
    return collidingIndex === -1 || collidingIndex === ignoredIndex;
  });
}

function setStatus(message) {
  elements.status.textContent = message;
}

function isPlayMode() {
  return previewState !== null;
}

function getVisibleState() {
  return isPlayMode()
    ? { ...state, player: previewState.player, blocks: previewState.blocks }
    : state;
}

function setTool(tool) {
  activeTool = tool;
  elements.toolButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tool === tool);
  });
}

function createPreviewState() {
  state = ensureStateConsistency(state);
  return {
    player: clonePlayer(state.player),
    blocks: cloneBlocks(state.blocks),
  };
}

function startPreview() {
  previewState = createPreviewState();
  setStatus("テストプレイを開始しました。矢印キーか移動ボタンで確認できます。");
  render();
}

function stopPreview(message = "編集モードに戻しました。") {
  previewState = null;
  setStatus(message);
  render();
}

function resetPreview() {
  previewState = createPreviewState();
  setStatus("テストプレイの位置を初期配置に戻しました。");
  render();
}

function applyBoardSize() {
  if (isPlayMode()) {
    stopPreview("盤面サイズを変えるためテストプレイを終了しました。");
  }

  const width = clampBoardSize(Number.parseInt(elements.boardWidth.value, 10) || state.width);
  const height = clampBoardSize(Number.parseInt(elements.boardHeight.value, 10) || state.height);

  state = ensureStateConsistency({
    ...state,
    width,
    height,
  });
  setStatus(`盤面サイズを ${width} x ${height} に更新しました。`);
  render();
}

function ensureAtLeastOneFloor(x, y) {
  const floorCount = getFloorCount();
  return !(floorCount === 1 && !isVoidCellIn(state, x, y));
}

function getFloorCount() {
  return state.width * state.height - state.voidCells.size;
}

function setVoidCell(x, y, makeVoid) {
  if (isPlayMode()) {
    stopPreview("セル編集のためテストプレイを終了しました。");
  }

  const cellKey = keyForCell(x, y);

  if (makeVoid && !ensureAtLeastOneFloor(x, y)) {
    setStatus("最後の床は消せません。");
    return false;
  }

  if (makeVoid) {
    state.voidCells.add(cellKey);
    const blockIndex = getBlockIndexAt(x, y, state.blocks);

    if (blockIndex !== -1) {
      state.blocks.splice(blockIndex, 1);
    }

    if (state.player && state.player.x === x && state.player.y === y) {
      state.player = findFirstAvailableFloor(
        state.width,
        state.height,
        state.voidCells,
        getOccupiedSet(state.blocks),
      );
    }
  } else {
    state.voidCells.delete(cellKey);
  }

  state = ensureStateConsistency(state);
  render();
  return true;
}

function placePlayer(x, y) {
  if (isPlayMode()) {
    stopPreview("キャラ位置を編集するためテストプレイを終了しました。");
  }

  if (!hasFloorCell(x, y)) {
    setStatus("空白セルにはキャラを置けません。");
    return;
  }

  if (getBlockIndexAt(x, y, state.blocks) !== -1) {
    setStatus("ブロックがある場所にはキャラを置けません。");
    return;
  }

  state.player = { x, y };
  setStatus(`キャラ位置を (${x}, ${y}) に更新しました。`);
  render();
}

function placeBlock(x, y) {
  if (isPlayMode()) {
    stopPreview("ブロック編集のためテストプレイを終了しました。");
  }

  const shape = BLOCK_SHAPES[elements.blockShape.value] ?? BLOCK_SHAPES.single;
  const existingBlockIndex = getBlockIndexAt(x, y, state.blocks);

  if (existingBlockIndex !== -1) {
    state.blocks.splice(existingBlockIndex, 1);
    setStatus("ブロックを削除しました。");
    render();
    return;
  }

  if (!canPlaceBlock(shape, x, y)) {
    setStatus("そこにはその形のブロックを置けません。");
    return;
  }

  state.blocks.push({
    id: `block-${blockIdCounter}`,
    origin: { x, y },
    cells: shape.map(([offsetX, offsetY]) => [offsetX, offsetY]),
    color: "#ffffff",
  });
  blockIdCounter += 1;
  setStatus(`ブロックを (${x}, ${y}) に配置しました。`);
  render();
}

function eraseAt(x, y) {
  if (isPlayMode()) {
    stopPreview("削除編集のためテストプレイを終了しました。");
  }

  const blockIndex = getBlockIndexAt(x, y, state.blocks);

  if (blockIndex !== -1) {
    state.blocks.splice(blockIndex, 1);
    setStatus("ブロックを削除しました。");
    render();
    return;
  }

  if (state.player && state.player.x === x && state.player.y === y) {
    state.player = findFirstAvailableFloor(
      state.width,
      state.height,
      state.voidCells,
      getOccupiedSet(state.blocks),
    );
    setStatus("キャラ位置を空いている床に戻しました。");
    render();
    return;
  }

  setStatus("そのセルには削除対象がありません。");
}

function movePreviewPlayer(dx, dy) {
  if (!isPlayMode() || !previewState?.player) {
    return;
  }

  const nextX = previewState.player.x + dx;
  const nextY = previewState.player.y + dy;

  if (!hasFloorCell(nextX, nextY)) {
    setStatus("その方向には進めません。");
    return;
  }

  const blockIndex = getBlockIndexAt(nextX, nextY, previewState.blocks);

  if (blockIndex !== -1) {
    const movedBlock = translateBlock(previewState.blocks[blockIndex], dx, dy);

    if (!canPlaceMovedBlock(movedBlock, previewState.blocks, blockIndex)) {
      setStatus("ブロックを押し出せません。");
      return;
    }

    previewState.blocks = previewState.blocks.map((block, index) => (
      index === blockIndex ? movedBlock : block
    ));
  }

  previewState.player = { x: nextX, y: nextY };
  render();
}

function handleMove(direction) {
  const vector = MOVE_VECTORS[direction];

  if (!vector) {
    return;
  }

  movePreviewPlayer(vector.dx, vector.dy);
}

function handleBoardClick(event) {
  const cellButton = event.target.closest("[data-x][data-y]");

  if (!cellButton) {
    return;
  }

  if (isPlayMode()) {
    setStatus("テストプレイ中は矢印キーか移動ボタンを使ってください。");
    return;
  }

  const x = Number.parseInt(cellButton.dataset.x, 10);
  const y = Number.parseInt(cellButton.dataset.y, 10);

  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return;
  }

  if (activeTool === "player") {
    placePlayer(x, y);
    return;
  }

  if (activeTool === "block") {
    placeBlock(x, y);
    return;
  }

  if (activeTool === "erase") {
    eraseAt(x, y);
    return;
  }

  if (activeTool === "void") {
    if (setVoidCell(x, y, true)) {
      setStatus(`セル (${x}, ${y}) を空白にしました。`);
    }
    return;
  }

  if (activeTool === "floor" && setVoidCell(x, y, false)) {
    setStatus(`セル (${x}, ${y}) を床に戻しました。`);
  }
}

function createGridRow(boardState, y) {
  const fragment = document.createDocumentFragment();

  for (let x = 0; x < boardState.width; x += 1) {
    const button = document.createElement("button");
    const blockIndex = getBlockIndexAt(x, y, boardState.blocks);
    const hasPlayer = boardState.player && boardState.player.x === x && boardState.player.y === y;

    button.type = "button";
    button.className = `editor-cell ${isVoidCellIn(state, x, y) ? "is-void" : "is-floor"}`;
    button.dataset.x = String(x);
    button.dataset.y = String(y);
    button.title = `x:${x} y:${y}`;

    if (blockIndex !== -1) {
      const blockElement = document.createElement("span");
      blockElement.className = "editor-cell__block";
      button.appendChild(blockElement);
    }

    if (hasPlayer) {
      const playerElement = document.createElement("span");
      playerElement.className = "editor-cell__player";
      button.appendChild(playerElement);
    }

    fragment.appendChild(button);
  }

  return fragment;
}

function buildStageGrid() {
  return Array.from({ length: state.height }, (_, y) => {
    let row = "";

    for (let x = 0; x < state.width; x += 1) {
      row += isVoidCellIn(state, x, y) ? "." : "#";
    }

    return row;
  });
}

function buildStageJson() {
  return {
    showGrid: false,
    playerStart: state.player ?? { x: 0, y: 0 },
    blocks: state.blocks.map((block) => ({
      id: block.id,
      origin: { ...block.origin },
      cells: block.cells.map(([offsetX, offsetY]) => [offsetX, offsetY]),
      color: block.color,
    })),
    grid: buildStageGrid(),
  };
}

function copyJson() {
  const value = elements.jsonOutput.value;

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value)
      .then(() => setStatus("JSONをコピーしました。"))
      .catch(() => fallbackCopy(value));
    return;
  }

  fallbackCopy(value);
}

function fallbackCopy(value) {
  elements.jsonOutput.removeAttribute("readonly");
  elements.jsonOutput.select();
  document.execCommand("copy");
  elements.jsonOutput.setAttribute("readonly", "readonly");
  setStatus("JSONをコピーしました。");
}

function resetEditor() {
  previewState = null;
  state = createDefaultState();
  blockIdCounter = 1;
  setStatus("作成モードを初期化しました。");
  render();
}

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
  setStatus("保存状態を消しました。");
}

function updateControlState() {
  const playing = isPlayMode();
  const editControls = [
    elements.boardWidth,
    elements.boardHeight,
    elements.applyBoardSize,
    elements.resetEditor,
    elements.blockShape,
    ...elements.toolButtons,
  ];

  editControls.forEach((element) => {
    element.disabled = playing;
  });

  elements.startPreview.disabled = playing;
  elements.stopPreview.disabled = !playing;
  elements.resetPreview.disabled = !playing;
  elements.moveButtons.forEach((button) => {
    button.disabled = !playing;
  });

  elements.mode.textContent = playing ? "モード: テストプレイ中" : "モード: 編集中";
  elements.board.classList.toggle("is-play-mode", playing);
}

function render() {
  state = ensureStateConsistency(state);
  saveState();

  const boardState = getVisibleState();

  elements.boardWidth.value = String(state.width);
  elements.boardHeight.value = String(state.height);
  elements.board.style.setProperty("--editor-cols", String(state.width));
  elements.board.replaceChildren();

  for (let y = 0; y < state.height; y += 1) {
    elements.board.appendChild(createGridRow(boardState, y));
  }

  elements.floorCount.textContent = `床: ${getFloorCount()}`;
  elements.blockCount.textContent = `ブロック: ${boardState.blocks.length}`;
  elements.playerPosition.textContent = boardState.player
    ? `キャラ: (${boardState.player.x}, ${boardState.player.y})`
    : "キャラ: 未配置";
  elements.jsonOutput.value = JSON.stringify(buildStageJson(), null, 2);

  updateControlState();
}

function handleKeydown(event) {
  if (!isPlayMode()) {
    return;
  }

  const key = event.key.toLowerCase();
  const keyToDirection = {
    arrowup: "up",
    w: "up",
    arrowright: "right",
    d: "right",
    arrowdown: "down",
    s: "down",
    arrowleft: "left",
    a: "left",
  };
  const direction = keyToDirection[key];

  if (!direction) {
    return;
  }

  event.preventDefault();
  handleMove(direction);
}

function bindEvents() {
  elements.applyBoardSize.addEventListener("click", applyBoardSize);
  elements.resetEditor.addEventListener("click", resetEditor);
  elements.board.addEventListener("click", handleBoardClick);
  elements.copyJson.addEventListener("click", copyJson);
  elements.clearStorage.addEventListener("click", clearStorage);
  elements.startPreview.addEventListener("click", startPreview);
  elements.stopPreview.addEventListener("click", () => {
    stopPreview();
  });
  elements.resetPreview.addEventListener("click", resetPreview);
  window.addEventListener("keydown", handleKeydown);

  elements.toolButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setTool(button.dataset.tool);
      setStatus(`ツールを「${button.textContent}」に切り替えました。`);
    });
  });

  elements.blockShape.addEventListener("change", () => {
    setStatus(`ブロック形を ${elements.blockShape.value} に切り替えました。`);
  });

  elements.moveButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handleMove(button.dataset.move);
    });
  });
}

bindEvents();
render();
