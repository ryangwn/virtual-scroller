import throttle from 'lodash/throttle';
import { Rectangle } from './geo/Rectangle';
import { Viewport } from './geo/Viewport';
import { filterMap, first, last } from './utils/array';
import { isNumber } from './utils/number';
import { roundToDevicePixelRatio } from './utils/ratio';
import { memo } from './utils/memo';
import { deepCompare } from './utils/object';

const UpdateReason = {
  HEIGHT_CHANGE: 'changeHeight',
};

type ListItem = {
  id: string;
  data: any;
  canBeAnchor: boolean;
  sortIndex: number;
};

type Slice = { start: number; end: number };

export interface VirtualizerOptions {
  debug?: boolean;
  viewport?: Viewport;
  rootElement: Element;
  list: Array<ListItem>;
  assumedItemHeight: ((itemType: string) => number) | number;
  useAnimationFrameWithResizeObserver?: boolean;
  minimumOffscreenToViewportRatio: number;
  preferredOffscreenToViewportRatio: number;
  //
  onChange?: () => void;
}

class RenderedItem {
  itemId: string;
  offset: number;
  visible: boolean;
  canBeAnchor: boolean;
  height: number;

  constructor(
    itemId: string,
    offset: number,
    visible: boolean,
    canBeAnchor: boolean,
    height: number,
  ) {
    this.itemId = itemId;
    this.offset = offset;
    this.visible = visible;
    this.canBeAnchor = canBeAnchor;
    this.height = height;
  }

  getRectInViewport() {
    return new Rectangle(this.offset, this.height);
  }
}

export class Virtualizer<TItemElement extends Element> {
  private _options!: VirtualizerOptions;
  private _viewport: Viewport | undefined;
  private _rootElement: Element | undefined;
  private _list: Array<ListItem> = [];
  private _renderedItems: RenderedItem[] = [];
  private _listHeightWithHeadRoom = 0;
  private _heights: Map<string, number> = new Map();
  private _pendingHeightUpdates: Map<string, number> = new Map();
  // private _cells: Map<any, any> = new Map()
  private _slice: Slice = { start: 0, end: 0 };
  private _isIdle = false;
  private _isInitialAnchoring = true;
  private _devicePixelRatio = window.devicePixelRatio || 1;
  private _observedNodeToIdMap: Map<TItemElement, string> = new Map();
  private _lastUpdateReason:
    | (typeof UpdateReason)[keyof typeof UpdateReason]
    | undefined;

  private _itemMap = memo(
    () => [this._list] as const,
    (list: Array<ListItem>) => {
      const map = new Map<string, ListItem>();
      list.forEach((item: ListItem) => map.set(item.id, item));
      return map;
    },
    { key: 'virtualizer.itemMap' },
  );

  private _finalRenderedItems = memo(
    () => [this._list, this._renderedItems] as const,
    (_list: Array<ListItem>, renderedItemStates: RenderedItem[]) => {
      const itemMap = this._itemMap(); // Use the memoized item map
      return filterMap(renderedItemStates, (state: RenderedItem) => {
        const item = itemMap.get(state.itemId);
        return item
          ? { item, offset: state.offset, visible: state.visible }
          : undefined;
      });
    },
    { key: 'virtualizer.finalRenderedItems' },
  );

