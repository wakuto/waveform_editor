import React, { useState, useCallback, useRef } from 'react';
import { useWaveformStore } from '../../store/useWaveformStore';
import type { WaveTool } from '../../types/wavedrom';
import { getSignalList, BASE_CELL_WIDTH, ROW_HEIGHT, LABEL_WIDTH } from '../../utils/waveformUtils';
import WaveRow from './WaveRow';
import EdgeOverlay from './EdgeOverlay';
import styles from './WaveformCanvas.module.css';

const TOOLS: { key: WaveTool; label: string; title: string }[] = [
    { key: '0', label: '0', title: 'Low' },
    { key: '1', label: '1', title: 'High' },
    { key: 'p', label: 'p', title: 'Posedge Clock' },
    { key: 'n', label: 'n', title: 'Negedge Clock' },
    { key: 'z', label: 'z', title: 'High-Z' },
    { key: 'x', label: 'x', title: 'Undefined' },
    { key: '=', label: '=', title: 'Data' },
    { key: '2', label: '2', title: 'Data (Orange)' },
    { key: '3', label: '3', title: 'Data (Green)' },
    { key: '4', label: '4', title: 'Data (Red)' },
    { key: '.', label: '.', title: 'Continue' },
    { key: '|', label: '|', title: 'Gap' },
    { key: 'select', label: 'Select', title: 'Select Tool' },
    { key: 'edge', label: 'Edge', title: 'Edge Tool' },
];

/** ヘッダーのサイクル境界検知ゾーン (px) */
const BOUNDARY_SNAP_PX = 8;

/** マウスX座標から最も近い境界インデックスを返す */
function nearestBoundary(relX: number, maxLen: number, cellWidth: number): number {
    return Math.max(0, Math.min(Math.round(relX / cellWidth), maxLen));
}

/** マウスX座標がサイクル境界のスナップ圏内かを判定 */
function isNearBoundary(relX: number, cellWidth: number): boolean {
    const offset = relX % cellWidth;
    return offset <= BOUNDARY_SNAP_PX || offset >= cellWidth - BOUNDARY_SNAP_PX;
}

