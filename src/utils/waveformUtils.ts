import type { WaveSignal, WaveSignalOrGroup } from '../types/wavedrom';

/** WaveSignalOrGroupがWaveSignalかどうかを判定 */
export function isWaveSignal(s: WaveSignalOrGroup): s is WaveSignal {
    return typeof (s as WaveSignal).wave === 'string';
}

/** signal配列をフラットなWaveSignalのリストに変換 */
export function getSignalList(signals: WaveSignalOrGroup[]): WaveSignal[] {
    const result: WaveSignal[] = [];
    for (const s of signals) {
        if (Array.isArray(s)) {
            // グループ: 先頭はラベル文字列、残りは信号またはグループ
            const [, ...rest] = s as [string, ...WaveSignalOrGroup[]];
            result.push(...getSignalList(rest as WaveSignalOrGroup[]));
        } else if (isWaveSignal(s)) {
            result.push(s);
        }
        // 空オブジェクト {} はスキップ
    }
    return result;
}

// ─── 描画定数 ────────────────────────────────────────────────────────
export const BASE_CELL_WIDTH = 40;   // 1タイムステップの基準幅 (px)
export const ROW_HEIGHT = 40;   // 1信号行の高さ (px)
export const LABEL_WIDTH = 120; // 信号ラベル領域の幅 (px)
export const WAVE_PADDING = 6;  // 上下の余白 (px)

export const WAVE_TOP = WAVE_PADDING;
export const WAVE_MID = ROW_HEIGHT / 2;
export const WAVE_BOT = ROW_HEIGHT - WAVE_PADDING;

// 波形状態ごとの色
export const DATA_COLORS: Record<string, string> = {
    '=': '#4a9df0',
    '2': '#f0a04a',
    '3': '#4af07a',
    '4': '#f04a4a',
    '5': '#c04af0',
    '6': '#f0e04a',
    '7': '#4ae0f0',
    '8': '#f04ab0',
    '9': '#a0f04a',
};

/** 波形セグメントのSVGパス（セル1つ）を生成 */
export interface SegmentPath {
    /** メインの線パス */
    d: string;
    /** 塗りつぶし領域パス（Data / Undefined） */
    fill?: string;
    fillColor?: string;
    /** セルの中央テキスト */
    label?: string;
}

type PrevChar = string | null;

function getPrevY(prev: PrevChar): number[] {
    if (prev === null) return [WAVE_BOT];
    if (prev === '0') return [WAVE_BOT];
    if (prev === '1') return [WAVE_TOP];
    if (prev === 'z') return [WAVE_MID];
    if (prev === 'p' || prev === 'n') return [WAVE_BOT]; // クロックは下で終わる
    if (isDataChar(prev) || prev === 'x') return [WAVE_TOP, WAVE_BOT];
    return [WAVE_BOT];
}

function getTransitionPath(prevY: number[], curY: number[], x: number, slope: number): string {
    if (prevY.length === 1 && curY.length === 1) {
        if (prevY[0] === curY[0]) return ''; // 変化なし
        return `M${x} ${prevY[0]} L${x + slope} ${curY[0]}`;
    }
    if (prevY.length === 1 && curY.length === 2) {
        return `M${x} ${prevY[0]} L${x + slope} ${curY[0]} M${x} ${prevY[0]} L${x + slope} ${curY[1]}`;
    }
    if (prevY.length === 2 && curY.length === 1) {
        return `M${x} ${prevY[0]} L${x + slope} ${curY[0]} M${x} ${prevY[1]} L${x + slope} ${curY[0]}`;
    }
    if (prevY.length === 2 && curY.length === 2) {
        // クロス
        return `M${x} ${prevY[0]} L${x + slope} ${curY[1]} M${x} ${prevY[1]} L${x + slope} ${curY[0]}`;
    }
    return '';
}

/**
 * @param char           解決済み波形文字（'.' は解決済み）
 * @param prev           解決済み直前波形文字
 * @param x              セルの左端X座標
 * @param width          セル幅
 * @param isContinue     このセルのraw文字が '.' → 左端 < を描かない
 * @param isNextContinue 次のセルのraw文字が '.' → 右端 > を描かない
 */
