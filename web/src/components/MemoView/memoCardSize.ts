// Per-memo user-chosen card sizes, persisted in localStorage so a resized memo keeps its
// size across sessions. Keyed by memo name so each card remembers its own size
// ("해당 카드에 한해서").
//
// A size has two independent halves:
//   - `height` is a pixel height and applies in every layout, single column included.
//   - `span` is a column count and only means anything in the packed grid, where a card's
//     width belongs to the columns it covers. Snapping to whole columns is what keeps the
//     wall packable: a card ending mid-column would either overlap its neighbour or strand
//     a sliver of unusable space beside it.
const CARD_SIZE_STORAGE_KEY = "memos-memo-card-size";
// Heights used to live under their own key as a bare name → px map. Read it once on
// migration so cards resized before spans existed keep the height their owner chose.
const LEGACY_CARD_HEIGHT_STORAGE_KEY = "memos-memo-card-height";

export const MIN_RESIZABLE_CARD_HEIGHT = 120;
export const MIN_CARD_SPAN = 1;
/** Nothing in the grid packs wider than this, however far the pointer travels. */
export const MAX_CARD_SPAN = 6;

export interface MemoCardSize {
  height?: number;
  span?: number;
}

type CardSizeMap = Record<string, MemoCardSize>;

const isValidHeight = (height: unknown): height is number =>
  typeof height === "number" && Number.isFinite(height) && height >= MIN_RESIZABLE_CARD_HEIGHT;

const isValidSpan = (span: unknown): span is number =>
  typeof span === "number" && Number.isInteger(span) && span >= MIN_CARD_SPAN && span <= MAX_CARD_SPAN;

export const clampCardHeight = (height: number): number => Math.max(MIN_RESIZABLE_CARD_HEIGHT, Math.round(height));

export const clampCardSpan = (span: number, columnCount: number): number =>
  Math.min(Math.max(Math.round(span), MIN_CARD_SPAN), Math.max(MIN_CARD_SPAN, Math.min(columnCount, MAX_CARD_SPAN)));

/** Drops anything the current format does not recognise, so a stale or hand-edited entry cannot break layout. */
const sanitize = (value: unknown): MemoCardSize | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const { height, span } = value as MemoCardSize;
  const next: MemoCardSize = {};
  if (isValidHeight(height)) next.height = Math.round(height);
  if (isValidSpan(span) && span > MIN_CARD_SPAN) next.span = span;
  return next.height === undefined && next.span === undefined ? undefined : next;
};

const readLegacyHeights = (): CardSizeMap => {
  try {
    const raw = localStorage.getItem(LEGACY_CARD_HEIGHT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== "object" || parsed === null) return {};
    const migrated: CardSizeMap = {};
    for (const [name, height] of Object.entries(parsed)) {
      if (isValidHeight(height)) migrated[name] = { height: Math.round(height) };
    }
    return migrated;
  } catch {
    return {};
  }
};

const readCardSizes = (): CardSizeMap => {
  try {
    const raw = localStorage.getItem(CARD_SIZE_STORAGE_KEY);
    if (!raw) return readLegacyHeights();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== "object" || parsed === null) return {};
    const sizes: CardSizeMap = {};
    for (const [name, value] of Object.entries(parsed)) {
      const size = sanitize(value);
      if (size) sizes[name] = size;
    }
    return sizes;
  } catch {
    return {};
  }
};

const writeCardSizes = (sizes: CardSizeMap): void => {
  try {
    localStorage.setItem(CARD_SIZE_STORAGE_KEY, JSON.stringify(sizes));
  } catch {
    // localStorage unavailable (private mode, quota) — resizing just won't persist.
  }
};

// The grid packs from these sizes, so it has to hear about a resize that happened inside a
// card it only renders. A version counter is enough: subscribers re-read the sizes they care
// about rather than diffing a snapshot.
let version = 0;
const listeners = new Set<() => void>();

const emit = () => {
  version += 1;
  for (const listener of listeners) listener();
};

export const subscribeToCardSizes = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getCardSizeVersion = (): number => version;

export const getMemoCardSize = (memoName: string): MemoCardSize => readCardSizes()[memoName] ?? {};

export const getMemoCardHeight = (memoName: string): number | undefined => getMemoCardSize(memoName).height;

export const getMemoCardSpan = (memoName: string): number => getMemoCardSize(memoName).span ?? MIN_CARD_SPAN;

export const setMemoCardSize = (memoName: string, size: MemoCardSize): void => {
  const sizes = readCardSizes();
  const next = sanitize({ ...sizes[memoName], ...size });
  if (next) {
    sizes[memoName] = next;
  } else {
    delete sizes[memoName];
  }
  writeCardSizes(sizes);
  emit();
};

export const clearMemoCardSize = (memoName: string): void => {
  const sizes = readCardSizes();
  if (!(memoName in sizes)) return;
  delete sizes[memoName];
  writeCardSizes(sizes);
  emit();
};

/** Test seam: drop every stored size and the migration source with it. */
export const resetMemoCardSizesForTest = (): void => {
  try {
    localStorage.removeItem(CARD_SIZE_STORAGE_KEY);
    localStorage.removeItem(LEGACY_CARD_HEIGHT_STORAGE_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
  emit();
};
