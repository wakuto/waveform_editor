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
export const CELL_WIDTH = 40;   // 1タイムステップの幅 (px)
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
    const slope = 4;  // 遷移斜め線の水平オフセット (px)
    const dipW = slope * 2; // ディップ/バンプの幅

    const prevIsData = prev !== null && isDataChar(prev);
    const curIsData = isDataChar(char);

    // ─── Low (0) ─────────────────────────────────────────────────────
    if (char === '0') {
        if (isContinue) {
            // '.' 継続：境界なしでフラット延長
            return { d: `M${x0} ${b} L${x1} ${b}` };
        }
        if (prev === '0') {
            // 明示的 0→0：バンプ（中間まで持ち上がって戻る）で境界を明示
            return { d: `M${x0} ${b} L${x0 + slope} ${m} L${x0 + dipW} ${b} L${x1} ${b}` };
        }
        const startY = getEndY(prev);
        const transLine = startY !== b ? `M${x0} ${startY} L${x0 + slope} ${b}` : '';
        return { d: `${transLine} M${x0} ${b} L${x1} ${b}` };
    }

    // ─── High (1) ────────────────────────────────────────────────────
    if (char === '1') {
        if (isContinue) {
            return { d: `M${x0} ${t} L${x1} ${t}` };
        }
        if (prev === '1') {
            // 明示的 1→1：ディップ（中間まで落ちて戻る）で境界を明示
            return { d: `M${x0} ${t} L${x0 + slope} ${m} L${x0 + dipW} ${t} L${x1} ${t}` };
        }
        const startY = getEndY(prev);
        const transLine = startY !== t ? `M${x0} ${startY} L${x0 + slope} ${t}` : '';
        return { d: `${transLine} M${x0} ${t} L${x1} ${t}` };
    }

    // ─── Continue (.) ────────────────────────────────────────────────
    // resolveWave により通常ここには到達しない（isContinue フラグで制御済み）
    if (char === '.') {
        if (prevIsData) return buildBoxSegment(x, width, true, isNextContinue, (DATA_COLORS[prev ?? '='] ?? DATA_COLORS['=']) + '55');
        return { d: `M${x0} ${getEndY(prev)} L${x1} ${getEndY(prev)}` };
    }

    // ─── Positive Edge Clock (p) ──────────────────────────────────────
    if (char === 'p') {
        const isFirstP = prev !== 'p';
        const startY = isFirstP ? getEndY(prev) : b;
        const lead = isFirstP && startY !== b ? `M${x0} ${startY} L${x0} ${b}` : '';
        return {
            d: `${lead} M${x0} ${b} L${x0} ${t} L${xm} ${t} L${xm} ${b} L${x1} ${b}`,
        };
    }

    // ─── Negative Edge Clock (n) ──────────────────────────────────────
    if (char === 'n') {
        const isFirstN = prev !== 'n';
        const startY = isFirstN ? getEndY(prev) : t;
        const lead = isFirstN && startY !== t ? `M${x0} ${startY} L${x0} ${t}` : '';
        return {
            d: `${lead} M${x0} ${t} L${x0} ${b} L${xm} ${b} L${xm} ${t} L${x1} ${t}`,
        };
    }

    // ─── High-Z (z) ──────────────────────────────────────────────────
    if (char === 'z') {
        return { d: `M${x0} ${m} L${x1} ${m}` };
    }

    // ─── Undefined (x) ───────────────────────────────────────────────
    if (char === 'x') {
        return buildBoxSegment(x, width, isContinue, isNextContinue, 'rgba(200,60,60,0.25)');
    }

    // ─── Data (=, 2–9) ───────────────────────────────────────────────
    if (curIsData) {
        const color = (DATA_COLORS[char] ?? DATA_COLORS['=']) + '55';
        return buildBoxSegment(x, width, isContinue, isNextContinue, color);
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
    isNextContinue: boolean,
    fillColor: string
): SegmentPath {
    const t = WAVE_TOP;
    const m = WAVE_MID;
    const b = WAVE_BOT;
    const slope = 4;
    const x1 = x + width;

    // 上辺・下辺の開始X（左端が < なら slope 分内側から、継続なら端から）
    const lx = isContinue ? x : x + slope;
    // 上辺・下辺の終了X（右端が > なら slope 分手前まで、継続なら端まで）
    const rx = isNextContinue ? x1 : x1 - slope;

    // ストローク: 上辺・下辺
    const topLine = `M${lx} ${t} L${rx} ${t}`;
    const botLine = `M${lx} ${b} L${rx} ${b}`;
    // 左端 < スパイク (新規開始時のみ)
    const leftSpike = !isContinue ? `M${x + slope} ${t} L${x} ${m} L${x + slope} ${b}` : '';
    // 右端 > スパイク (次が継続でないときのみ)
    const rightSpike = !isNextContinue ? `M${x1 - slope} ${t} L${x1} ${m} L${x1 - slope} ${b}` : '';
    const d = `${leftSpike} ${topLine} ${botLine} ${rightSpike}`.trim();

    // 塗りつぶし多角形 (左右それぞれ < > 有無で頂点を変える)
    let fill: string;
    if (!isContinue && !isNextContinue) {
        // 両端 <>: 六角形
        fill = `M${x} ${m} L${x + slope} ${t} L${x1 - slope} ${t} L${x1} ${m} L${x1 - slope} ${b} L${x + slope} ${b} Z`;
    } else if (isContinue && !isNextContinue) {
        // 左フラット・右 >: 五角形
        fill = `M${x} ${t} L${x1 - slope} ${t} L${x1} ${m} L${x1 - slope} ${b} L${x} ${b} Z`;
    } else if (!isContinue && isNextContinue) {
        // 左 <・右フラット: 五角形
        fill = `M${x} ${m} L${x + slope} ${t} L${x1} ${t} L${x1} ${b} L${x + slope} ${b} Z`;
    } else {
        // 両端フラット: 矩形
        fill = `M${x} ${t} L${x1} ${t} L${x1} ${b} L${x} ${b} Z`;
    }

    return { d, fill, fillColor };
}

/** 直前の波形状態のY座標（次のセルの開始Y）を返す */
function getEndY(prev: PrevChar): number {
    if (prev === null || prev === '0') return WAVE_BOT;
    if (prev === '1') return WAVE_TOP;
    if (prev === 'p' || prev === 'n') return WAVE_BOT; // クロックは常に下で終わる
    return WAVE_MID;
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