export function getSegmentPath(
    char: string,
    prev: PrevChar,
    x: number,
    width: number,
    isContinue = false,
    isNextContinue = false
): SegmentPath {
    const t = WAVE_TOP;
    const m = WAVE_MID;
    const b = WAVE_BOT;
    const x0 = x;
    const x1 = x + width;
    const xm = x + width / 2;

    // 拡大率に応じて slope を調整
    const slope = 4 * (width / BASE_CELL_WIDTH);

    const prevIsData = prev !== null && isDataChar(prev);
    const curIsData = isDataChar(char);

    // ─── Low (0) ─────────────────────────────────────────────────────
    if (char === '0') {
        if (isContinue) {
            return { d: `M${x0} ${b} L${x1} ${b}` };
        }
        if (prev === '0') {
            // 明示的 0→0：バンプ
            return { d: `M${x0} ${b} L${x0 + slope / 2} ${m} L${x0 + slope} ${b} L${x1} ${b}` };
        }
        const prevY = getPrevY(prev);
        const transLine = getTransitionPath(prevY, [b], x0, slope);
        return { d: `${transLine} M${x0 + slope} ${b} L${x1} ${b}`.trim() };
    }

    // ─── High (1) ────────────────────────────────────────────────────
    if (char === '1') {
        if (isContinue) {
            return { d: `M${x0} ${t} L${x1} ${t}` };
        }
        if (prev === '1') {
            // 明示的 1→1：ディップ
            return { d: `M${x0} ${t} L${x0 + slope / 2} ${m} L${x0 + slope} ${t} L${x1} ${t}` };
        }
        const prevY = getPrevY(prev);
        const transLine = getTransitionPath(prevY, [t], x0, slope);
        return { d: `${transLine} M${x0 + slope} ${t} L${x1} ${t}`.trim() };
    }

    // ─── Continue (.) ────────────────────────────────────────────────
    if (char === '.') {
        if (prevIsData) return buildBoxSegment(x, width, true, prev, (DATA_COLORS[prev ?? '='] ?? DATA_COLORS['=']) + '55');
        const prevY = getPrevY(prev);
        if (prevY.length === 1) {
            return { d: `M${x0} ${prevY[0]} L${x1} ${prevY[0]}` };
        }
        return { d: `M${x0} ${t} L${x1} ${t} M${x0} ${b} L${x1} ${b}` };
    }

    // ─── Positive Edge Clock (p) ──────────────────────────────────────
    if (char === 'p') {
        const isFirstP = prev !== 'p';
        let d = '';
        if (isFirstP) {
            const prevY = getPrevY(prev);
            const transLine = getTransitionPath(prevY, [b], x0, 0);
            d = `${transLine} M${x0} ${b} L${x0} ${t} L${xm} ${t} L${xm} ${b} L${x1} ${b}`;
        } else {
            d = `M${x0} ${b} L${x0} ${t} L${xm} ${t} L${xm} ${b} L${x1} ${b}`;
        }
        return { d: d.trim() };
    }

    // ─── Negative Edge Clock (n) ──────────────────────────────────────
    if (char === 'n') {
        const isFirstN = prev !== 'n';
        let d = '';
        if (isFirstN) {
            const prevY = getPrevY(prev);
            const transLine = getTransitionPath(prevY, [t], x0, 0);
            d = `${transLine} M${x0} ${t} L${x0} ${b} L${xm} ${b} L${xm} ${t} L${x1} ${t}`;
        } else {
            d = `M${x0} ${t} L${x0} ${b} L${xm} ${b} L${xm} ${t} L${x1} ${t}`;
        }
        return { d: d.trim() };
    }

    // ─── High-Z (z) ──────────────────────────────────────────────────
    if (char === 'z') {
        if (isContinue) {
            return { d: `M${x0} ${m} L${x1} ${m}` };
        }
        const prevY = getPrevY(prev);
        const transLine = getTransitionPath(prevY, [m], x0, slope);
        return { d: `${transLine} M${x0 + slope} ${m} L${x1} ${m}`.trim() };
    }

    // ─── Undefined (x) ───────────────────────────────────────────────
    if (char === 'x') {
        return buildBoxSegment(x, width, isContinue, prev, 'rgba(200,60,60,0.25)');
    }

    // ─── Data (=, 2–9) ───────────────────────────────────────────────
    if (curIsData) {
        const color = (DATA_COLORS[char] ?? DATA_COLORS['=']) + '55';
        return buildBoxSegment(x, width, isContinue, prev, color);
    }

    // ─── Gap (|) ─────────────────────────────────────────────────────
    if (char === '|') {
        return {
            d: `M${x0} ${t} Q${xm} ${m} ${x1} ${t} M${x0} ${b} Q${xm} ${m} ${x1} ${b}`,
        };
    }

    return { d: '' };
}

function isDataChar(c: string): boolean {
    return c === '=' || (c >= '2' && c <= '9');
}

/**
 * x / Data 共通: 左端 < (isContinue=false) / 右端 > (isNextContinue=false) を制御して
 * ストロークパスと塗りつぶし多角形を生成する
 */
function buildBoxSegment(
    x: number,
    width: number,
    isContinue: boolean,
    prev: PrevChar,
    fillColor: string
): SegmentPath {
    const t = WAVE_TOP;
    const m = WAVE_MID;
    const b = WAVE_BOT;
    const slope = 4 * (width / BASE_CELL_WIDTH);
    const x1 = x + width;

    let d = '';
    let fill = '';

    if (isContinue) {
        d = `M${x} ${t} L${x1} ${t} M${x} ${b} L${x1} ${b}`;
        fill = `M${x} ${t} L${x1} ${t} L${x1} ${b} L${x} ${b} Z`;
    } else {
        const prevY = getPrevY(prev);
        const curY = [t, b];
        const transLine = getTransitionPath(prevY, curY, x, slope);
        const topLine = `M${x + slope} ${t} L${x1} ${t}`;
        const botLine = `M${x + slope} ${b} L${x1} ${b}`;

        d = `${transLine} ${topLine} ${botLine}`.trim();
        fill = `M${x + slope} ${t} L${x1} ${t} L${x1} ${b} L${x + slope} ${b} Z`;
    }

    return { d, fill, fillColor };
}

/** wave文字列から各セルの実効値（'.'を解決した）を返す */
export function resolveWave(wave: string): string[] {
    const result: string[] = [];
    let prev = '0';
    for (const ch of wave) {
        if (ch === '.') {
            result.push(prev);
        } else {
            result.push(ch);
            prev = ch;
        }
    }
    return result;
}

/** wave文字列中のdataキャラクタが何番目のdata[]に対応するかのマップを返す */
export function buildDataIndexMap(wave: string): Map<number, number> {
    const map = new Map<number, number>();
    let count = 0;
    for (let i = 0; i < wave.length; i++) {
        const ch = wave[i];
        if (ch === '=' || (ch >= '2' && ch <= '9')) {
            map.set(i, count);
            count++;
        }
    }
    return map;
}