const WaveformCanvas: React.FC = () => {
    const waveformData = useWaveformStore((s) => s.waveformData);
    const zoom = useWaveformStore((s) => s.zoom);
    const CELL_WIDTH = BASE_CELL_WIDTH * zoom;
    const hoverInfo = useWaveformStore((s) => s.hoverInfo);
    const selectedTool = useWaveformStore((s) => s.selectedTool);
    const setSelectedTool = useWaveformStore((s) => s.setSelectedTool);
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
    const handleDragOver = useCallback((e: React.DragEvent, path: number[], type: 'group' | 'signal') => {
        e.preventDefault();
        if (path.length === 1 && path[0] === -1) {
            setDragOver('root');
            return;
        }

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const y = e.clientY - rect.top;
        const height = rect.height;

        if (type === 'group') {
            if (y < height * 0.3) {
                setDragOver(`${path.join(',')}-before`);
            } else if (y > height * 0.7) {
                setDragOver(`${path.join(',')}-after`);
            } else {
                setDragOver(`${path.join(',')}-inside`);
            }
        } else {
            if (y < height / 2) {
                setDragOver(`${path.join(',')}-before`);
            } else {
                setDragOver(`${path.join(',')}-after`);
            }
        }
    }, []);
    const handleDrop = useCallback(
        (e: React.DragEvent, path: number[], type: 'group' | 'signal', childrenLength?: number) => {
            e.stopPropagation();
            if (dragPathRef.current === null) return;

            let toPath = [...path];
            const pathStr = path.join(',');

            if (dragOver === `${pathStr}-before`) {
                // そのまま (path)
            } else if (dragOver === `${pathStr}-after`) {
                // 次のインデックス
                toPath[toPath.length - 1]++;
            } else if (dragOver === `${pathStr}-inside` && type === 'group') {
                // グループの中の末尾 (インデックス0はグループ名なので、子要素は1から始まる)
                toPath = [...path, (childrenLength || 0) + 1];
            } else if (dragOver === 'root') {
                toPath = [-1]; // rootの末尾
            } else {
                // dragOverが一致しない場合は何もしない
                dragPathRef.current = null; setDragOver(null);
                return;
            }

            if (dragPathRef.current.join(',') !== toPath.join(',')) {
                moveItem(dragPathRef.current, toPath);
            }
            dragPathRef.current = null; setDragOver(null);
        },
        [moveItem, dragOver]
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
            if (isToolMenuOpenRef.current || wasToolMenuOpenRef.current) {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu(null);
                return;
            }
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

    const [toolMenu, setToolMenu] = useState<{ x: number; y: number } | null>(null);
    const [hoveredTool, setHoveredTool] = useState<import('../../types/wavedrom').WaveTool | null>(null);
    const isToolMenuOpenRef = useRef(false);
    const wasToolMenuOpenRef = useRef(false);

    // ツールメニューに表示するツールを絞り込む
    const RADIAL_TOOLS = React.useMemo(() => {
        const allowedKeys = ['0', '1', '=', 'x', '.', 'select', 'edge'];
        return TOOLS.filter(tool => allowedKeys.includes(tool.key));
    }, []);

    const handleGlobalMouseDown = useCallback((e: MouseEvent) => {
        if (e.button === 2) { // Right click
            // 波形領域内でのみツールメニューを表示する
            const target = e.target as Element;
            const isWaveArea = target.closest(`.${styles.waveArea}`) || target.closest(`.${styles.selectOverlay}`) || target.closest('svg[class*="edgeOverlay"]');
            const isEdge = target.closest('.edge-group');

            if (isWaveArea && !isEdge) {
                setToolMenu({ x: e.clientX, y: e.clientY });
                setHoveredTool(null);
                isToolMenuOpenRef.current = true;
                setContextMenu(null); // Close context menu if open
            }
        }
    }, []);

    const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
        if (isToolMenuOpenRef.current && toolMenu) {
            const dx = e.clientX - toolMenu.x;
            const dy = e.clientY - toolMenu.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 20) {
                setHoveredTool(null);
            } else {
                let angle = Math.atan2(dy, dx) * (180 / Math.PI);
                // SVGの描画が-90度（12時の方向）から始まっているため、判定用の角度も90度ずらす
                angle += 90;
                if (angle < 0) angle += 360;
                angle = angle % 360;

                const sliceAngle = 360 / RADIAL_TOOLS.length;
                const offsetAngle = (angle + sliceAngle / 2) % 360;
                const index = Math.floor(offsetAngle / sliceAngle);

                if (index >= 0 && index < RADIAL_TOOLS.length) {
                    setHoveredTool(RADIAL_TOOLS[index].key);
                }
            }
        }
    }, [toolMenu, RADIAL_TOOLS]);

    const handleGlobalMouseUp = useCallback((e: MouseEvent) => {
        if (e.button === 2) {
            if (isToolMenuOpenRef.current) {
                if (hoveredTool) {
                    setSelectedTool(hoveredTool);
                }

                wasToolMenuOpenRef.current = true;
                setTimeout(() => {
                    wasToolMenuOpenRef.current = false;
                }, 100);

                setTimeout(() => {
                    setToolMenu(null);
                    setHoveredTool(null);
                    isToolMenuOpenRef.current = false;
                }, 50);
            }
        }
    }, [hoveredTool, setSelectedTool]);

    React.useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        window.addEventListener('mousedown', handleGlobalMouseDown);
        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);

        const handleGlobalContextMenu = (e: MouseEvent) => {
            if (isToolMenuOpenRef.current || wasToolMenuOpenRef.current) {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu(null);
            }
        };
        window.addEventListener('contextmenu', handleGlobalContextMenu, { capture: true });

        return () => {
            window.removeEventListener('click', handleClick);
            window.removeEventListener('mousedown', handleGlobalMouseDown);
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
            window.removeEventListener('contextmenu', handleGlobalContextMenu, { capture: true });
        };
    }, [handleGlobalMouseDown, handleGlobalMouseMove, handleGlobalMouseUp]);

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
            if (isNearBoundary(relX, CELL_WIDTH)) {
                // 境界クリック → カーソル移動
                setInsertCursor(nearestBoundary(relX, maxLen, CELL_WIDTH));
                headerDragStartCycle.current = null;
            } else {
                // サイクル内部クリック → 選択開始
                const cycle = Math.max(0, Math.min(Math.floor(relX / CELL_WIDTH), maxLen - 1));
                headerDragStartCycle.current = cycle;
                setStepSelection({ from: cycle, to: cycle });
            }
        },
        [getHeaderRelX, maxLen, setInsertCursor, setStepSelection, CELL_WIDTH]
    );

    const handleHeaderMouseMove = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const relX = getHeaderRelX(e);
            // ホバー境界プレビュー（境界付近のみ）
            setHoverBoundary(isNearBoundary(relX, CELL_WIDTH) ? nearestBoundary(relX, maxLen, CELL_WIDTH) : null);

            // ドラッグ中なら選択範囲を更新
            if (headerDragStartCycle.current !== null) {
                const cycle = Math.max(0, Math.min(Math.floor(relX / CELL_WIDTH), maxLen - 1));
                const from = Math.min(headerDragStartCycle.current, cycle);
                const to = Math.max(headerDragStartCycle.current, cycle);
                setStepSelection({ from, to });
            }
        },
        [getHeaderRelX, maxLen, setStepSelection, CELL_WIDTH]
    );

    const handleHeaderMouseUp = useCallback(() => {
        headerDragStartCycle.current = null;
    }, []);

    const handleHeaderMouseLeave = useCallback(() => {
        headerDragStartCycle.current = null;
        setHoverBoundary(null);
    }, []);

    // ─── 波形エリアオーバーレイの操作（選択モードのみ） ───────────────

    const { totalRowsHeight, getSignalIndexFromY, getYFromSignalIndex } = React.useMemo(() => {
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
            for (const row of rowMap) {
                if (relY >= row.y && relY < row.y + row.height) {
                    return row.signalIndex;
                }
            }
            return null;
        };

        const getYFromIndex = (signalIndex: number) => {
            for (const row of rowMap) {
                if (row.signalIndex === signalIndex) {
                    return row.y + row.height / 2;
                }
            }
            return null;
        };

        return { totalRowsHeight: currentY, getSignalIndexFromY: getIndex, getYFromSignalIndex: getYFromIndex };
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
            if (signalIndex === null) return;

            setSelectedSignalIndex(signalIndex);

            if (isNearBoundary(relX, CELL_WIDTH)) {
                // 境界クリック → カーソル移動
                setInsertCursor(nearestBoundary(relX, maxLen, CELL_WIDTH));
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
        [maxLen, setInsertCursor, setSelectedSignalIndex, setStepSelection, getSignalIndexFromY, CELL_WIDTH]
    );

    const handleWaveOverlayMouseMove = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const relX = e.clientX - rect.left;
            const relY = e.clientY - rect.top;

            // ホバー境界プレビュー（境界付近のみ）
            setHoverBoundary(isNearBoundary(relX, CELL_WIDTH) ? nearestBoundary(relX, maxLen, CELL_WIDTH) : null);

            if (!isSelectDragging.current || selectDragStartCycle.current === null) return;

            const cycle = Math.max(0, Math.min(Math.floor(relX / CELL_WIDTH), maxLen - 1));
            const signalIndex = getSignalIndexFromY(relY);
            if (signalIndex === null) return;

            // ドラッグで範囲選択（単一信号選択）
            const from = Math.min(selectDragStartCycle.current, cycle);
            const to = Math.max(selectDragStartCycle.current, cycle);
            setStepSelection({ from, to, signalIndex });
        },
        [maxLen, setStepSelection, getSignalIndexFromY, CELL_WIDTH]
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

    const handleWaveOverlayDoubleClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const relX = e.clientX - rect.left;
            const relY = e.clientY - rect.top;

            const signalIndex = getSignalIndexFromY(relY);
            if (signalIndex === null) return;

            const stepIndex = Math.max(0, Math.min(Math.floor(relX / CELL_WIDTH), maxLen - 1));

            useWaveformStore.getState().openDataLabelEdit(signalIndex, stepIndex);
        },
        [maxLen, getSignalIndexFromY, CELL_WIDTH]
    );

    const canvasRef = useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                // ズーム処理
                const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
                const currentZoom = useWaveformStore.getState().zoom;
                const newZoom = Math.max(0.1, Math.min(currentZoom + zoomDelta, 5));

                if (newZoom !== currentZoom) {
                    // マウス位置を中心にズームするためのスクロール位置調整
                    const rect = canvas.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const scrollX = canvas.scrollLeft;

                    // ラベル領域の幅を考慮
                    const labelWidth = LABEL_WIDTH;
                    if (mouseX > labelWidth) {
                        const waveMouseX = mouseX - labelWidth + scrollX;
                        const zoomRatio = newZoom / currentZoom;
                        const newWaveMouseX = waveMouseX * zoomRatio;

                        useWaveformStore.getState().setZoom(newZoom);

                        // ズーム適用後にスクロール位置を更新
                        setTimeout(() => {
                            if (canvasRef.current) {
                                canvasRef.current.scrollLeft = newWaveMouseX - (mouseX - labelWidth);
                            }
                        }, 0);
                    } else {
                        useWaveformStore.getState().setZoom(newZoom);
                    }
                }
            } else if (e.shiftKey) {
                // 横スクロール処理
                e.preventDefault();
                canvas.scrollLeft += e.deltaX !== 0 ? e.deltaX : e.deltaY;
            }
        };

        canvas.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            canvas.removeEventListener('wheel', handleWheel);
        };
    }, []);

    const totalWaveWidth = maxLen * CELL_WIDTH;

    return (
        <div className={styles.canvas} ref={canvasRef}>
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
            <div className={`${styles.rows} ${dragOver === 'root' ? styles.dragOverRoot : ''}`} style={{ position: 'relative' }}>
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
                                        className={`${styles.groupHeader} ${dragOver === `${pathStr}-before` ? styles.dragOverBefore :
                                                dragOver === `${pathStr}-after` ? styles.dragOverAfter :
                                                    dragOver === `${pathStr}-inside` ? styles.dragOverInside : ''
                                            }`}
                                        style={{ paddingLeft: `${depth * 12 + 8}px` }}
                                        draggable
                                        onDragStart={(e) => {
                                            e.stopPropagation();
                                            handleDragStart(path);
                                        }}
                                        onDragOver={(e) => handleDragOver(e, path, 'group')}
                                        onDrop={(e) => handleDrop(e, path, 'group', children.length)}
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
                                            <span className={styles.groupName}>
                                                {groupName}
                                            </span>
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
                                    className={`${styles.row} ${depth > 0 ? styles.rowInGroup : ''} ${selectedSignalIndex === idx ? styles.selected : ''} ${dragOver === `${pathStr}-before` ? styles.dragOverBefore :
                                            dragOver === `${pathStr}-after` ? styles.dragOverAfter : ''
                                        }`}
                                    style={{ height: ROW_HEIGHT }}
                                    onClick={() => setSelectedSignalIndex(idx)}
                                    onDragOver={(e) => handleDragOver(e, path, 'signal')}
                                    onDrop={(e) => handleDrop(e, path, 'signal')}
                                    onDragLeave={() => setDragOver(null)}
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
                                        onContextMenu={(e) => handleContextMenu(e, path, 'signal', sig.name, idx, undefined)}
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
                                            <span className={styles.labelText}>
                                                {sig.name}
                                            </span>
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
                        onDoubleClick={handleWaveOverlayDoubleClick}
                    />
                )}

                {/* エッジ描画用オーバーレイ */}
                <div style={{ position: 'absolute', left: LABEL_WIDTH, top: 0, pointerEvents: 'none' }}>
                    <EdgeOverlay
                        totalWaveWidth={totalWaveWidth}
                        totalRowsHeight={totalRowsHeight}
                        getYFromSignalIndex={getYFromSignalIndex}
                        getSignalIndexFromY={getSignalIndexFromY}
                    />
                </div>

                {/* 信号追加ボタン */}
                <div
                    className={`${styles.addRow} ${dragOver === 'root' ? styles.dragOverRoot : ''}`}
                    onDragOver={(e) => handleDragOver(e, [-1], 'signal')} // -1 はルートを示すダミー
                    onDrop={(e) => handleDrop(e, [-1], 'signal')}
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
                            useWaveformStore.getState().insertSignal(contextMenu.path);
                            setContextMenu(null);
                        }}
                    >
                        信号を追加 (Add Signal)
                    </div>
                    <div
                        className={styles.contextMenuItem}
                        onClick={() => {
                            useWaveformStore.getState().insertGroup(contextMenu.path, 'New Group');
                            const newPath = [...contextMenu.path];
                            newPath[newPath.length - 1]++;

                            setTimeout(() => {
                                const signals = useWaveformStore.getState().waveformData.signal;
                                let groupIndex = 0;
                                let targetGroupIndex = -1;
                                const traverse = (items: import('../../types/wavedrom').WaveSignalOrGroup[], basePath: number[]) => {
                                    items.forEach((item, i) => {
                                        const currentPath = basePath.length === 0 ? [i] : [...basePath, i + 1];
                                        if (Array.isArray(item)) {
                                            if (currentPath.join(',') === newPath.join(',')) {
                                                targetGroupIndex = groupIndex;
                                            }
                                            groupIndex++;
                                            traverse(item.slice(1) as import('../../types/wavedrom').WaveSignalOrGroup[], currentPath);
                                        }
                                    });
                                };
                                traverse(signals, []);
                                if (targetGroupIndex !== -1) {
                                    setEditingGroupIndex(targetGroupIndex);
                                    setEditingGroupName('New Group');
                                }
                            }, 0);
                            setContextMenu(null);
                        }}
                    >
                        グループを追加 (Add Group)
                    </div>
                    <div style={{ height: '1px', background: '#4a9df0', margin: '4px 0', opacity: 0.3 }} />
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

            {/* ツールメニュー (右クリック) */}
            {toolMenu && (
                <div
                    style={{
                        position: 'fixed',
                        top: toolMenu.y,
                        left: toolMenu.x,
                        zIndex: 1001,
                    }}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                >
                    {/* 中心（何もしない領域） */}
                    <div
                        style={{
                            position: 'absolute',
                            top: -20,
                            left: -20,
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            background: 'transparent',
                            zIndex: 1002,
                        }}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                    />
                    {RADIAL_TOOLS.map((tool, index) => {
                        const sliceAngle = 360 / RADIAL_TOOLS.length;
                        const startAngle = index * sliceAngle - sliceAngle / 2;
                        const endAngle = startAngle + sliceAngle;

                        // SVGの扇形（円環の一部）を描画するためのパス計算
                        const innerRadius = 20;
                        const outerRadius = 80;

                        const startRad = (startAngle - 90) * (Math.PI / 180);
                        const endRad = (endAngle - 90) * (Math.PI / 180);

                        const x1 = Math.cos(startRad) * outerRadius;
                        const y1 = Math.sin(startRad) * outerRadius;
                        const x2 = Math.cos(endRad) * outerRadius;
                        const y2 = Math.sin(endRad) * outerRadius;

                        const x3 = Math.cos(endRad) * innerRadius;
                        const y3 = Math.sin(endRad) * innerRadius;
                        const x4 = Math.cos(startRad) * innerRadius;
                        const y4 = Math.sin(startRad) * innerRadius;

                        const largeArcFlag = sliceAngle > 180 ? 1 : 0;

                        const pathData = [
                            `M ${x1} ${y1}`,
                            `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                            `L ${x3} ${y3}`,
                            `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}`,
                            'Z'
                        ].join(' ');

                        // アイコンの配置位置（扇形の中心付近）
                        const midRad = (startAngle + sliceAngle / 2 - 90) * (Math.PI / 180);
                        const iconRadius = (innerRadius + outerRadius) / 2;
                        const iconX = Math.cos(midRad) * iconRadius;
                        const iconY = Math.sin(midRad) * iconRadius;

                        const isHovered = hoveredTool === tool.key;
                        const isSelected = selectedTool === tool.key;

                        return (
                            <div key={tool.key} style={{ position: 'absolute', top: 0, left: 0 }}>
                                <svg
                                    style={{
                                        position: 'absolute',
                                        top: -outerRadius,
                                        left: -outerRadius,
                                        width: outerRadius * 2,
                                        height: outerRadius * 2,
                                        overflow: 'visible',
                                        pointerEvents: 'none',
                                    }}
                                >
                                    <path
                                        d={pathData}
                                        fill={isHovered ? '#4a9df0' : (isSelected ? '#3a7dc0' : '#2a2a4a')}
                                        stroke="#1a1a2a"
                                        strokeWidth="2"
                                        style={{
                                            transform: `translate(${outerRadius}px, ${outerRadius}px)`,
                                            transition: 'fill 0.1s',
                                            opacity: 0.9
                                        }}
                                    />
                                </svg>
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: iconY - 12,
                                        left: iconX - 12,
                                        width: 24,
                                        height: 24,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: isHovered || isSelected ? '#ffffff' : '#a0a0b0',
                                        fontWeight: 'bold',
                                        fontSize: '14px',
                                        pointerEvents: 'none',
                                        zIndex: 1003,
                                    }}
                                >
                                    {tool.label}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default WaveformCanvas;
