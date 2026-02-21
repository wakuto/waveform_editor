import { create } from 'zustand';
import type { WaveDromData, WaveSignal, WaveTool, AppState, StepClipboard } from '../types/wavedrom';
import { DEFAULT_WAVEFORM } from '../types/wavedrom';
import { isWaveSignal, getSignalList } from '../utils/waveformUtils';

const MAX_HISTORY = 50;

interface WaveformStore extends AppState {
    // 波形データ操作
    setWaveformData: (data: WaveDromData, pushHistory?: boolean) => void;
    setCell: (signalIndex: number, stepIndex: number, value: string, pushHist?: boolean) => void;
    setCellRange: (signalIndex: number, startStep: number, endStep: number, value: string) => void;
    /** ドラッグ挿入用: dragStartStep の位置に value を、残りのセルに '.' を設定 */
    setCellRangeWithContinue: (signalIndex: number, dragStartStep: number, currentStep: number, value: string, pushHist?: boolean) => void;
    /** ドラッグ開始時に現在の状態を1回だけ undo スタックに積む */
    beginDragEdit: () => void;
    setDataLabel: (signalIndex: number, stepIndex: number, label: string) => void;

    // 信号管理
    addSignal: (afterIndex?: number) => void;
    removeSignal: (index: number) => void;
    renameSignal: (index: number, name: string) => void;
    moveSignal: (fromIndex: number, toIndex: number) => void;

    // タイムステップ管理（レガシー: 末尾増減）
    addTimeStep: () => void;
    removeTimeStep: () => void;

    // 挿入カーソル・選択ツール操作
    setInsertCursor: (boundary: number | null) => void;
    setStepSelection: (selection: { from: number; to: number; signalIndex?: number } | null) => void;
    /** 挿入カーソル位置に '.'.repeat(count) のサイクルを挿入 */
    insertStepsAtCursor: (count?: number) => void;
    /** 選択範囲のサイクルを削除 */
    deleteSelectedSteps: () => void;
    /** 選択範囲をクリップボードにコピー */
    copySteps: () => void;
    /** 選択範囲をクリップボードにコピーして削除 */
    cutSteps: () => void;
    /** 挿入カーソル位置にクリップボードの内容をペースト */
    pasteAtCursor: () => void;

    // UI状態
    setSelectedTool: (tool: WaveTool) => void;
    setSelectedSignalIndex: (index: number | null) => void;
    setJsonPanelVisible: (visible: boolean) => void;
    setHoverInfo: (info: { signalIndex: number; stepIndex: number } | null) => void;

    // Undo/Redo
    undo: () => void;
    redo: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
}

function pushHistory(state: AppState, prev: WaveDromData): Pick<AppState, 'undoStack' | 'redoStack'> {
    const undoStack = [...state.undoStack, prev].slice(-MAX_HISTORY);
    return { undoStack, redoStack: [] };
}

// ─── ステップ操作ヘルパー ────────────────────────────────────────────

/** wave の位置 position に count 文字分の '.' を挿入する */
function insertStepsIntoSignal(sig: WaveSignal, position: number, count: number): WaveSignal {
    const wave = sig.wave;
    const newWave = wave.slice(0, position) + '.'.repeat(count) + wave.slice(position);
    return { ...sig, wave: newWave };
}

