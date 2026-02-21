/**
 * wavedrom を使った SVG / PNG エクスポートユーティリティ
 */
import * as wavedrom from 'wavedrom';
import defaultSkin from 'wavedrom/skins/default.js';

import type { WaveDromData } from '../types/wavedrom';

/** WaveDrom JSON → SVG 文字列 */
export function renderToSVGString(data: WaveDromData): string {
    const onml = wavedrom.renderAny(0, data as unknown as Record<string, unknown>, defaultSkin);
    return wavedrom.onml.stringify(onml);
}

/** SVG 文字列をダウンロード */
export function downloadSVG(data: WaveDromData, filename = 'waveform.svg'): void {
    const svgStr = renderToSVGString(data);
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/** SVG 文字列 → PNG Blob (Canvas 経由) */
export function svgToPNGBlob(svgStr: string): Promise<Blob | null> {
    return new Promise((resolve) => {
        const img = new Image();
        const scale = window.devicePixelRatio || 2;

        // SVG の width/height を取得
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgStr, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');
        const w = parseFloat(svgEl?.getAttribute('width') ?? '800');
        const h = parseFloat(svgEl?.getAttribute('height') ?? '200');

        const canvas = document.createElement('canvas');
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(scale, scale);

        // 背景を暗い色で塗る
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, w, h);

        const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            canvas.toBlob(resolve, 'image/png');
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
    });
}

/** PNG ダウンロード */
export async function downloadPNG(data: WaveDromData, filename = 'waveform.png'): Promise<void> {
    const svgStr = renderToSVGString(data);
    const blob = await svgToPNGBlob(svgStr);
    if (!blob) { alert('PNG エクスポートに失敗しました。'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