  private observer = (() => {
    let _ro: ResizeObserver | null = null;

    const get = () => {
      if (_ro) {
        return _ro;
      }

      _ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const run = () => {
            this._measureElement(entry.target as TItemElement, entry);
          };
          this._options.useAnimationFrameWithResizeObserver
            ? requestAnimationFrame(run)
            : run();
        }
      });
      return _ro;
    };

    return {
      observer: (target: TItemElement) => {
        get()?.observe(target);
      },
      unObserver: (target: TItemElement) => {
        get()?.unobserve(target);
      },
      disconnect: () => {
        get()?.disconnect();
        _ro = null;
      },
    };
  })();

  constructor(options: VirtualizerOptions) {
    this._setupOptions(options);
  }

  mount() {
    this._viewport = this._options.viewport ?? this._createViewport();

    const _removeScrollHandler = this._viewport.addScrollListener(
      this._handleScroll.bind(this),
    );

    const initialRenderedItems = this._getInitialRenderedItems();
    if (initialRenderedItems.length > 0) {
    } else {
      this._update();
    }

    return () => {
      _removeScrollHandler();
    };
  }

  measureElement(node: TItemElement, itemId: string) {
    if (!node) {
      return;
    }

    this._observedNodeToIdMap.set(node, itemId);
    this._measureElement(node, undefined);

    return () => {
      this._observedNodeToIdMap.delete(node);
      this.observer.unObserver(node);
    };
  }

  /**
   * Updates the list of items managed by the virtualizer.
   * @param newList The new array of list items.
   */
  setList(newList: Array<ListItem>): void {
    this._list = newList;
    this._scheduleCriticalUpdate();
  }

  getVirtualItems() {
    return this._renderedItems;
  }

  getListHeightWithHeadRoom() {
    return this._listHeightWithHeadRoom;
  }

  private _setupOptions(opts: VirtualizerOptions) {
    Object.entries(opts).forEach(([key, value]) => {
      if (typeof value === 'undefined') delete (opts as any)[key];
    });

    this._options = {
      debug: false,
      useAnimationFrameWithResizeObserver: true,
      ...opts,
    };

    this._rootElement = this._options.rootElement;
    this._list = opts.list;
  }

  private _createViewport() {
    return new Viewport(window);
  }

  private _handleHeightChanged(itemId: string, height: number) {
    if (this._heights.get(itemId) !== height) {
      this._updateItemHeight(itemId, height);
    }
  }

  private _updateItemHeight(itemId: string, height: number) {
    this._pendingHeightUpdates.set(itemId, height);

    const allRenderedHaveHeights = this._renderedItems.every(
      ({ itemId }) =>
        this._heights.has(itemId) || this._pendingHeightUpdates.has(itemId),
    );

    if (allRenderedHaveHeights || this._pendingHeightUpdates.size > 50) {
      this._pendingHeightUpdates.forEach((h, id) => this._heights.set(id, h));
      this._pendingHeightUpdates.clear();
      this._lastUpdateReason = UpdateReason.HEIGHT_CHANGE;
      this._update();
    }
  }

  private _measureElement(
    node: TItemElement,
    entry: ResizeObserverEntry | undefined,
  ) {
    if (typeof entry === 'undefined') {
      this.observer.observer(node);
    } else {
      const { height } = entry.contentRect;
      const itemId = this._observedNodeToIdMap.get(node);
      if (itemId) {
        this._handleHeightChanged(itemId, height);
      }
    }
  }

  private _handleScroll() {
    if (!this._viewport) return;

    const currentScrollY = this._viewport.scrollY();

    if (this._isInitialAnchoring || currentScrollY < 0) {
      return;
    }
    this._isIdle = false;
    this._scheduleCriticalUpdateThrottled();
  }

  private _getInitialRenderedItems() {
    return [];
  }

  private _update() {
    if (!this._viewport) return;

    const relativeViewportRect = this._measureRelativeViewportRect();
    if (!relativeViewportRect) return;

    const anchor = this._getAnchor();

    // this._measureHeights()

    if (anchor) {
      this._updateRenderedItems(anchor, relativeViewportRect);
    }
  }

  private _measureRelativeViewportRect() {
    if (this._rootElement && this._viewport) {
      const rootRect = this._rootElement.getBoundingClientRect();
      // Translate the absolute viewport rect by the negative top of the root element
      return this._viewport.getRect().translateBy(-rootRect.top);
    }
    return undefined;
  }

  private _getAnchor() {
    // TODO
    // Rule 1: Pin to newest if configured and at the edge (unless centering initial anchor)

    // Rule 2: Find the "best" anchor among candidates based on visibility and position.
    const candidates = this._getAnchorItemCandidates(); // Get potential RenderedItem anchors

    // Rule 3: Fallback - If no visible anchor, use the first *rendered* anchor candidate
    const firstCandidate = first(candidates);
    if (firstCandidate) {
      return { itemId: firstCandidate.item.id, offset: firstCandidate.offset };
    }

    // Rule 4: Ultimate Fallback - Use the first item in the *full* list
    const firstOverall = first(this._list);
    if (firstOverall) {
      return { itemId: firstOverall.id, offset: 0 };
    }

    return undefined;
  }

  private _getAnchorItemCandidates() {
    const currentlyRendered = this._getFinalRenderedItems();

    const potentialAnchors = currentlyRendered.filter(
      ({ item }) => item.canBeAnchor && this._heights.has(item.id),
    );

    return potentialAnchors;
  }

  private _getFinalRenderedItems() {
    return this._finalRenderedItems();
  }

  // private _measureHeights() {
  //   this._cells.forEach((cellApi, itemId) => {
  //     const measuredHeight = cellApi.measureHeight()
  //     if (measuredHeight >= 0 && this._heights.get(itemId) !== measuredHeight) {
  //       this._heights.set(itemId, measuredHeight)
  //     }
  //   })
  // }

  private _updateRenderedItems(anchor, relativeViewportRect: Rectangle) {
    const { onChange } = this._options;
    const {
      allItemsWithPositions,
      newRenderedItems,
      slice,
      arePreferredItemsRendered,
    } = this._getRenderCandidates(anchor, relativeViewportRect);

    const firstItemOverall = first(allItemsWithPositions);
    const lastItemOverall = last(allItemsWithPositions);

    // Total height of the list (potentially including headroom)
    const listHeight = this._getHeightBetweenItems(
      firstItemOverall,
      lastItemOverall,
    );
    const listHeightWithHeadroom = listHeight;

    const areHeightsReadyForRender = this._getIsHeightsReady(newRenderedItems);

    const sliceChanged = !deepCompare(this._slice, slice);

    this._renderedItems = newRenderedItems;
    this._listHeightWithHeadRoom = listHeightWithHeadroom;

    if (areHeightsReadyForRender) {
      this._isInitialAnchoring = false; // Initial anchoring is complete once heights are ready
    }

    if (this._shouldTriggerOnChange(sliceChanged)) {
      this._slice = slice;
      onChange?.();
    }

    this._lastUpdateReason = undefined;
  }

  private _shouldTriggerOnChange(sliceChanged: boolean): boolean {
    return (
      sliceChanged || this._lastUpdateReason === UpdateReason.HEIGHT_CHANGE
    );
  }

  private _getRenderCandidates(anchor, relativeViewportRect: Rectangle) {
    const {
      minimumOffscreenToViewportRatio,
      preferredOffscreenToViewportRatio,
    } = this._options;

    // Calculate viewport boundaries with added buffer ratios
    const minBufferRect = this._getBufferedViewport(
      relativeViewportRect,
      minimumOffscreenToViewportRatio,
    );
    const preferredBufferRect = this._getBufferedViewport(
      relativeViewportRect,
      preferredOffscreenToViewportRatio,
    );

    // Use preferred buffer only when idle and not the initial render
    const usePreferredBuffer = this._isIdle && !this._isInitialAnchoring;
    const targetBufferRect = usePreferredBuffer
      ? preferredBufferRect
      : minBufferRect;

    // 1. Get all items with their calculated positions based on the anchor
    const allItemsWithPositions = this._getItemsWithPositions(anchor);

    // 2. Filter items that intersect the target buffered viewport
    const candidateItems = allItemsWithPositions.filter((itemState) => {
      return itemState.getRectInViewport().doesIntersectWith(targetBufferRect);
    });

    // 3. Determine the start/end indices of these candidates within the full list
    const candidateSlice = this._getSliceForCandidates(
      candidateItems,
      allItemsWithPositions,
    );

    // 4. Adjust the slice based on the previous slice to avoid large jumps
    const newSlice = this._adjustSlice(
      this._slice || { start: 0, end: 0 },
      candidateSlice,
      usePreferredBuffer,
    );

    // 5. Extract the final items to be rendered based on the adjusted slice
    const newRenderedItems = allItemsWithPositions.slice(
      newSlice.start,
      newSlice.end,
    );

    return {
      allItemsWithPositions,
      newRenderedItems,
      slice: newSlice,
      arePreferredItemsRendered: usePreferredBuffer,
    };
  }

  private _getBufferedViewport(viewportRect: Rectangle, ratio: number) {
    const bufferHeight = ratio * viewportRect.getHeight();
    return new Rectangle(
      viewportRect.getTop() - bufferHeight,
      viewportRect.getHeight() + 2 * bufferHeight,
    );
  }

  private _getDistanceFromTop(targetItemId: string) {
    const targetIndex = this._list.findIndex(
      (item) => item.id === targetItemId,
    );
    if (targetIndex <= 0) return 0;

    return this._list.slice(0, targetIndex).reduce((sum, item) => {
      return sum + this._getHeight(item);
    }, 0);
  }

  private _getItemsWithPositions(anchor) {
    if (!this._list || this._list.length === 0) return [];

    const anchorDistanceTop = this._getDistanceFromTop(anchor.itemId);

    let currentOffset = anchor.offset - anchorDistanceTop;

    const allItemsPositions: RenderedItem[] = [];
    this._list.forEach((item) => {
      const height = this._getHeight(item);
      allItemsPositions.push(
        new RenderedItem(
          item.id,
          currentOffset,
          this._heights.has(item.id),
          item.canBeAnchor,
          height,
        ),
      );
      currentOffset += height;
    });

    return allItemsPositions;
  }

  private _getSliceForCandidates(
    candidates: RenderedItem[],
    allItems: RenderedItem[],
  ) {
    const firstCandidate = first(candidates);
    const lastCandidate = last(candidates);
    return {
      start: firstCandidate ? allItems.indexOf(firstCandidate) : 0,
      end: lastCandidate ? allItems.indexOf(lastCandidate) + 1 : 0,
    };
  }

  private _getHeight(item: ListItem) {
    return this._getHeightForItemId(item.id, item.data?.type);
  }

  private _getHeightForItemId(itemId: string, itemType = '') {
    const { assumedItemHeight } = this._options;
    const cachedHeight = this._heights.get(itemId);

    const height = isNumber(cachedHeight)
      ? cachedHeight
      : typeof assumedItemHeight === 'function'
        ? assumedItemHeight(itemType)
        : assumedItemHeight;

    return roundToDevicePixelRatio({
      cssPixels: height,
      dpr: this._devicePixelRatio,
    });
  }

  private _adjustSlice(
    prevSlice: Slice,
    nextSlice: Slice,
    usePreferredBuffer: boolean,
  ) {
    // If preferred buffer is used, just take the new slice directly
    if (usePreferredBuffer) return nextSlice;

    const MAX_ITEMS_TO_RENDER_AT_ONCE = 50;

    // If previous slice fully contains or is contained within new slice (and not too large), keep previous
    if (
      nextSlice.start >= prevSlice.start &&
      nextSlice.end <= prevSlice.end &&
      prevSlice.end - prevSlice.start <= MAX_ITEMS_TO_RENDER_AT_ONCE
    ) {
      return prevSlice;
    }

    // If slices don't overlap at all, jump to the new slice
    if (nextSlice.start >= prevSlice.end || nextSlice.end <= prevSlice.start) {
      return nextSlice;
    }

    // If slices overlap, expand the slice gradually
    const expansion = Math.max(
      prevSlice.start - nextSlice.start,
      nextSlice.end - prevSlice.end,
      0,
    );
    return {
      start: Math.min(prevSlice.start + expansion, nextSlice.start),
      end: Math.max(prevSlice.end - expansion, nextSlice.end),
    };
  }

  private _getIsHeightsReady(renderedItems: RenderedItem[]) {
    if (!renderedItems || renderedItems.length === 0) return true;
    return renderedItems.every(({ itemId }) => this._heights.has(itemId));
  }

  private _getHeightBetweenItems(
    firstItemState: RenderedItem | undefined,
    lastItemState: RenderedItem | undefined,
  ) {
    if (!firstItemState || !lastItemState) return 0;
    const firstRect = this._getRenderedItemRectInViewport(firstItemState);
    const lastRect = this._getRenderedItemRectInViewport(lastItemState);
    return lastRect.getBottom() - firstRect.getTop();
  }

  private _getRenderedItemRectInViewport(itemState: RenderedItem) {
    // The offset in RenderedItem is already viewport-relative (after potential normalization)
    return itemState.getRectInViewport();
  }

  private _scheduleCriticalUpdate = () =>
    requestAnimationFrame(() => this._update());
  private _scheduleCriticalUpdateThrottled = throttle(
    () => this._scheduleCriticalUpdate(),
    100,
    { trailing: true },
  );
}
