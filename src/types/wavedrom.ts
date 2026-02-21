// WaveDrom JSON形式の型定義

/** 波形の各状態を表す文字 */
export type WaveChar =
    | '0' // Low
    | '1' // High
    | 'p' // Positive Edge Clock
    | 'n' // Negative Edge Clock
    | 'z' // High-Z
    | 'x' // Undefined
    | '=' // Data (default color)
    | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' // Data (colored)
    | '|' // Gap
    | '.'; // Continue

/** 編集ツールとして使える波形状態 + 選択ツール */
export type WaveTool = WaveChar | 'select';

/** タイムステップ選択ツール用クリップボード */
export interface StepClipboard {
    /** 各信号の cut/copy 範囲の wave 文字列スライス（全信号分） */
    waves: string[];
    /** 各信号の data 配列のうち、範囲内のエントリ */
    dataSlices: (string[] | undefined)[];
}

/** 単一信号の定義 */
export interface WaveSignal {
    name: string;
    wave: string;
    data?: string[];
    phase?: number;
    period?: number;
    node?: string;
}

/** グループ定義（先頭にラベル文字列、以降はWaveSignalまたはグループ） */
export type WaveGroup = [string, ...(WaveSignal | WaveGroup)[]];

/** signal配列の要素型 */
export type WaveSignalOrGroup = WaveSignal | WaveGroup | Record<string, never>;

/** head / foot */
export interface WaveHeadFoot {
    text?: string;
    tick?: number;
    tock?: number;
    every?: number;
}

/** config */
export interface WaveConfig {
    hscale?: number;
    skin?: string;
    head?: WaveHeadFoot;
    foot?: WaveHeadFoot;
}

/** WaveDrom JSON ルート */
export interface WaveDromData {
    signal: WaveSignalOrGroup[];
    edge?: string[];
    head?: WaveHeadFoot;
    foot?: WaveHeadFoot;
    config?: WaveConfig;
}

// ─── アプリ内部状態型 ───────────────────────────────────────────────

/** アプリの UI 状態 */
export interface AppState {
    waveformData: WaveDromData;
    undoStack: WaveDromData[];
    redoStack: WaveDromData[];
    selectedTool: WaveTool;
    selectedSignalIndex: number | null;
    jsonPanelVisible: boolean;
    hoverInfo: { signalIndex: number; stepIndex: number } | null;
    statusMessage: string;
    /** 挿入カーソル位置（サイクル境界インデックス: 0〜N） */
    insertCursor: number | null;
    /** 選択中のサイクル範囲（from/to はステップインデックス 0〜N-1） */
    stepSelection: { from: number; to: number } | null;
    /** コピー/カット済みクリップボード */
    stepClipboard: StepClipboard | null;
}

/** デフォルトの初期波形データ */
export const DEFAULT_WAVEFORM: WaveDromData = {
    signal: [
        { name: 'clk', wave: 'p........' },
        { name: 'req', wave: '0.1..0...' },
        { name: 'ack', wave: '0....1..0' },
        { name: 'data', wave: 'x....=.=.', data: ['D0', 'D1'] },
    ],
    head: { text: 'Waveform Editor' },
    config: { hscale: 1 },
};