/** wave の from〜to（inclusive）を削除し、対応する data エントリも削除する */
function deleteStepsFromSignal(sig: WaveSignal, from: number, to: number): WaveSignal {
    const wave = sig.wave;
    let dataCountBefore = 0;
    let dataCountInRange = 0;
    for (let i = 0; i < wave.length; i++) {
        const ch = wave[i];
        const isData = ch === '=' || (ch >= '2' && ch <= '9');
        if (isData) {
            if (i < from) dataCountBefore++;
            else if (i <= to) dataCountInRange++;
        }
    }

    // 削除範囲の直後の状態を解決しておく（復元用）
    let afterChar = '.';
    let afterData: string | undefined = undefined;
    if (to + 1 < wave.length && wave[to + 1] === '.') {
        for (let i = to; i >= 0; i--) {
            const ch = wave[i];
            if (ch !== '.' && ch !== '|') {
                afterChar = ch;
                if (ch === '=' || (ch >= '2' && ch <= '9')) {
                    let dataIdx = 0;
                    for (let j = 0; j <= i; j++) {
                        const c = wave[j];
                        if (c === '=' || (c >= '2' && c <= '9')) dataIdx++;
                    }
                    if (sig.data && dataIdx - 1 >= 0 && dataIdx - 1 < sig.data.length) {
                        afterData = sig.data[dataIdx - 1];
                    }
                }
                break;
            }
        }
    }

    let newWave = wave.slice(0, from) + wave.slice(to + 1);
    const data = sig.data ? [...sig.data] : [];
    if (dataCountInRange > 0) data.splice(dataCountBefore, dataCountInRange);

    // 削除範囲の直後が '.' だった場合、元の状態を復元する
    if (to + 1 < wave.length && wave[to + 1] === '.') {
        // 削除後の波形において、from の直前の状態を解決する
        let currentPrevChar = '.';
        let currentPrevData: string | undefined = undefined;
        for (let i = from - 1; i >= 0; i--) {
            const ch = newWave[i];
            if (ch !== '.' && ch !== '|') {
                currentPrevChar = ch;
                if (ch === '=' || (ch >= '2' && ch <= '9')) {
                    let dataIdx = 0;
                    for (let j = 0; j <= i; j++) {
                        const c = newWave[j];
                        if (c === '=' || (c >= '2' && c <= '9')) dataIdx++;
                    }
                    if (dataIdx - 1 >= 0 && dataIdx - 1 < data.length) {
                        currentPrevData = data[dataIdx - 1];
                    }
                }
                break;
            }
        }

        // 元の直前の状態 (afterChar, afterData) と異なる場合、復元する
        if (currentPrevChar !== afterChar || (currentPrevChar === '=' || (currentPrevChar >= '2' && currentPrevChar <= '9') ? currentPrevData !== afterData : false)) {
            newWave = newWave.slice(0, from) + afterChar + newWave.slice(from + 1);
            if (afterChar === '=' || (afterChar >= '2' && afterChar <= '9')) {
                // from までのデータセルの数を数える
                let dataIdx = 0;
                for (let j = 0; j < from; j++) {
                    const c = newWave[j];
                    if (c === '=' || (c >= '2' && c <= '9')) dataIdx++;
                }
                data.splice(dataIdx, 0, afterData ?? '');
            }
        }
    }

    return { ...sig, wave: newWave, data: data.length > 0 ? data : undefined };
}

/** wave の from〜to の wave スライスと対応する data エントリを抽出する */
function copyStepsFromSignal(sig: WaveSignal, from: number, to: number): { wave: string; data: string[] | undefined } {
    let waveSlice = sig.wave.slice(from, to + 1);
    let dataStart = 0;
    let dataCount = 0;
    for (let i = 0; i < sig.wave.length; i++) {
        const ch = sig.wave[i];
        const isData = ch === '=' || (ch >= '2' && ch <= '9');
        if (isData) {
            if (i < from) dataStart++;
            else if (i <= to) dataCount++;
        }
    }

    let data = sig.data ? sig.data.slice(dataStart, dataStart + dataCount) : [];

    // 先頭が '.' の場合、直前の有効な状態を解決する
    if (waveSlice.startsWith('.')) {
        let resolvedChar = '.';
        let resolvedData: string | undefined = undefined;

        for (let i = from - 1; i >= 0; i--) {
            const ch = sig.wave[i];
            if (ch !== '.' && ch !== '|') {
                resolvedChar = ch;
                if (ch === '=' || (ch >= '2' && ch <= '9')) {
                    // 直前のデータセルのインデックスは dataStart - 1
                    if (sig.data && dataStart - 1 >= 0 && dataStart - 1 < sig.data.length) {
                        resolvedData = sig.data[dataStart - 1];
                    }
                }
                break;
            }
        }

        if (resolvedChar !== '.') {
            waveSlice = resolvedChar + waveSlice.slice(1);
            if (resolvedChar === '=' || (resolvedChar >= '2' && resolvedChar <= '9')) {
                if (resolvedData !== undefined) {
                    data.unshift(resolvedData);
                } else {
                    data.unshift(''); // ラベルがない場合のフォールバック
                }
            }
        }
    }

    return { wave: waveSlice, data: data.length > 0 ? data : undefined };
}

