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
    const moveItem = useWaveformStore((s) => s.moveItem);

    const addGroup = useWaveformStore((s) => s.addGroup);

    // 選択ツール state
    const insertCursor = useWaveformStore((s) => s.insertCursor);
    const stepSelection = useWaveformStore((s) => s.stepSelection);
    const setInsertCursor = useWaveformStore((s) => s.setInsertCursor);
    const setStepSelection = useWaveformStore((s) => s.setStepSelection);

    const isSelectMode = selectedTool === 'select';

    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editingName, setEditingName] = useState('');
    const [editingGroupIndex, setEditingGroupIndex] = useState<number | null>(null);
    const [editingGroupName, setEditingGroupName] = useState('');
    const [dragOver, setDragOver] = useState<string | null>(null);
    const dragPathRef = useRef<number[] | null>(null);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

    const toggleGroupCollapse = useCallback((pathStr: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(pathStr)) {
                next.delete(pathStr);
            } else {
                next.add(pathStr);
            }
            return next;
        });
    }, []);

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
            // 日本語入力中のEnterキーは無視する
            if (e.nativeEvent.isComposing) return;

            if (e.key === 'Enter') handleLabelBlur();
            if (e.key === 'Escape') setEditingIndex(null);
        },
        [handleLabelBlur]
    );

    // ─── 信号ドラッグ並べ替え ────────────────────────────────────────
    const handleDragStart = useCallback((path: number[]) => { dragPathRef.current = path; }, []);
    const handleDragOver = useCallback((e: React.DragEvent, path: number[]) => {
        e.preventDefault();
        if (path.length === 1 && path[0] === -1) {
            setDragOver('root');
        } else {
            setDragOver(path.join(','));
        }
    }, []);
    const handleDrop = useCallback(
        (toPath: number[]) => {
            if (dragPathRef.current !== null && dragPathRef.current.join(',') !== toPath.join(',')) {
                moveItem(dragPathRef.current, toPath);
            }
            dragPathRef.current = null; setDragOver(null);
        },
        [moveItem]
    );

    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        path: number[];
        type: 'signal' | 'group';
        name: string;
        flatIndex?: number;
        groupIndex?: number;
    } | null>(null);

    const handleContextMenu = useCallback(
        (e: React.MouseEvent, path: number[], type: 'signal' | 'group', name: string, flatIndex?: number, groupIndex?: number) => {
            e.preventDefault();
            e.stopPropagation();
            // 編集中の場合はコンテキストメニューを出さない
            if (type === 'group' && editingGroupIndex === groupIndex) return;
            if (type === 'signal' && editingIndex === flatIndex) return;

            setContextMenu({
                x: e.clientX,
                y: e.clientY,
                path,
                type,
                name,
                flatIndex,
                groupIndex
            });
        },
        [editingGroupIndex, editingIndex]
    );

    React.useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const handleGroupDoubleClick = useCallback(
        (groupIndex: number, groupName: string) => {
            setEditingGroupIndex(groupIndex);
            setEditingGroupName(groupName);
        },
        []
    );

    const handleGroupLabelBlur = useCallback(() => {
        if (editingGroupIndex !== null) {
            const renameGroup = useWaveformStore.getState().renameGroup;
            if (renameGroup && editingGroupName.trim() !== '') {
                renameGroup(editingGroupIndex, editingGroupName.trim());
            }
            setEditingGroupIndex(null);
        }
    }, [editingGroupIndex, editingGroupName]);

    const handleGroupLabelKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            // 日本語入力中のEnterキーは無視する
            if (e.nativeEvent.isComposing) return;

            if (e.key === 'Enter') {
                handleGroupLabelBlur();
            } else if (e.key === 'Escape') {
                setEditingGroupIndex(null);
            }
        },
        [handleGroupLabelBlur]
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

    const { totalRowsHeight, getSignalIndexFromY } = React.useMemo(() => {
        let currentY = 0;
        const rowMap: { y: number; height: number; signalIndex: number | null }[] = [];
        let flatIndex = 0;

        const traverse = (items: import('../../types/wavedrom').WaveSignalOrGroup[], path: number[]) => {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const currentPath = [...path, i];
                const pathStr = currentPath.join(',');

                if (Array.isArray(item)) {
                    rowMap.push({ y: currentY, height: 24, signalIndex: null });
                    currentY += 24;
                    if (!collapsedGroups.has(pathStr)) {
                        const [, ...children] = item;
                        traverse(children, currentPath);
                    }
                } else if (item && typeof (item as import('../../types/wavedrom').WaveSignal).wave === 'string') {
                    rowMap.push({ y: currentY, height: ROW_HEIGHT, signalIndex: flatIndex });
                    currentY += ROW_HEIGHT;
                    flatIndex++;
                }
            }
        };
        traverse(waveformData.signal, []);

        const getIndex = (relY: number) => {
            let lastValidIndex = 0;
            for (const row of rowMap) {
                if (row.signalIndex !== null) {
                    lastValidIndex = row.signalIndex;
                }
                if (relY >= row.y && relY < row.y + row.height) {
                    return row.signalIndex !== null ? row.signalIndex : lastValidIndex;
                }
            }
            return lastValidIndex;
        };

        return { totalRowsHeight: currentY, getSignalIndexFromY: getIndex };
    }, [waveformData.signal, collapsedGroups]);

    const handleWaveOverlayMouseDown = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (e.button !== 0) return;
            e.preventDefault();
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const relX = e.clientX - rect.left;
            const relY = e.clientY - rect.top;

            // クリックした行（信号インデックス）を計算
            const signalIndex = getSignalIndexFromY(relY);
            setSelectedSignalIndex(signalIndex);

            if (isNearBoundary(relX)) {
                // 境界クリック → カーソル移動
                setInsertCursor(nearestBoundary(relX, maxLen));
                selectDragStartCycle.current = null;
                isSelectDragging.current = false;
            } else {
                // サイクル内部クリック → 選択開始
                isSelectDragging.current = true;
                const cycle = Math.max(0, Math.min(Math.floor(relX / CELL_WIDTH), maxLen - 1));
                selectDragStartCycle.current = cycle;
                setStepSelection({ from: cycle, to: cycle, signalIndex });
            }
        },
        [maxLen, setInsertCursor, setSelectedSignalIndex, setStepSelection, getSignalIndexFromY]
    );

    const handleWaveOverlayMouseMove = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const relX = e.clientX - rect.left;
            const relY = e.clientY - rect.top;

            // ホバー境界プレビュー（境界付近のみ）
            setHoverBoundary(isNearBoundary(relX) ? nearestBoundary(relX, maxLen) : null);

            if (!isSelectDragging.current || selectDragStartCycle.current === null) return;

            const cycle = Math.max(0, Math.min(Math.floor(relX / CELL_WIDTH), maxLen - 1));
            const signalIndex = getSignalIndexFromY(relY);

            // ドラッグで範囲選択（単一信号選択）
            const from = Math.min(selectDragStartCycle.current, cycle);
            const to = Math.max(selectDragStartCycle.current, cycle);
            setStepSelection({ from, to, signalIndex });
        },
        [maxLen, setStepSelection, getSignalIndexFromY]
    );

    const handleWaveOverlayMouseUp = useCallback(() => {
        isSelectDragging.current = false;
        selectDragStartCycle.current = null;
    }, []);

    const handleWaveOverlayMouseLeave = useCallback(() => {
        isSelectDragging.current = false;
        selectDragStartCycle.current = null;
        setHoverBoundary(null);
    }, []);

    const totalWaveWidth = maxLen * CELL_WIDTH;

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
                {(() => {
                    let flatIndex = 0;
                    let groupIndex = 0;
                    const renderSignalOrGroup = (item: import('../../types/wavedrom').WaveSignalOrGroup, path: number[], depth: number = 0): React.ReactNode => {
                        if (Array.isArray(item)) {
                            const [groupName, ...children] = item;
                            const currentGroupIndex = groupIndex++;
                            const pathStr = path.join(',');
                            return (
                                <div key={`group-${currentGroupIndex}`} className={styles.groupContainer}>
                                    <div
                                        className={`${styles.groupHeader} ${dragOver === pathStr ? styles.groupHeaderDragOver : ''}`}
                                        style={{ paddingLeft: `${depth * 12 + 8}px` }}
                                        draggable
                                        onDragStart={(e) => {
                                            e.stopPropagation();
                                            handleDragStart(path);
                                        }}
                                        onDragOver={(e) => handleDragOver(e, path)}
                                        onDrop={(e) => {
                                            e.stopPropagation();
                                            // グループにドロップした場合は、そのグループの末尾に追加する
                                            handleDrop([...path, children.length + 1]);
                                        }}
                                        onDragLeave={() => setDragOver(null)}
                                        onDoubleClick={() => handleGroupDoubleClick(currentGroupIndex, groupName)}
                                        onContextMenu={(e) => handleContextMenu(e, path, 'group', groupName, undefined, currentGroupIndex)}
                                    >
                                        {/* ネストの深さに応じたインジケーター */}
                                        {Array.from({ length: depth }).map((_, i) => (
                                            <div
                                                key={`depth-${i}`}
                                                className={styles.labelDepthIndicator}
                                                style={{ left: `${i * 12 + 8}px` }}
                                            />
                                        ))}
                                        <span
                                            className={styles.groupIcon}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleGroupCollapse(pathStr);
                                            }}
                                        >
                                            {collapsedGroups.has(pathStr) ? '▶' : '▼'}
                                        </span>
                                        {editingGroupIndex === currentGroupIndex ? (
                                            <input
                                                className={styles.groupNameInput}
                                                value={editingGroupName}
                                                onChange={(e) => setEditingGroupName(e.target.value)}
                                                onBlur={handleGroupLabelBlur}
                                                onKeyDown={handleGroupLabelKeyDown}
                                                autoFocus
                                            />
                                        ) : (
                                            <span className={styles.groupName}>{groupName}</span>
                                        )}
                                    </div>
                                    {!collapsedGroups.has(pathStr) && (
                                        <div className={styles.groupChildren}>
                                            {children.map((child, i) => renderSignalOrGroup(child, [...path, i + 1], depth + 1))}
                                        </div>
                                    )}
                                </div>
                            );
                        } else if (item && typeof (item as import('../../types/wavedrom').WaveSignal).wave === 'string') {
                            const sig = item as import('../../types/wavedrom').WaveSignal;
                            const idx = flatIndex++;
                            const pathStr = path.join(',');
                            return (
                                <div
                                    key={`sig-${idx}`}
                                    className={`${styles.row} ${depth > 0 ? styles.rowInGroup : ''} ${selectedSignalIndex === idx ? styles.selected : ''} ${dragOver === pathStr ? styles.dragOver : ''}`}
                                    style={{ height: ROW_HEIGHT }}
                                    onClick={() => setSelectedSignalIndex(idx)}
                                    onDragOver={(e) => handleDragOver(e, path)}
                                    onDrop={(e) => {
                                        e.stopPropagation();
                                        handleDrop(path);
                                    }}
                                    onDragLeave={() => setDragOver(null)}
                                    onContextMenu={(e) => handleContextMenu(e, path, 'signal', sig.name, idx, undefined)}
                                >
                                    {/* 信号ラベル */}
                                    <div
                                        className={`${styles.label} ${depth > 0 ? styles.labelInGroup : ''}`}
                                        style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH, paddingLeft: `${depth * 12 + 8}px` }}
                                        draggable
                                        onDragStart={(e) => {
                                            e.stopPropagation();
                                            handleDragStart(path);
                                        }}
                                        onDoubleClick={() => handleLabelDoubleClick(idx, sig.name)}
                                    >
                                        {/* ネストの深さに応じたインジケーター */}
                                        {Array.from({ length: depth }).map((_, i) => (
                                            <div
                                                key={`depth-${i}`}
                                                className={styles.labelDepthIndicator}
                                                style={{ left: `${i * 12 + 8}px` }}
                                            />
                                        ))}
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
                                            hoverBoundary={hoverBoundary}
                                        />
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    };

                    return waveformData.signal.map((item, i) => renderSignalOrGroup(item, [i], 0));
                })()}

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
                        onMouseLeave={handleWaveOverlayMouseLeave}
                    />
                )}

                {/* 信号追加ボタン */}
                <div
                    className={`${styles.addRow} ${dragOver === 'root' ? styles.dragOver : ''}`}
                    onDragOver={(e) => handleDragOver(e, [-1])} // -1 はルートを示すダミー
                    onDrop={(e) => {
                        e.stopPropagation();
                        handleDrop([waveformData.signal.length]);
                    }}
                    onDragLeave={() => setDragOver(null)}
                >
                    <button className={styles.addButton} onClick={() => addSignal()}>
                        + 信号を追加
                    </button>
                    <button className={styles.addButton} onClick={() => {
                        addGroup('New Group');
                        // 新しく追加されたグループを編集状態にする
                        // groupIndexは現在のグループ数になる
                        let groupCount = 0;
                        const countGroups = (items: import('../../types/wavedrom').WaveSignalOrGroup[]) => {
                            items.forEach(item => {
                                if (Array.isArray(item)) {
                                    groupCount++;
                                    countGroups(item.slice(1) as import('../../types/wavedrom').WaveSignalOrGroup[]);
                                }
                            });
                        };
                        countGroups(waveformData.signal);
                        // setTimeoutを使って、レンダリング後にフォーカスが当たるようにする
                        setTimeout(() => {
                            setEditingGroupIndex(groupCount);
                            setEditingGroupName('New Group');
                        }, 0);
                    }} style={{ marginLeft: '8px' }}>
                        + グループを追加
                    </button>
                </div>
            </div>

            {/* コンテキストメニュー */}
            {contextMenu && (
                <div
                    style={{
                        position: 'fixed',
                        top: contextMenu.y,
                        left: contextMenu.x,
                        background: '#2a2a4a',
                        border: '1px solid #4a9df0',
                        borderRadius: '4px',
                        padding: '4px 0',
                        zIndex: 1000,
                        boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                        minWidth: '120px'
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <div
                        className={styles.contextMenuItem}
                        onClick={() => {
                            useWaveformStore.getState().duplicateItem(contextMenu.path);
                            setContextMenu(null);
                        }}
                    >
                        複製 (Duplicate)
                    </div>
                    <div
                        className={styles.contextMenuItem}
                        onClick={() => {
                            useWaveformStore.getState().copyItem(contextMenu.path);
                            setContextMenu(null);
                        }}
                    >
                        コピー (Copy)
                    </div>
                    <div
                        className={`${styles.contextMenuItem} ${!useWaveformStore.getState().itemClipboard ? styles.contextMenuItemDisabled : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (useWaveformStore.getState().itemClipboard) {
                                useWaveformStore.getState().pasteItem(contextMenu.path);
                            }
                            setContextMenu(null);
                        }}
                    >
                        ペースト (Paste)
                    </div>
                    <div style={{ height: '1px', background: '#4a9df0', margin: '4px 0', opacity: 0.3 }} />
                    <div
                        className={styles.contextMenuItem}
                        style={{ color: '#ff6b6b' }}
                        onClick={() => {
                            if (window.confirm(`${contextMenu.type === 'group' ? 'グループ' : '信号'} "${contextMenu.name}" を削除しますか？`)) {
                                if (contextMenu.type === 'group' && contextMenu.groupIndex !== undefined) {
                                    const removeGroup = useWaveformStore.getState().removeGroup;
                                    if (removeGroup) removeGroup(contextMenu.groupIndex);
                                } else if (contextMenu.type === 'signal' && contextMenu.flatIndex !== undefined) {
                                    removeSignal(contextMenu.flatIndex);
                                }
                            }
                            setContextMenu(null);
                        }}
                    >
                        削除 (Delete)
                    </div>
                </div>
            )}
        </div>
    );
};

export default WaveformCanvas;
