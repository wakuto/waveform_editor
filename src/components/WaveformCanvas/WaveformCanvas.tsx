import React, { useState, useCallback, useRef } from 'react';
import { useWaveformStore } from '../../store/useWaveformStore';
import { getSignalList, CELL_WIDTH, ROW_HEIGHT, LABEL_WIDTH } from '../../utils/waveformUtils';
import WaveRow from './WaveRow';
import styles from './WaveformCanvas.module.css';

/** ヘッダーのサイクル境界検知ゾーン (px) */
const BOUNDARY_SNAP_PX = 8;

/** マウスX座標から最も近い境界インデックスを返す */
function nearestBoundary(relX: number, maxLen: number): number {
    return Math.max(0, Math.min(Math.round(relX / CELL_WIDTH), maxLen));
}

/** マウスX座標がサイクル境界のスナップ圏内かを判定 */
function isNearBoundary(relX: number): boolean {
    const offset = relX % CELL_WIDTH;
    return offset <= BOUNDARY_SNAP_PX || offset >= CELL_WIDTH - BOUNDARY_SNAP_PX;
}

const WaveformCanvas: React.FC = () => {
    const waveformData = useWaveformStore((s) => s.waveformData);
    const hoverInfo = useWaveformStore((s) => s.hoverInfo);
    const selectedTool = useWaveformStore((s) => s.selectedTool);
    const selectedSignalIndex = useWaveformStore((s) => s.selectedSignalIndex);
    const setSelectedSignalIndex = useWaveformStore((s) => s.setSelectedSignalIndex);
    const addSignal = useWaveformStore((s) => s.addSignal);
    const removeSignal = useWaveformStore((s) => s.removeSignal);
    const renameSignal = useWaveformStore((s) => s.renameSignal);
    const moveSignal = useWaveformStore((s) => s.moveSignal);

    // 選択ツール state
    const insertCursor = useWaveformStore((s) => s.insertCursor);
    const stepSelection = useWaveformStore((s) => s.stepSelection);
    const setInsertCursor = useWaveformStore((s) => s.setInsertCursor);
    const setStepSelection = useWaveformStore((s) => s.setStepSelection);

    const isSelectMode = selectedTool === 'select';

    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editingName, setEditingName] = useState('');
    const [dragOver, setDragOver] = useState<number | null>(null);
    const dragIndexRef = useRef<number | null>(null);

    // ヘッダーホバー境界インデックス（プレビュー表示用）
    const [hoverBoundary, setHoverBoundary] = useState<number | null>(null);

    // ヘッダードラッグ（サイクル選択）用
    const headerDragStartCycle = useRef<number | null>(null);

    // 波形エリアドラッグ（選択モード）用
    const selectDragStartCycle = useRef<number | null>(null);
    const isSelectDragging = useRef(false);

    const signals = getSignalList(waveformData.signal);
    const maxLen = signals.reduce((m, s) => Math.max(m, s.wave.length), 1);

    // ─── 信号名編集 ──────────────────────────────────────────────────
    const handleLabelDoubleClick = useCallback(
        (index: number, name: string) => { setEditingIndex(index); setEditingName(name); },
        []
    );

    const handleLabelBlur = useCallback(() => {
        if (editingIndex !== null) {
            renameSignal(editingIndex, editingName.trim() || 'signal');
            setEditingIndex(null);
        }
    }, [editingIndex, editingName, renameSignal]);

    const handleLabelKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') handleLabelBlur();
            if (e.key === 'Escape') setEditingIndex(null);
        },
        [handleLabelBlur]
    );

    // ─── 信号ドラッグ並べ替え ────────────────────────────────────────
    const handleDragStart = useCallback((index: number) => { dragIndexRef.current = index; }, []);
    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
        e.preventDefault(); setDragOver(index);
    }, []);
    const handleDrop = useCallback(
        (toIndex: number) => {
            if (dragIndexRef.current !== null && dragIndexRef.current !== toIndex) {
                moveSignal(dragIndexRef.current, toIndex);
            }
            dragIndexRef.current = null; setDragOver(null);
        },
        [moveSignal]
    );

    const handleContextMenu = useCallback(
        (e: React.MouseEvent, index: number) => {
            e.preventDefault();
            if (window.confirm(`信号 "${signals[index].name}" を削除しますか？`)) removeSignal(index);
        },
        [signals, removeSignal]
    );

    // ─── ヘッダーのマウス操作（選択モード） ──────────────────────────

    /** ヘッダー内のX座標（ラベル幅を除いた波形エリア相対値）を取得 */
    const getHeaderRelX = useCallback((e: React.MouseEvent<HTMLDivElement>): number => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        return e.clientX - rect.left;
    }, []);

    const handleHeaderMouseDown = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (e.button !== 0) return;
            const relX = getHeaderRelX(e);
            if (isNearBoundary(relX)) {
                // 境界クリック → カーソル移動
                setInsertCursor(nearestBoundary(relX, maxLen));
                headerDragStartCycle.current = null;
            } else {
                // サイクル内部クリック → 選択開始
                const cycle = Math.max(0, Math.min(Math.floor(relX / CELL_WIDTH), maxLen - 1));
                headerDragStartCycle.current = cycle;
                setStepSelection({ from: cycle, to: cycle });
            }
        },
        [getHeaderRelX, maxLen, setInsertCursor, setStepSelection]
    );

    const handleHeaderMouseMove = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const relX = getHeaderRelX(e);
            // ホバー境界プレビュー（境界付近のみ）
            setHoverBoundary(isNearBoundary(relX) ? nearestBoundary(relX, maxLen) : null);

            // ドラッグ中なら選択範囲を更新
            if (headerDragStartCycle.current !== null) {
                const cycle = Math.max(0, Math.min(Math.floor(relX / CELL_WIDTH), maxLen - 1));
                const from = Math.min(headerDragStartCycle.current, cycle);
                const to = Math.max(headerDragStartCycle.current, cycle);
                setStepSelection({ from, to });
            }
        },
        [getHeaderRelX, maxLen, setStepSelection]
    );

    const handleHeaderMouseUp = useCallback(() => {
        headerDragStartCycle.current = null;
    }, []);

    const handleHeaderMouseLeave = useCallback(() => {
        headerDragStartCycle.current = null;
        setHoverBoundary(null);
    }, []);

    // ─── 波形エリアオーバーレイの操作（選択モードのみ） ───────────────

    const handleWaveOverlayMouseDown = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (e.button !== 0) return;
            e.preventDefault();
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const relX = e.clientX - rect.left;
            isSelectDragging.current = true;
            // クリック → 最近傍境界にカーソル移動（drag開始）
            setInsertCursor(nearestBoundary(relX, maxLen));
            selectDragStartCycle.current = Math.max(0, Math.min(Math.floor(relX / CELL_WIDTH), maxLen - 1));
        },
        [maxLen, setInsertCursor]
    );

    const handleWaveOverlayMouseMove = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (!isSelectDragging.current || selectDragStartCycle.current === null) return;
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const relX = e.clientX - rect.left;
            const cycle = Math.max(0, Math.min(Math.floor(relX / CELL_WIDTH), maxLen - 1));
            if (cycle !== selectDragStartCycle.current) {
                // ドラッグで範囲選択
                const from = Math.min(selectDragStartCycle.current, cycle);
                const to = Math.max(selectDragStartCycle.current, cycle);
                setStepSelection({ from, to });
            }
        },
        [maxLen, setStepSelection]
    );

    const handleWaveOverlayMouseUp = useCallback(() => {
        isSelectDragging.current = false;
        selectDragStartCycle.current = null;
    }, []);

    const totalWaveWidth = maxLen * CELL_WIDTH;
    const totalRowsHeight = signals.length * ROW_HEIGHT;

    return (
        <div className={styles.canvas}>
            {/* タイムステップヘッダー */}
            <div className={styles.header}>
                <div className={styles.labelPlaceholder} />
                {/* stepsHeader: 選択モード時はインタラクティブ */}
                <div
                    className={`${styles.stepsHeader} ${isSelectMode ? styles.stepsHeaderSelect : ''}`}
                    style={{ position: 'relative' }}
                    onMouseDown={isSelectMode ? handleHeaderMouseDown : undefined}
                    onMouseMove={isSelectMode ? handleHeaderMouseMove : undefined}
                    onMouseUp={isSelectMode ? handleHeaderMouseUp : undefined}
                    onMouseLeave={isSelectMode ? handleHeaderMouseLeave : undefined}
                >
                    {/* ステップ番号セル */}
                    {Array.from({ length: maxLen }, (_, i) => {
                        const isSelected = stepSelection !== null && i >= stepSelection.from && i <= stepSelection.to;
                        return (
                            <div
                                key={i}
                                className={`${styles.stepNumber} ${isSelected ? styles.stepNumberSelected : ''}`}
                                style={{ width: CELL_WIDTH, minWidth: CELL_WIDTH }}
                            >
                                {i}
                            </div>
                        );
                    })}

                    {/* 選択範囲ハイライト（ヘッダー上） */}
                    {stepSelection && (
                        <div
                            className={styles.selectionOverlayHeader}
                            style={{
                                left: stepSelection.from * CELL_WIDTH,
                                width: (stepSelection.to - stepSelection.from + 1) * CELL_WIDTH,
                            }}
                        />
                    )}

                    {/* 挿入カーソルマーカー（ヘッダー上） */}
                    {insertCursor !== null && (
                        <div
                            className={styles.cursorMarkerHeader}
                            style={{ left: insertCursor * CELL_WIDTH - 1 }}
                        />
                    )}

                    {/* ホバー境界プレビュー */}
                    {hoverBoundary !== null && hoverBoundary !== insertCursor && (
                        <div
                            className={styles.cursorPreviewHeader}
                            style={{ left: hoverBoundary * CELL_WIDTH - 1 }}
                        />
                    )}
                </div>
            </div>

            {/* 信号行 + オーバーレイ */}
            <div className={styles.rows} style={{ position: 'relative' }}>
                {signals.map((sig, idx) => (
                    <div
                        key={idx}
                        className={`${styles.row} ${selectedSignalIndex === idx ? styles.selected : ''} ${dragOver === idx ? styles.dragOver : ''}`}
                        style={{ height: ROW_HEIGHT }}
                        onClick={() => setSelectedSignalIndex(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDrop={() => handleDrop(idx)}
                        onDragLeave={() => setDragOver(null)}
                        onContextMenu={(e) => handleContextMenu(e, idx)}
                    >
                        {/* 信号ラベル */}
                        <div
                            className={styles.label}
                            style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                            draggable
                            onDragStart={() => handleDragStart(idx)}
                            onDoubleClick={() => handleLabelDoubleClick(idx, sig.name)}
                        >
                            {editingIndex === idx ? (
                                <input
                                    className={styles.labelInput}
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    onBlur={handleLabelBlur}
                                    onKeyDown={handleLabelKeyDown}
                                    autoFocus
                                />
                            ) : (
                                <span className={styles.labelText}>{sig.name}</span>
                            )}
                        </div>

                        {/* 波形（挿入カーソル・選択オーバーレイも内部で描画） */}
                        <div className={styles.waveArea}>
                            <WaveRow
                                signal={sig}
                                signalIndex={idx}
                                hoverStep={hoverInfo?.signalIndex === idx ? hoverInfo.stepIndex : null}
                                insertCursor={insertCursor}
                                stepSelection={stepSelection}
                                isSelectMode={isSelectMode}
                            />
                        </div>
                    </div>
                ))}

                {/* 選択モード用透明オーバーレイ（波形エリア全体をカバー） */}
                {isSelectMode && (
                    <div
                        className={styles.selectOverlay}
                        style={{
                            left: LABEL_WIDTH,
                            width: totalWaveWidth,
                            height: totalRowsHeight,
                        }}
                        onMouseDown={handleWaveOverlayMouseDown}
                        onMouseMove={handleWaveOverlayMouseMove}
                        onMouseUp={handleWaveOverlayMouseUp}
                        onMouseLeave={handleWaveOverlayMouseUp}
                    />
                )}

                {/* 信号追加ボタン */}
                <div className={styles.addRow}>
                    <button className={styles.addButton} onClick={() => addSignal()}>
                        + 信号を追加
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WaveformCanvas;