/** wave の position に clipWave を挿入し、対応する data エントリも挿入する */
function pasteStepsIntoSignal(sig: WaveSignal, position: number, clipWave: string, clipData: string[] | undefined): WaveSignal {
    const wave = sig.wave;
    let dataCountBefore = 0;
    for (let i = 0; i < Math.min(position, wave.length); i++) {
        const ch = wave[i];
        if (ch === '=' || (ch >= '2' && ch <= '9')) dataCountBefore++;
    }

    // ペースト先の直前の状態を解決する
    let prevChar = '.';
    let prevData: string | undefined = undefined;
    for (let i = position - 1; i >= 0; i--) {
        const ch = wave[i];
        if (ch !== '.' && ch !== '|') {
            prevChar = ch;
            if (ch === '=' || (ch >= '2' && ch <= '9')) {
                // 直前のデータセルのインデックスを計算
                let dataIdx = 0;
                for (let j = 0; j <= i; j++) {
                    const c = wave[j];
                    if (c === '=' || (c >= '2' && c <= '9')) dataIdx++;
                }
                if (sig.data && dataIdx - 1 >= 0 && dataIdx - 1 < sig.data.length) {
                    prevData = sig.data[dataIdx - 1];
                }
            }
            break;
        }
    }

    // ペーストする波形の先頭が解決済みの値で、かつペースト先の直前の状態と同じ場合は '.' に戻す
    let finalClipWave = clipWave;
    let finalClipData = clipData ? [...clipData] : [];

    if (clipWave.length > 0 && clipWave[0] !== '.' && clipWave[0] !== '|') {
        const firstChar = clipWave[0];
        const isData = firstChar === '=' || (firstChar >= '2' && firstChar <= '9');

        if (firstChar === prevChar) {
            if (!isData || (isData && finalClipData.length > 0 && finalClipData[0] === prevData)) {
                finalClipWave = '.' + clipWave.slice(1);
                if (isData && finalClipData.length > 0) {
                    finalClipData.shift();
                }
            }
        }
    }

    // ペーストする波形の最後の状態を解決する
    let clipLastChar = '.';
    let clipLastData: string | undefined = undefined;
    for (let i = finalClipWave.length - 1; i >= 0; i--) {
        const ch = finalClipWave[i];
        if (ch !== '.' && ch !== '|') {
            clipLastChar = ch;
            if (ch === '=' || (ch >= '2' && ch <= '9')) {
                let dataIdx = 0;
                for (let j = 0; j <= i; j++) {
                    const c = finalClipWave[j];
                    if (c === '=' || (c >= '2' && c <= '9')) dataIdx++;
                }
                if (finalClipData && dataIdx - 1 >= 0 && dataIdx - 1 < finalClipData.length) {
                    clipLastData = finalClipData[dataIdx - 1];
                }
            }
            break;
        }
    }

    // ペーストする波形がすべて '.' の場合は、ペースト先の直前の状態を引き継ぐ
    if (clipLastChar === '.') {
        clipLastChar = prevChar;
        clipLastData = prevData;
    }

    // ペースト先の波形が '.' で始まっている場合、ペーストによってその '.' が意図しない状態を継続してしまうのを防ぐ
    let targetWave = wave;
    let targetData = sig.data ? [...sig.data] : [];
    if (position < targetWave.length && targetWave[position] === '.') {
        // ペースト先の元の状態 (prevChar) と、ペーストする波形の最後の状態 (clipLastChar) が異なる場合、
        // ペースト先の '.' を元の状態 (prevChar) に置き換える
        if (clipLastChar !== prevChar || (clipLastChar === '=' || (clipLastChar >= '2' && clipLastChar <= '9') ? clipLastData !== prevData : false)) {
            targetWave = targetWave.slice(0, position) + prevChar + targetWave.slice(position + 1);
            if (prevChar === '=' || (prevChar >= '2' && prevChar <= '9')) {
                targetData.splice(dataCountBefore, 0, prevData ?? '');
            }
        }
    }

    let newWave = targetWave.slice(0, position) + finalClipWave + targetWave.slice(position);
    let data = targetData;
    if (finalClipData && finalClipData.length > 0) {
        data.splice(dataCountBefore, 0, ...finalClipData);
    }

    // ペースト範囲の直後の文字が '.' の場合、元の状態を復元する必要があるかチェック
    const afterIdx = position + finalClipWave.length;
    if (afterIdx < newWave.length) {
        if (newWave[afterIdx] === '.') {
            // 挿入後の波形において、afterIdx の直前の状態を解決する
            let currentPrevChar = '.';
            let currentPrevData: string | undefined = undefined;
            for (let i = afterIdx - 1; i >= 0; i--) {
                const ch = newWave[i];
                if (ch !== '.' && ch !== '|') {
                    currentPrevChar = ch;
                    if (ch === '=' || (ch >= '2' && ch <= '9')) {
                        let dataIdx = 0;
                        for (let j = 0; j <= i; j++) {
                            const c = newWave[j];
                            if (c === '=' || (c >= '2' && c <= '9')) dataIdx++;
                        }
                        if (dataIdx - 1 >= 0 && dataIdx - 1 < data.length) {
                            currentPrevData = data[dataIdx - 1];
                        }
                    }
                    break;
                }
            }

            // 元の直前の状態 (prevChar, prevData) と異なる場合、復元する
            if (currentPrevChar !== prevChar || (currentPrevChar === '=' || (currentPrevChar >= '2' && currentPrevChar <= '9') ? currentPrevData !== prevData : false)) {
                newWave = newWave.slice(0, afterIdx) + prevChar + newWave.slice(afterIdx + 1);
                if (prevChar === '=' || (prevChar >= '2' && prevChar <= '9')) {
                    // afterIdx までのデータセルの数を数える
                    let dataIdx = 0;
                    for (let j = 0; j < afterIdx; j++) {
                        const c = newWave[j];
                        if (c === '=' || (c >= '2' && c <= '9')) dataIdx++;
                    }
                    data.splice(dataIdx, 0, prevData ?? '');
                }
            }
        } else if (newWave[afterIdx] !== '|') {
            // 直後の文字が '.' 以外の場合、挿入された波形の最後の状態と同じであれば '.' に変換する
            const afterChar = newWave[afterIdx];
            let afterData: string | undefined = undefined;
            if (afterChar === '=' || (afterChar >= '2' && afterChar <= '9')) {
                let dataIdx = 0;
                for (let j = 0; j <= afterIdx; j++) {
                    const c = newWave[j];
                    if (c === '=' || (c >= '2' && c <= '9')) dataIdx++;
                }
                if (dataIdx - 1 >= 0 && dataIdx - 1 < data.length) {
                    afterData = data[dataIdx - 1];
                }
            }

            if (afterChar === clipLastChar && (afterChar === '=' || (afterChar >= '2' && afterChar <= '9') ? afterData === clipLastData : true)) {
                newWave = newWave.slice(0, afterIdx) + '.' + newWave.slice(afterIdx + 1);
                if (afterChar === '=' || (afterChar >= '2' && afterChar <= '9')) {
                    let dataIdx = 0;
                    for (let j = 0; j <= afterIdx; j++) {
                        const c = newWave[j];
                        if (c === '=' || (c >= '2' && c <= '9')) dataIdx++;
                    }
                    data.splice(dataIdx - 1, 1);
                }
            }
        }
    }

    return { ...sig, wave: newWave, data: data.length > 0 ? data : undefined };
}

