import { Rectangle } from './Rectangle';

export class Anchor {
  itemId: string;

  offset: number;

  visible: boolean;

  canBeAnchor: boolean;

  height: number;

  constructor(
    itemId: string,
    offset = 0,
    visible = false,
    canBeAnchor = false,
    height = 0,
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
