export class Rectangle {
  _top: number;
  _height: number;

  constructor(top: number, height: number) {
    this._top = top;
    this._height = height;
  }

  getTop() {
    return this._top;
  }

  getHeight() {
    return this._height;
  }

  getBottom() {
    return this._top + this._height;
  }

  doesIntersectWith(other: Rectangle) {
    return (
      this.getBottom() > other.getTop() && this.getTop() < other.getBottom()
    );
  }

  translateBy(offset: number) {
    return new Rectangle(this.getTop() + offset, this.getHeight());
  }
}