/** signal 配列全体に対して mapper を適用して新しい配列を返す */
function mapAllSignals(
    signals: WaveDromData['signal'],
    mapper: (sig: WaveSignal) => WaveSignal
): WaveDromData['signal'] {
    return signals.map((s) => {
        if (Array.isArray(s)) {
            const [label, ...rest] = s as [string, ...WaveSignal[]];
            return [label, ...rest.map((r) => (isWaveSignal(r) ? mapper(r) : r))] as typeof s;
        }
        if (isWaveSignal(s)) return mapper(s);
        return s;
    });
}

/** フラットな信号リストのindexからwaveformData.signalを操作するためのヘルパー */
function updateFlatSignal(
    data: WaveDromData,
    flatIndex: number,
    updater: (signal: { name: string; wave: string; data?: string[] }) => { name: string; wave: string; data?: string[] }
): WaveDromData {
    const flatSignals = getSignalList(data.signal);
    if (flatIndex < 0 || flatIndex >= flatSignals.length) return data;

    const target = flatSignals[flatIndex];
    const updated = updater({ name: target.name, wave: target.wave, data: target.data });

    // deepコピーしてtargetを置き換え
    const newData = JSON.parse(JSON.stringify(data)) as WaveDromData;
    const newFlat = getSignalList(newData.signal);
    Object.assign(newFlat[flatIndex], updated);
    return newData;
}

