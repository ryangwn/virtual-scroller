export function roundToDevicePixelRatio({ cssPixels, dpr }: { cssPixels: number; dpr: number }) {
    return Math.ceil(cssPixels * dpr) / dpr;
}
