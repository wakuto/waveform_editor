import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    CELL_WIDTH,
    ROW_HEIGHT,
    WAVE_TOP,
    WAVE_BOT,
    getSegmentPath,
    buildDataIndexMap,
    resolveWave,
    DATA_COLORS,
} from '../../utils/waveformUtils';
import type { WaveSignal } from '../../types/wavedrom';
import { useWaveformStore } from '../../store/useWaveformStore';
import styles from './WaveRow.module.css';

interface WaveRowProps {
    signal: WaveSignal;
    signalIndex: number;
    hoverStep: number | null;
    insertCursor?: number | null;
    stepSelection?: { from: number; to: number } | null;
    isSelectMode?: boolean;
}

const WaveRow: React.FC<WaveRowProps> = ({
    signal,
    signalIndex,
    hoverStep,
    insertCursor = null,
    stepSelection = null,
    isSelectMode = false,
}) => {
    const { wave, data } = signal;
    const selectedTool = useWaveformStore((s) => s.selectedTool);
    const setCell = useWaveformStore((s) => s.setCell);
    const setCellRangeWithContinue = useWaveformStore((s) => s.setCellRangeWithContinue);
    const beginDragEdit = useWaveformStore((s) => s.beginDragEdit);
    const setHoverInfo = useWaveformStore((s) => s.setHoverInfo);
    const setDataLabel = useWaveformStore((s) => s.setDataLabel);

    const dataIndexMap = buildDataIndexMap(wave);
    const isDragging = useRef(false);
    const dragStart = useRef<number | null>(null);
    // ドラッグ中UIフィードバック用 state
    const [isDraggingState, setIsDraggingState] = useState(false);
    const [dragCurrentStep, setDragCurrentStep] = useState<number | null>(null);
    // ラベルインライン編集用 state
    const [editingDataStep, setEditingDataStep] = useState<number | null>(null);
    const [editingLabel, setEditingLabel] = useState('');
    const editInputRef = useRef<HTMLInputElement>(null);

    const getCellIndex = useCallback((e: React.MouseEvent<SVGElement>) => {
        const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
        const relX = e.clientX - rect.left;
        return Math.floor(relX / CELL_WIDTH);
    }, []);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent<SVGRectElement>, stepIndex: number) => {
            if (e.button !== 0) return;
            // ブラウザのネイティブドラッグを防止
            e.preventDefault();
            // ドラッグ開始前に現在状態を履歴に1回だけ記録
            beginDragEdit();
            isDragging.current = true;
            dragStart.current = stepIndex;
            setIsDraggingState(true);
            setDragCurrentStep(stepIndex);
            // 履歴は beginDragEdit で積み済みなので pushHist=false
            setCell(signalIndex, stepIndex, selectedTool, false);
        },
        [signalIndex, selectedTool, setCell, beginDragEdit]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<SVGElement>) => {
            if (isSelectMode) return; // 選択モード時はオーバーレイが代わりに処理
            const step = getCellIndex(e);
            setHoverInfo({ signalIndex, stepIndex: step });
            if (isDragging.current && dragStart.current !== null) {
                setDragCurrentStep(step);
                setCellRangeWithContinue(signalIndex, dragStart.current, step, selectedTool, false);
            }
        },
        [isSelectMode, signalIndex, selectedTool, getCellIndex, setHoverInfo, setCellRangeWithContinue]
    );

    const stopDrag = useCallback(() => {
        isDragging.current = false;
        dragStart.current = null;
        setIsDraggingState(false);
        setDragCurrentStep(null);
    }, []);

    // SVG 外でマウスボタンを離したときもドラッグを終了させる
    useEffect(() => {
        window.addEventListener('mouseup', stopDrag);
        return () => window.removeEventListener('mouseup', stopDrag);
    }, [stopDrag]);

    const handleMouseLeave = useCallback(() => {
        setHoverInfo(null);
        // ドラッグ中は isDragging を維持（window mouseup で終了）
    }, [setHoverInfo]);

    /** '.' を後ろ向きに解決して、その波形の起源となるデータセルのインデックスを返す */
    const resolveDataSrcStep = useCallback(
        (stepIndex: number): number | null => {
            const resolved = resolveWave(wave);
            const rch = resolved[stepIndex];
            if (!rch || (rch !== '=' && (rch < '2' || rch > '9'))) return null;
            // '.' を遡って元のデータセルを探す
            let src = stepIndex;
            while (src > 0 && wave[src] === '.') src--;
            return src;
        },
        [wave]
    );

    /** データセルとその後継続する '.' の合計セル数を返す */
    const getDataSpan = useCallback(
        (srcStep: number): number => {
            let span = 1;
            let j = srcStep + 1;
            while (j < wave.length && wave[j] === '.') { span++; j++; }
            return span;
        },
        [wave]
    );

    /** インライン編集を開く */
    const openLabelEdit = useCallback(
        (stepIndex: number) => {
            const src = resolveDataSrcStep(stepIndex);
            if (src === null) return;
            const di = dataIndexMap.get(src) ?? 0;
            setEditingDataStep(src);
            setEditingLabel(data?.[di] ?? '');
            // 次フレームで autoFocus が効くよう setTimeout
            setTimeout(() => editInputRef.current?.select(), 0);
        },
        [resolveDataSrcStep, dataIndexMap, data]
    );

    /** インライン編集を確定する */
    const commitLabelEdit = useCallback(() => {
        if (editingDataStep !== null) {
            setDataLabel(signalIndex, editingDataStep, editingLabel);
            setEditingDataStep(null);
        }
    }, [editingDataStep, editingLabel, signalIndex, setDataLabel]);

    /** インライン編集をキャンセルする */
    const cancelLabelEdit = useCallback(() => {
        setEditingDataStep(null);
    }, []);

    const handleDoubleClick = useCallback(
        (_e: React.MouseEvent<SVGRectElement>, stepIndex: number) => {
            openLabelEdit(stepIndex);
        },
        [openLabelEdit]
    );

    const handleContextMenu = useCallback(
        (e: React.MouseEvent<SVGRectElement>, stepIndex: number) => {
            const resolved = resolveWave(wave);
            const rch = resolved[stepIndex];
            // データセルの右クリック → ラベル編集（親の contextMenu への伝播を止める）
            if (rch === '=' || (rch >= '2' && rch <= '9')) {
                e.preventDefault();
                e.stopPropagation();
                openLabelEdit(stepIndex);
            }
        },
        [wave, openLabelEdit]
    );

    const totalWidth = wave.length * CELL_WIDTH;

    // '.' を前の有効な状態に解決した配列（色・パス生成に使用）
    const resolved = resolveWave(wave);

    // ドラッグ中の範囲を計算
    const dragRange =
        isDraggingState && dragStart.current !== null && dragCurrentStep !== null
            ? {
                from: Math.min(dragStart.current, dragCurrentStep),
                to: Math.max(dragStart.current, dragCurrentStep),
                valueStep: Math.min(dragStart.current, dragCurrentStep),
            }
            : null;

    const segments: React.ReactNode[] = [];

    for (let i = 0; i < wave.length; i++) {
        const rawCh = wave[i];                          // 生の文字（継続判定用）
        const rch = resolved[i];                        // 解決済み文字（描画用）
        const rprev = i > 0 ? resolved[i - 1] : null;  // 解決済み前の文字
        const isContinue = rawCh === '.';               // このセルが '.' → 左端 < なし
        const nextRawCh = i + 1 < wave.length ? wave[i + 1] : null;
        const isNextContinue = nextRawCh === '.';       // 次のセルが '.' → 右端 > なし
        const x = i * CELL_WIDTH;
        const seg = getSegmentPath(rch, rprev, x, CELL_WIDTH, isContinue, isNextContinue);
        const isHovered = hoverStep === i;
        const di = dataIndexMap.get(i);
        const label = di !== undefined ? (data?.[di] ?? '') : undefined;

        // ドラッグ範囲内かどうか
        const isInDragRange = dragRange !== null && i >= dragRange.from && i <= dragRange.to;
        const isDragValueCell = dragRange !== null && i === dragRange.valueStep;

        // g 要素のクラスを決定
        const gClassName = [
            isHovered ? styles.hovered : undefined,
            isInDragRange ? (isDragValueCell ? styles.dragValue : styles.dragContinue) : undefined,
        ]
            .filter(Boolean)
            .join(' ') || undefined;

        segments.push(
            <g key={i} className={gClassName}>
                {/* ホバーハイライト背景 */}
                {isHovered && (
                    <rect
                        x={x}
                        y={0}
                        width={CELL_WIDTH}
                        height={ROW_HEIGHT}
                        fill="rgba(255,255,255,0.08)"
                    />
                )}

                {/* ドラッグ中オーバーレイ: 開始セル（value セル）*/}
                {isDragValueCell && (
                    <rect
                        x={x}
                        y={0}
                        width={CELL_WIDTH}
                        height={ROW_HEIGHT}
                        fill="rgba(255,200,50,0.38)"
                        style={{ pointerEvents: 'none' }}
                    />
                )}

                {/* ドラッグ中オーバーレイ: 継続セル */}
                {isInDragRange && !isDragValueCell && (
                    <rect
                        x={x}
                        y={0}
                        width={CELL_WIDTH}
                        height={ROW_HEIGHT}
                        fill="rgba(255,200,50,0.18)"
                        style={{ pointerEvents: 'none' }}
                    />
                )}

                {/* 塗りつぶし（Data / Undefined） */}
                {seg.fill && (
                    <path
                        d={seg.fill}
                        fill={seg.fillColor ?? 'rgba(100,100,200,0.3)'}
                        stroke="none"
                    />
                )}

                {/* 波形ライン */}
                {seg.d && (
                    <path
                        d={seg.d}
                        fill="none"
                        stroke={getStrokeColor(rch)}
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray={rch === 'z' ? '4 3' : undefined}
                    />
                )}

                {/* データラベル */}
                {label !== undefined && (
                    <text
                        x={x + CELL_WIDTH / 2}
                        y={ROW_HEIGHT / 2 + 4}
                        textAnchor="middle"
                        fontSize={11}
                        fill={DATA_COLORS[rch] ?? '#4a9df0'}
                        style={{ userSelect: 'none', pointerEvents: 'none' }}
                    >
                        {label}
                    </text>
                )}

                {/* インタラクティブ透明レイヤー（選択モード時は無効） */}
                {!isSelectMode && (
                    <rect
                        x={x + 1}
                        y={0}
                        width={CELL_WIDTH - 2}
                        height={ROW_HEIGHT}
                        fill="transparent"
                        style={{ cursor: 'crosshair' }}
                        onMouseDown={(e) => handleMouseDown(e, i)}
                        onDoubleClick={(e) => handleDoubleClick(e, i)}
                        onContextMenu={(e) => handleContextMenu(e, i)}
                    />
                )}
            </g>
        );
    }

    return (
        <svg
            width={totalWidth}
            height={ROW_HEIGHT}
            className={`${styles.waveRow}${isDraggingState ? ` ${styles.dragging}` : ''}`}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onDragStart={(e) => e.preventDefault()}
        >
            {/* グリッドライン */}
            {Array.from({ length: wave.length + 1 }, (_, i) => (
                <line
                    key={`grid-${i}`}
                    x1={i * CELL_WIDTH}
                    y1={WAVE_TOP}
                    x2={i * CELL_WIDTH}
                    y2={WAVE_BOT}
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={1}
                />
            ))}
            {segments}

            {/* データラベルインライン編集入力 */}
            {editingDataStep !== null && (() => {
                const span = getDataSpan(editingDataStep);
                const ex = editingDataStep * CELL_WIDTH;
                const ew = CELL_WIDTH * span;
                return (
                    <foreignObject
                        x={ex + 2}
                        y={WAVE_TOP + 1}
                        width={ew - 4}
                        height={WAVE_BOT - WAVE_TOP - 2}
                    >
                        <input
                            ref={editInputRef}
                            className={styles.labelInput}
                            value={editingLabel}
                            autoFocus
                            onChange={(e) => setEditingLabel(e.target.value)}
                            onBlur={commitLabelEdit}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); commitLabelEdit(); }
                                if (e.key === 'Escape') { e.preventDefault(); cancelLabelEdit(); }
                            }}
                        />
                    </foreignObject>
                );
            })()}

            {/* 選択範囲オーバーレイ（列ハイライト） */}
            {stepSelection && (
                <rect
                    x={stepSelection.from * CELL_WIDTH}
                    y={0}
                    width={(stepSelection.to - stepSelection.from + 1) * CELL_WIDTH}
                    height={ROW_HEIGHT}
                    fill="rgba(74,157,240,0.15)"
                    stroke="none"
                    style={{ pointerEvents: 'none' }}
                />
            )}

            {/* 挿入カーソル縦線 */}
            {insertCursor !== null && (
                <line
                    x1={insertCursor * CELL_WIDTH}
                    y1={0}
                    x2={insertCursor * CELL_WIDTH}
                    y2={ROW_HEIGHT}
                    stroke="#00d8ff"
                    strokeWidth={2}
                    style={{ pointerEvents: 'none' }}
                />
            )}
        </svg>
    );
};

function getStrokeColor(ch: string): string {
    if (ch === 'x') return '#e05555';
    if (ch === 'z') return '#55aaee';
    if (ch === '0' || ch === '1') return '#88cc88';
    if (ch === 'p' || ch === 'n') return '#88cc88';
    if (ch === '=' || (ch >= '2' && ch <= '9')) return DATA_COLORS[ch] ?? '#4a9df0';
    return '#aaaaaa';
}

export default WaveRow;