export const useWaveformStore = create<WaveformStore>((set, get) => ({
    waveformData: DEFAULT_WAVEFORM,
    undoStack: [],
    redoStack: [],
    selectedTool: '1',
    selectedSignalIndex: null,
    jsonPanelVisible: false,
    hoverInfo: null,
    statusMessage: '',
    insertCursor: null,
    stepSelection: null,
    stepClipboard: null,

    setWaveformData: (data, pushHist = true) =>
        set((state) => ({
            waveformData: data,
            ...(pushHist ? pushHistory(state, state.waveformData) : {}),
        })),

    setCell: (signalIndex, stepIndex, value, pushHist = true) =>
        set((state) => {
            const prev = state.waveformData;
            const newData = updateFlatSignal(prev, signalIndex, (sig) => {
                const waveArr = sig.wave.split('');
                // 波形文字列を必要な長さに拡張
                while (waveArr.length <= stepIndex) waveArr.push('.');
                waveArr[stepIndex] = value;
                return { ...sig, wave: waveArr.join('') };
            });
            return { waveformData: newData, ...(pushHist ? pushHistory(state, prev) : {}) };
        }),

    setCellRange: (signalIndex, startStep, endStep, value) =>
        set((state) => {
            const prev = state.waveformData;
            const from = Math.min(startStep, endStep);
            const to = Math.max(startStep, endStep);
            const newData = updateFlatSignal(prev, signalIndex, (sig) => {
                const waveArr = sig.wave.split('');
                while (waveArr.length <= to) waveArr.push('.');
                for (let i = from; i <= to; i++) waveArr[i] = value;
                return { ...sig, wave: waveArr.join('') };
            });
            return { waveformData: newData, ...pushHistory(state, prev) };
        }),

    setCellRangeWithContinue: (signalIndex, dragStartStep, currentStep, value, pushHist = true) =>
        set((state) => {
            const prev = state.waveformData;
            const from = Math.min(dragStartStep, currentStep);
            const to = Math.max(dragStartStep, currentStep);
            // 左端のセルだけ value、それ以降は継続 '.' を設定
            const newData = updateFlatSignal(prev, signalIndex, (sig) => {
                const waveArr = sig.wave.split('');
                while (waveArr.length <= to) waveArr.push('.');
                waveArr[from] = value;
                for (let i = from + 1; i <= to; i++) waveArr[i] = '.';
                return { ...sig, wave: waveArr.join('') };
            });
            return { waveformData: newData, ...(pushHist ? pushHistory(state, prev) : {}) };
        }),

    beginDragEdit: () =>
        set((state) => ({
            undoStack: [...state.undoStack, state.waveformData].slice(-MAX_HISTORY),
            redoStack: [],
        })),

    setDataLabel: (signalIndex, stepIndex, label) =>
        set((state) => {
            const prev = state.waveformData;
            const flatSignals = getSignalList(prev.signal);
            const sig = flatSignals[signalIndex];
            if (!sig) return {};

            // stepIndexがdataの何番目に対応するかを計算
            let dataCount = 0;
            for (let i = 0; i <= stepIndex && i < sig.wave.length; i++) {
                const ch = sig.wave[i];
                if (ch === '=' || (ch >= '2' && ch <= '9')) {
                    if (i === stepIndex) break;
                    dataCount++;
                }
            }
            const newData = updateFlatSignal(prev, signalIndex, (s) => {
                const newDataArr = [...(s.data ?? [])];
                while (newDataArr.length <= dataCount) newDataArr.push('');
                newDataArr[dataCount] = label;
                return { ...s, data: newDataArr };
            });
            return { waveformData: newData, ...pushHistory(state, prev) };
        }),

    addSignal: (afterIndex) =>
        set((state) => {
            const prev = state.waveformData;
            const maxLen = getSignalList(prev.signal).reduce((m, s) => Math.max(m, s.wave.length), 8);
            const newSig = { name: 'new_signal', wave: '.'.repeat(maxLen) };
            const newSignals = [...prev.signal];

            if (afterIndex === undefined || afterIndex < 0) {
                newSignals.push(newSig);
            } else {
                const flat = getSignalList(prev.signal);
                // flat indexをtop-level indexに変換（簡易）
                let count = 0;
                let insertAt = newSignals.length;
                for (let i = 0; i < newSignals.length; i++) {
                    const item = newSignals[i];
                    if (isWaveSignal(item)) {
                        if (count === afterIndex) { insertAt = i + 1; break; }
                        count++;
                    }
                }
                newSignals.splice(insertAt, 0, newSig);
                void flat;
            }
            const newData = { ...prev, signal: newSignals };
            return { waveformData: newData, ...pushHistory(state, prev) };
        }),

    removeSignal: (index) =>
        set((state) => {
            const prev = state.waveformData;
            const flatSignals = getSignalList(prev.signal);
            if (index < 0 || index >= flatSignals.length) return {};
            const target = flatSignals[index];
            const newData: WaveDromData = {
                ...prev,
                signal: prev.signal.filter((s) => s !== target),
            };
            return { waveformData: newData, ...pushHistory(state, prev) };
        }),

    renameSignal: (index, name) =>
        set((state) => {
            const prev = state.waveformData;
            const newData = updateFlatSignal(prev, index, (sig) => ({ ...sig, name }));
            return { waveformData: newData, ...pushHistory(state, prev) };
        }),

    moveSignal: (fromIndex, toIndex) =>
        set((state) => {
            const prev = state.waveformData;
            const flat = getSignalList(prev.signal);
            if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return {};
            if (fromIndex >= flat.length || toIndex >= flat.length) return {};

            // シンプルなtop-level配列のみ対応（グループなし）
            const newSignals = [...prev.signal.filter(isWaveSignal)];
            const [moved] = newSignals.splice(fromIndex, 1);
            newSignals.splice(toIndex, 0, moved);
            const newData = { ...prev, signal: newSignals };
            return { waveformData: newData, ...pushHistory(state, prev) };
        }),

    addTimeStep: () =>
        set((state) => {
            const prev = state.waveformData;
            const newData: WaveDromData = {
                ...prev,
                signal: prev.signal.map((s) =>
                    isWaveSignal(s) ? { ...s, wave: s.wave + '.' } : s
                ),
            };
            return { waveformData: newData, ...pushHistory(state, prev) };
        }),

    removeTimeStep: () =>
        set((state) => {
            const prev = state.waveformData;
            const newData: WaveDromData = {
                ...prev,
                signal: prev.signal.map((s) =>
                    isWaveSignal(s) && s.wave.length > 1 ? { ...s, wave: s.wave.slice(0, -1) } : s
                ),
            };
            return { waveformData: newData, ...pushHistory(state, prev) };
        }),

    setSelectedTool: (tool) => set((state) => ({
        selectedTool: tool,
        // 編集ツールに切り替えたとき選択範囲をクリア、カーソルは保持
        stepSelection: tool !== 'select' ? null : state.stepSelection,
    })),
    setSelectedSignalIndex: (index) => set({ selectedSignalIndex: index }),
    setJsonPanelVisible: (visible) => set({ jsonPanelVisible: visible }),
    setHoverInfo: (info) => set({ hoverInfo: info }),

    // ─── 挿入カーソル・選択ツール ─────────────────────────────────────
    // カーソルを設定したら選択範囲をクリア（排他）
    setInsertCursor: (boundary) =>
        set(boundary !== null
            ? { insertCursor: boundary, stepSelection: null }
            : { insertCursor: null }),

    // 選択範囲を設定したらカーソルをクリア（排他）
    setStepSelection: (selection) =>
        set(selection !== null
            ? { stepSelection: selection, insertCursor: null }
            : { stepSelection: null }),

    insertStepsAtCursor: (count = 1) =>
        set((state) => {
            const cursor = state.insertCursor;
            if (cursor === null) return {};
            const prev = state.waveformData;
            const newSignals = mapAllSignals(prev.signal, (sig) =>
                insertStepsIntoSignal(sig, cursor, count)
            );
            const newData = { ...prev, signal: newSignals };
            // カーソルを挿入後の位置に移動
            return { waveformData: newData, insertCursor: cursor + count, ...pushHistory(state, prev) };
        }),

    deleteSelectedSteps: () =>
        set((state) => {
            const sel = state.stepSelection;
            if (!sel) return {};
            const prev = state.waveformData;
            const { from, to, signalIndex } = sel;

            let newSignals;
            if (signalIndex !== undefined) {
                // 単一信号の削除
                const flatSignals = getSignalList(prev.signal);
                newSignals = mapAllSignals(prev.signal, (sig) => {
                    if (flatSignals.indexOf(sig) === signalIndex) {
                        return deleteStepsFromSignal(sig, from, to);
                    }
                    return sig;
                });
            } else {
                // 全信号の削除
                newSignals = mapAllSignals(prev.signal, (sig) =>
                    deleteStepsFromSignal(sig, from, to)
                );
            }

            const newData = { ...prev, signal: newSignals };
            // 削除後のカーソル位置: 選択開始位置（最大値クランプ）
            const maxLen = getSignalList(newData.signal).reduce((m, s) => Math.max(m, s.wave.length), 0);
            const newCursor = Math.min(from, maxLen);
            return {
                waveformData: newData,
                stepSelection: null,
                insertCursor: newCursor,
                ...pushHistory(state, prev),
            };
        }),

    copySteps: () =>
        set((state) => {
            const sel = state.stepSelection;
            if (!sel) return {};
            const { from, to, signalIndex } = sel;
            const signals = getSignalList(state.waveformData.signal);

            let clipboard: StepClipboard;
            if (signalIndex !== undefined) {
                // 単一信号のコピー
                const targetSig = signals[signalIndex];
                if (!targetSig) return {};
                const copied = copyStepsFromSignal(targetSig, from, to);
                clipboard = {
                    waves: [copied.wave],
                    dataSlices: [copied.data],
                };
            } else {
                // 全信号のコピー
                clipboard = {
                    waves: signals.map((sig) => copyStepsFromSignal(sig, from, to).wave),
                    dataSlices: signals.map((sig) => copyStepsFromSignal(sig, from, to).data),
                };
            }
            return { stepClipboard: clipboard };
        }),

    cutSteps: () =>
        set((state) => {
            const sel = state.stepSelection;
            if (!sel) return {};
            const { from, to, signalIndex } = sel;
            const signals = getSignalList(state.waveformData.signal);

            let clipboard: StepClipboard;
            if (signalIndex !== undefined) {
                const targetSig = signals[signalIndex];
                if (!targetSig) return {};
                const copied = copyStepsFromSignal(targetSig, from, to);
                clipboard = {
                    waves: [copied.wave],
                    dataSlices: [copied.data],
                };
            } else {
                clipboard = {
                    waves: signals.map((sig) => copyStepsFromSignal(sig, from, to).wave),
                    dataSlices: signals.map((sig) => copyStepsFromSignal(sig, from, to).data),
                };
            }

            const prev = state.waveformData;
            let newSignals;
            if (signalIndex !== undefined) {
                const flatSignals = getSignalList(prev.signal);
                newSignals = mapAllSignals(prev.signal, (sig) => {
                    if (flatSignals.indexOf(sig) === signalIndex) {
                        return deleteStepsFromSignal(sig, from, to);
                    }
                    return sig;
                });
            } else {
                newSignals = mapAllSignals(prev.signal, (sig) =>
                    deleteStepsFromSignal(sig, from, to)
                );
            }

            const newData = { ...prev, signal: newSignals };
            const maxLen = getSignalList(newData.signal).reduce((m, s) => Math.max(m, s.wave.length), 0);
            const newCursor = Math.min(from, maxLen);
            return {
                waveformData: newData,
                stepClipboard: clipboard,
                stepSelection: null,
                insertCursor: newCursor,
                ...pushHistory(state, prev),
            };
        }),

    pasteAtCursor: () =>
        set((state) => {
            const clipboard = state.stepClipboard;
            if (!clipboard) return {};

            const prev = state.waveformData;
            const flatSignals = getSignalList(prev.signal);

            // 選択範囲がある場合は、その範囲を削除してからペーストする（上書きペースト）
            let targetCursor = state.insertCursor;
            let baseSignals = prev.signal;

            if (state.stepSelection) {
                const { from, to, signalIndex } = state.stepSelection;
                targetCursor = from;

                if (signalIndex !== undefined) {
                    baseSignals = mapAllSignals(prev.signal, (sig) => {
                        if (flatSignals.indexOf(sig) === signalIndex) {
                            return deleteStepsFromSignal(sig, from, to);
                        }
                        return sig;
                    });
                } else {
                    baseSignals = mapAllSignals(prev.signal, (sig) =>
                        deleteStepsFromSignal(sig, from, to)
                    );
                }
            }

            if (targetCursor === null) return {};

            const isSingleSignalClipboard = clipboard.waves.length === 1;
            const targetSignalIndex = state.stepSelection?.signalIndex ?? state.selectedSignalIndex;

            let clipIdx = 0;
            const newSignals = mapAllSignals(baseSignals, (sig) => {
                const idx = flatSignals.indexOf(sig);

                if (isSingleSignalClipboard) {
                    // 単一信号のペースト: 選択中の信号（または最後に操作した信号）にのみペースト
                    if (idx === targetSignalIndex) {
                        const clipWave = clipboard.waves[0];
                        const clipData = clipboard.dataSlices[0];
                        return pasteStepsIntoSignal(sig, targetCursor!, clipWave, clipData);
                    }
                    return sig;
                } else {
                    // 全信号のペースト
                    const clipWave = clipboard.waves[idx] ?? '.'.repeat(clipboard.waves[0]?.length ?? 1);
                    const clipData = clipboard.dataSlices[idx];
                    const result = pasteStepsIntoSignal(sig, targetCursor!, clipWave, clipData);
                    clipIdx++;
                    return result;
                }
            });
            void clipIdx;
            const pasteLen = clipboard.waves[0]?.length ?? 0;
            const newData = { ...prev, signal: newSignals };
            return {
                waveformData: newData,
                insertCursor: targetCursor + pasteLen,
                stepSelection: null, // ペースト後は選択範囲をクリア
                ...pushHistory(state, prev),
            };
        }),

    undo: () =>
        set((state) => {
            if (state.undoStack.length === 0) return {};
            const undoStack = [...state.undoStack];
            const prev = undoStack.pop()!;
            return {
                waveformData: prev,
                undoStack,
                redoStack: [state.waveformData, ...state.redoStack],
            };
        }),

    redo: () =>
        set((state) => {
            if (state.redoStack.length === 0) return {};
            const redoStack = [...state.redoStack];
            const next = redoStack.shift()!;
            return {
                waveformData: next,
                redoStack,
                undoStack: [...state.undoStack, state.waveformData],
            };
        }),

    canUndo: () => get().undoStack.length > 0,
    canRedo: () => get().redoStack.length > 0,
}));
