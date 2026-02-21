import { create } from 'zustand';
import type { WaveDromData, WaveTool, AppState } from '../types/wavedrom';
import { DEFAULT_WAVEFORM } from '../types/wavedrom';
import { isWaveSignal, getSignalList } from '../utils/waveformUtils';

const MAX_HISTORY = 50;

interface WaveformStore extends AppState {
    // 波形データ操作
    setWaveformData: (data: WaveDromData, pushHistory?: boolean) => void;
    setCell: (signalIndex: number, stepIndex: number, value: string) => void;
    setCellRange: (signalIndex: number, startStep: number, endStep: number, value: string) => void;
    setDataLabel: (signalIndex: number, stepIndex: number, label: string) => void;

    // 信号管理
    addSignal: (afterIndex?: number) => void;
    removeSignal: (index: number) => void;
    renameSignal: (index: number, name: string) => void;
    moveSignal: (fromIndex: number, toIndex: number) => void;

    // タイムステップ管理
    addTimeStep: () => void;
    removeTimeStep: () => void;

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

    setWaveformData: (data, pushHist = true) =>
        set((state) => ({
            waveformData: data,
            ...(pushHist ? pushHistory(state, state.waveformData) : {}),
        })),

    setCell: (signalIndex, stepIndex, value) =>
        set((state) => {
            const prev = state.waveformData;
            const newData = updateFlatSignal(prev, signalIndex, (sig) => {
                const waveArr = sig.wave.split('');
                // 波形文字列を必要な長さに拡張
                while (waveArr.length <= stepIndex) waveArr.push('.');
                waveArr[stepIndex] = value;
                return { ...sig, wave: waveArr.join('') };
            });
            return { waveformData: newData, ...pushHistory(state, prev) };
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

    setSelectedTool: (tool) => set({ selectedTool: tool }),
    setSelectedSignalIndex: (index) => set({ selectedSignalIndex: index }),
    setJsonPanelVisible: (visible) => set({ jsonPanelVisible: visible }),
    setHoverInfo: (info) => set({ hoverInfo: info }),

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
