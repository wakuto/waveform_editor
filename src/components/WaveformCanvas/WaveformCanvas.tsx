import React, { useState, useCallback, useRef } from 'react';
import { useWaveformStore } from '../../store/useWaveformStore';
import { getSignalList, CELL_WIDTH, ROW_HEIGHT, LABEL_WIDTH } from '../../utils/waveformUtils';
import WaveRow from './WaveRow';
import styles from './WaveformCanvas.module.css';

const WaveformCanvas: React.FC = () => {
    const waveformData = useWaveformStore((s) => s.waveformData);
    const hoverInfo = useWaveformStore((s) => s.hoverInfo);
    const selectedSignalIndex = useWaveformStore((s) => s.selectedSignalIndex);
    const setSelectedSignalIndex = useWaveformStore((s) => s.setSelectedSignalIndex);
    const addSignal = useWaveformStore((s) => s.addSignal);
    const removeSignal = useWaveformStore((s) => s.removeSignal);
    const renameSignal = useWaveformStore((s) => s.renameSignal);
    const moveSignal = useWaveformStore((s) => s.moveSignal);

    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editingName, setEditingName] = useState('');
    const [dragOver, setDragOver] = useState<number | null>(null);
    const dragIndexRef = useRef<number | null>(null);

    const signals = getSignalList(waveformData.signal);
    const maxLen = signals.reduce((m, s) => Math.max(m, s.wave.length), 1);

    // 信号名のダブルクリックで編集開始
    const handleLabelDoubleClick = useCallback(
        (index: number, name: string) => {
            setEditingIndex(index);
            setEditingName(name);
        },
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

    // ドラッグ並べ替え
    const handleDragStart = useCallback((index: number) => {
        dragIndexRef.current = index;
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
        e.preventDefault();
        setDragOver(index);
    }, []);

    const handleDrop = useCallback(
        (toIndex: number) => {
            if (dragIndexRef.current !== null && dragIndexRef.current !== toIndex) {
                moveSignal(dragIndexRef.current, toIndex);
            }
            dragIndexRef.current = null;
            setDragOver(null);
        },
        [moveSignal]
    );

    // 右クリックコンテキストメニュー
    const handleContextMenu = useCallback(
        (e: React.MouseEvent, index: number) => {
            e.preventDefault();
            const choice = window.confirm(`信号 "${signals[index].name}" を削除しますか？`);
            if (choice) removeSignal(index);
        },
        [signals, removeSignal]
    );

    return (
        <div className={styles.canvas}>
            {/* タイムステップヘッダー */}
            <div className={styles.header}>
                <div className={styles.labelPlaceholder} />
                <div className={styles.stepsHeader}>
                    {Array.from({ length: maxLen }, (_, i) => (
                        <div
                            key={i}
                            className={styles.stepNumber}
                            style={{ width: CELL_WIDTH, minWidth: CELL_WIDTH }}
                        >
                            {i}
                        </div>
                    ))}
                </div>
            </div>

            {/* 信号行 */}
            <div className={styles.rows}>
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
                        {/* 信号ラベル（ここだけドラッグ可） */}
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

                        {/* 波形 */}
                        <div className={styles.waveArea}>
                            <WaveRow
                                signal={sig}
                                signalIndex={idx}
                                hoverStep={hoverInfo?.signalIndex === idx ? hoverInfo.stepIndex : null}
                            />
                        </div>
                    </div>
                ))}

                {/* 信号追加ボタン */}
                <div className={styles.addRow}>
                    <button
                        className={styles.addButton}
                        onClick={() => addSignal()}
                    >
                        + 信号を追加
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WaveformCanvas;
