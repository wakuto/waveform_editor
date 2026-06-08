import React, { useState, useCallback, useRef } from 'react';
import { useWaveformStore } from '../../store/useWaveformStore';
import { getSignalList, BASE_CELL_WIDTH } from '../../utils/waveformUtils';
import styles from './EdgeOverlay.module.css';

interface EdgeOverlayProps {
    totalWaveWidth: number;
    totalRowsHeight: number;
    getYFromSignalIndex: (index: number) => number | null;
    getSignalIndexFromY: (y: number) => number | null;
}

export interface ParsedEdge {
    startNode: string;
    endNode: string;
    type: string;
    text: string | undefined;
    hasStartArrow: boolean;
    hasEndArrow: boolean;
    shape: string;
}

export function parseEdge(edgeStr: string): ParsedEdge | null {
    const match = edgeStr.match(/^([a-zA-Z0-9])([~<>\-|]+|\+)([a-zA-Z0-9])(?:\s+(.*))?$/);
    if (!match) return null;
    const [, startNode, type, endNode, text] = match;
    const hasStartArrow = type.startsWith('<');
    const hasEndArrow = type.endsWith('>');
    let shape = type;
    if (hasStartArrow) shape = shape.slice(1);
    if (hasEndArrow) shape = shape.slice(0, -1);
    return { startNode, endNode, type, text, hasStartArrow, hasEndArrow, shape };
}

const EdgeOverlay: React.FC<EdgeOverlayProps> = ({ totalWaveWidth, totalRowsHeight, getYFromSignalIndex, getSignalIndexFromY }) => {
    const waveformData = useWaveformStore((s) => s.waveformData);
    const zoom = useWaveformStore((s) => s.zoom);
    const selectedTool = useWaveformStore((s) => s.selectedTool);
    const setWaveformData = useWaveformStore((s) => s.setWaveformData);
    
    const edgeShape = useWaveformStore((s) => s.edgeShape);
    const edgeStartArrow = useWaveformStore((s) => s.edgeStartArrow);
    const edgeEndArrow = useWaveformStore((s) => s.edgeEndArrow);
    const selectedEdgeIndex = useWaveformStore((s) => s.selectedEdgeIndex);
    const setSelectedEdgeIndex = useWaveformStore((s) => s.setSelectedEdgeIndex);
    const setEdgeShape = useWaveformStore((s) => s.setEdgeShape);
    const setEdgeStartArrow = useWaveformStore((s) => s.setEdgeStartArrow);
    const setEdgeEndArrow = useWaveformStore((s) => s.setEdgeEndArrow);
    const beginDragEdit = useWaveformStore((s) => s.beginDragEdit);
    const cancelDragEdit = useWaveformStore((s) => s.cancelDragEdit);
    const CELL_WIDTH = BASE_CELL_WIDTH * zoom;

    const isEdgeMode = selectedTool === 'edge';
    const signals = getSignalList(waveformData.signal);

    // 描画中のエッジ
    const [drawingEdge, setDrawingEdge] = useState<{ startNode: string; startX: number; startY: number; currentX: number; currentY: number } | null>(null);
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const [hoveredEdgeIndex, setHoveredEdgeIndex] = useState<number | null>(null);
    const [editingEdgeIndex, setEditingEdgeIndex] = useState<number | null>(null);
    const [editingEdgeText, setEditingEdgeText] = useState<string>('');
    const [editingNodeChar, setEditingNodeChar] = useState<string | null>(null);
    const [editingNodeText, setEditingNodeText] = useState<string>('');

    const svgRef = useRef<SVGSVGElement>(null);

    // ノードの座標を取得
    const getNodeCoords = useCallback((nodeName: string) => {
        for (let i = 0; i < signals.length; i++) {
            const sig = signals[i];
            if (sig.node) {
                const stepIndex = sig.node.indexOf(nodeName);
                if (stepIndex !== -1) {
                    const y = getYFromSignalIndex(i);
                    if (y === null) return null; // 折りたたまれている場合など
                    return {
                        x: stepIndex * CELL_WIDTH,
                        y,
                        signalIndex: i,
                        stepIndex
                    };
                }
            }
        }
        return null;
    }, [signals, CELL_WIDTH, getYFromSignalIndex]);

    // 利用可能なノード名（A-Z, a-z）を生成
    const getNextAvailableNodeName = useCallback(() => {
        const usedNodes = new Set<string>();
        signals.forEach(sig => {
            if (sig.node) {
                for (let i = 0; i < sig.node.length; i++) {
                    if (sig.node[i] !== '.') usedNodes.add(sig.node[i]);
                }
            }
        });
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        for (let i = 0; i < chars.length; i++) {
            if (!usedNodes.has(chars[i])) return chars[i];
        }
        return null;
    }, [signals]);

    // セル座標からノードを取得、なければ作成
    const getOrCreateNodeAt = useCallback((signalIndex: number, stepIndex: number) => {
        const sig = signals[signalIndex];
        if (!sig) return null;

        let nodeStr = sig.node || '';
        // 必要な長さまで '.' で埋める
        while (nodeStr.length <= stepIndex) {
            nodeStr += '.';
        }

        const existingNode = nodeStr[stepIndex];
        if (existingNode !== '.') {
            return existingNode;
        }

        // 新しいノード名を取得
        const newNodeName = getNextAvailableNodeName();
        if (!newNodeName) return null;

        // ノード文字列を更新
        const newNodeStr = nodeStr.substring(0, stepIndex) + newNodeName + nodeStr.substring(stepIndex + 1);

        // ストアを更新
        const newData = { ...waveformData };
        let currentFlatIndex = 0;
        const updateNode = (items: import('../../types/wavedrom').WaveSignalOrGroup[]): boolean => {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (Array.isArray(item)) {
                    if (updateNode(item.slice(1) as import('../../types/wavedrom').WaveSignalOrGroup[])) return true;
                } else if ('name' in item) {
                    if (currentFlatIndex === signalIndex) {
                        item.node = newNodeStr;
                        return true;
                    }
                    currentFlatIndex++;
                }
            }
            return false;
        };
        updateNode(newData.signal);
        setWaveformData(newData, false);

        return newNodeName;
    }, [signals, waveformData, setWaveformData, getNextAvailableNodeName]);

    // ノードが他のエッジで使われていないか確認し、使われていなければ削除する
    const removeNodeIfUnused = useCallback((nodeName: string) => {
        // 最新のストアの状態を取得
        const currentData = useWaveformStore.getState().waveformData;
        const newData = { ...currentData };
        let isUsed = false;

        if (newData.edge) {
            for (const edgeStr of newData.edge) {
                const match = parseEdge(edgeStr);
                if (match && (match.startNode === nodeName || match.endNode === nodeName)) {
                    isUsed = true;
                    break;
                }
            }
        }

        if (!isUsed) {
            const removeUnusedNodes = (items: import('../../types/wavedrom').WaveSignalOrGroup[]): void => {
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    if (Array.isArray(item)) {
                        removeUnusedNodes(item.slice(1) as import('../../types/wavedrom').WaveSignalOrGroup[]);
                    } else if ('name' in item && item.node) {
                        let newNodeStr = '';
                        for (let j = 0; j < item.node.length; j++) {
                            const char = item.node[j];
                            if (char === nodeName) {
                                newNodeStr += '.';
                            } else {
                                newNodeStr += char;
                            }
                        }
                        // 末尾の '.' を削除
                        newNodeStr = newNodeStr.replace(/\.+$/, '');
                        if (newNodeStr === '') {
                            delete item.node;
                        } else {
                            item.node = newNodeStr;
                        }
                    }
                }
            };
            removeUnusedNodes(newData.signal);
            useWaveformStore.getState().setWaveformData(newData, false);
        }
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!isEdgeMode) return;
        if (e.button !== 0) return; // 左クリックのみ
        if (!svgRef.current) return;

        // ドラッグ中のテキスト選択を防止
        e.preventDefault();

        // エッジのテキスト編集中は新しいエッジを描画しない
        if (editingEdgeIndex !== null) return;

        beginDragEdit();

        const rect = svgRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const stepIndex = Math.round(x / CELL_WIDTH);
        const signalIndex = getSignalIndexFromY(y);

        if (signalIndex !== null && signalIndex >= 0 && signalIndex < signals.length && stepIndex >= 0) {
            const nodeName = getOrCreateNodeAt(signalIndex, stepIndex);
            if (nodeName) {
                const coords = getNodeCoords(nodeName);
                if (coords) {
                    setDrawingEdge({
                        startNode: nodeName,
                        startX: coords.x,
                        startY: coords.y,
                        currentX: x,
                        currentY: y
                    });
                }
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isEdgeMode) return;
        if (!svgRef.current) return;

        const rect = svgRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (drawingEdge) {
            setDrawingEdge({
                ...drawingEdge,
                currentX: x,
                currentY: y
            });
        } else {
            // ホバー中のノードを検出
            const stepIndex = Math.round(x / CELL_WIDTH);
            const signalIndex = getSignalIndexFromY(y);
            if (signalIndex !== null && signalIndex >= 0 && signalIndex < signals.length && stepIndex >= 0) {
                const sig = signals[signalIndex];
                if (sig && sig.node && sig.node.length > stepIndex && sig.node[stepIndex] !== '.') {
                    setHoveredNode(sig.node[stepIndex]);
                } else {
                    setHoveredNode(null);
                }
            } else {
                setHoveredNode(null);
            }
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (!isEdgeMode || !drawingEdge) return;
        if (e.button !== 0) return; // 左クリックのみ
        if (!svgRef.current) return;

        const rect = svgRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const stepIndex = Math.round(x / CELL_WIDTH);
        const signalIndex = getSignalIndexFromY(y);

        if (signalIndex !== null && signalIndex >= 0 && signalIndex < signals.length && stepIndex >= 0) {
            const endNodeName = getOrCreateNodeAt(signalIndex, stepIndex);
            if (endNodeName && endNodeName !== drawingEdge.startNode) {
                // エッジを追加
                const edgeType = `${edgeStartArrow && edgeShape !== '+' ? '<' : ''}${edgeShape}${edgeEndArrow && edgeShape !== '+' ? '>' : ''}`;
                const newEdgeStr = `${drawingEdge.startNode}${edgeType}${endNodeName}`;
                const newData = { ...waveformData };
                newData.edge = [...(newData.edge || []), newEdgeStr];
                setWaveformData(newData, false);
            } else if (endNodeName === drawingEdge.startNode) {
                // 同じノードでクリックを離した場合（単なるクリック）、キャンセルする
                cancelDragEdit();
            }
        } else {
            // キャンバス外で離した場合もキャンセルする
            cancelDragEdit();
        }

        setDrawingEdge(null);
    };

    const handleMouseLeave = () => {
        setDrawingEdge(null);
        setHoveredNode(null);
    };

    const handleCanvasClick = () => {
        if (!isEdgeMode) return;
        // 背景クリックで選択解除
        if (selectedEdgeIndex !== null) {
            setSelectedEdgeIndex(null);
        }
    };

    const handleEdgeClick = (e: React.MouseEvent, index: number) => {
        if (!isEdgeMode) return;
        e.stopPropagation();

        const newData = { ...waveformData };
        if (newData.edge && newData.edge[index]) {
            const edgeStr = newData.edge[index];
            const parsed = parseEdge(edgeStr);
            if (parsed) {
                setSelectedEdgeIndex(index);
                setEdgeShape(parsed.shape as any);
                setEdgeStartArrow(parsed.hasStartArrow);
                setEdgeEndArrow(parsed.hasEndArrow);
            }
        }
    };

    const handleEdgeContextMenu = (e: React.MouseEvent, index: number) => {
        if (!isEdgeMode) return;
        e.preventDefault();
        e.stopPropagation();

        const newData = { ...waveformData };
        if (newData.edge && newData.edge[index]) {
            const edgeStr = newData.edge[index];
            const parsed = parseEdge(edgeStr);

            // エッジを削除
            newData.edge = newData.edge.filter((_, i) => i !== index);
            setWaveformData(newData);
            if (selectedEdgeIndex === index) {
                setSelectedEdgeIndex(null);
            }

            // 削除されたエッジのノードが他のエッジで使われているか確認し、使われていなければ削除
            if (parsed) {
                const { startNode, endNode } = parsed;
                // setWaveformDataが非同期なので、次のレンダリングサイクルで削除判定を行う
                setTimeout(() => {
                    removeNodeIfUnused(startNode);
                    removeNodeIfUnused(endNode);
                }, 0);
            }
        }
    };

    const handleEdgeDoubleClick = (e: React.MouseEvent, index: number, currentText: string) => {
        if (!isEdgeMode) return;
        e.stopPropagation();
        setEditingEdgeIndex(index);
        setEditingEdgeText(currentText);
    };

    const handleEdgeTextBlur = () => {
        if (editingEdgeIndex !== null) {
            const newData = { ...waveformData };
            if (newData.edge && newData.edge[editingEdgeIndex]) {
                const edgeStr = newData.edge[editingEdgeIndex];
                const parsed = parseEdge(edgeStr);
                if (parsed) {
                    const { startNode, type, endNode } = parsed;
                    const newText = editingEdgeText.trim();
                    newData.edge[editingEdgeIndex] = newText ? `${startNode}${type}${endNode} ${newText}` : `${startNode}${type}${endNode}`;
                    setWaveformData(newData);
                }
            }
            setEditingEdgeIndex(null);
        }
    };

    const handleEdgeTextKeyDown = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') handleEdgeTextBlur();
        if (e.key === 'Escape') setEditingEdgeIndex(null);
    };

    // エッジのパスを計算
    const getEdgePath = (startCoords: { x: number, y: number }, endCoords: { x: number, y: number }, shape: string) => {
        const dx = endCoords.x - startCoords.x;
        const dy = endCoords.y - startCoords.y;

        switch (shape) {
            case '~':
                return `M ${startCoords.x} ${startCoords.y} c ${0.7 * dx} 0, ${0.3 * dx} ${dy}, ${dx} ${dy}`;
            case '-~':
                return `M ${startCoords.x} ${startCoords.y} Q ${endCoords.x} ${startCoords.y}, ${endCoords.x} ${endCoords.y}`;
            case '~-':
                return `M ${startCoords.x} ${startCoords.y} Q ${startCoords.x} ${endCoords.y}, ${endCoords.x} ${endCoords.y}`;
            case '-':
                return `M ${startCoords.x} ${startCoords.y} l ${dx} ${dy}`;
            case '-|':
                return `M ${startCoords.x} ${startCoords.y} l ${dx} 0 l 0 ${dy}`;
            case '|-':
                return `M ${startCoords.x} ${startCoords.y} l 0 ${dy} l ${dx} 0`;
            case '-|-':
                return `M ${startCoords.x} ${startCoords.y} l ${dx / 2} 0 l 0 ${dy} l ${dx / 2} 0`;
            case '+':
                return `M ${startCoords.x} ${startCoords.y} L ${endCoords.x} ${endCoords.y} M ${startCoords.x} ${startCoords.y - 5} L ${startCoords.x} ${startCoords.y + 5} M ${endCoords.x} ${endCoords.y - 5} L ${endCoords.x} ${endCoords.y + 5}`;
            default:
                return `M ${startCoords.x} ${startCoords.y} L ${endCoords.x} ${endCoords.y}`;
        }
    };

    // 既存のエッジを描画
    const renderEdges = () => {
        if (!waveformData.edge) return null;

        return waveformData.edge.map((edgeStr, index) => {
            const parsed = parseEdge(edgeStr);
            if (!parsed) return null;

            const { startNode, endNode, text, hasStartArrow, hasEndArrow, shape } = parsed;
            const startCoords = getNodeCoords(startNode);
            const endCoords = getNodeCoords(endNode);

            if (!startCoords || !endCoords) return null;

            const path = getEdgePath(startCoords, endCoords, shape);
            const isHovered = hoveredEdgeIndex === index;
            const isSelected = selectedEdgeIndex === index;
            const isEditing = editingEdgeIndex === index;

            // 矢印のマーカーID
            let markerEnd = '';
            let markerStart = '';
            if (hasEndArrow) markerEnd = (isHovered || isSelected) && isEdgeMode ? 'url(#arrowhead-hover)' : 'url(#arrowhead)';
            if (hasStartArrow) markerStart = (isHovered || isSelected) && isEdgeMode ? 'url(#arrowhead-start-hover)' : 'url(#arrowhead-start)';

            // 中間点の計算 (テキストの配置用)
            let midX = (startCoords.x + endCoords.x) / 2;
            let midY = (startCoords.y + endCoords.y) / 2 - 5;
            if (shape === '-|') { midX = endCoords.x; midY = startCoords.y - 5; }
            else if (shape === '|-') { midX = startCoords.x; midY = endCoords.y - 5; }

            return (
                <g key={index}
                    className="edge-group"
                    onMouseEnter={() => isEdgeMode && setHoveredEdgeIndex(index)}
                    onMouseLeave={() => isEdgeMode && setHoveredEdgeIndex(null)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => handleEdgeClick(e, index)}
                    onContextMenu={(e) => handleEdgeContextMenu(e, index)}
                    onDoubleClick={(e) => handleEdgeDoubleClick(e, index, text || '')}
                    style={{ cursor: isEdgeMode ? 'pointer' : 'default' }}
                >
                    {/* 当たり判定用の太い透明パス */}
                    <path
                        d={path}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={15}
                    />
                    {/* 実際のエッジ */}
                    <path
                        d={path}
                        fill="none"
                        stroke={(isHovered || isSelected) && isEdgeMode ? "#ff4444" : "#4a9df0"}
                        strokeWidth={2}
                        markerEnd={markerEnd}
                        markerStart={markerStart}
                    />
                    {isEditing ? (
                        <foreignObject x={midX - 50} y={midY - 10} width={100} height={20}>
                            <input
                                type="text"
                                value={editingEdgeText}
                                onChange={(e) => setEditingEdgeText(e.target.value)}
                                onBlur={handleEdgeTextBlur}
                                onKeyDown={handleEdgeTextKeyDown}
                                autoFocus
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    fontSize: '12px',
                                    textAlign: 'center',
                                    background: '#1e1e2e',
                                    color: '#fff',
                                    border: '1px solid #4a9df0',
                                    borderRadius: '2px',
                                    outline: 'none'
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onDoubleClick={(e) => e.stopPropagation()}
                            />
                        </foreignObject>
                    ) : text && (
                        <text
                            x={midX}
                            y={midY}
                            fill={(isHovered || isSelected) && isEdgeMode ? "#ff4444" : "#a0a0b0"}
                            fontSize={12}
                            textAnchor="middle"
                        >
                            {text}
                        </text>
                    )}
                </g>
            );
        });
    };

    const handleNodeContextMenu = (e: React.MouseEvent, nodeName: string) => {
        if (!isEdgeMode) return;
        e.preventDefault();
        e.stopPropagation();

        // ノードを削除
        const newData = { ...waveformData };

        // 関連するエッジも削除
        if (newData.edge) {
            newData.edge = newData.edge.filter(edgeStr => {
                const parsed = parseEdge(edgeStr);
                if (parsed) {
                    return parsed.startNode !== nodeName && parsed.endNode !== nodeName;
                }
                return true;
            });
        }

        // ノードを削除
        const removeNode = (items: import('../../types/wavedrom').WaveSignalOrGroup[]): void => {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (Array.isArray(item)) {
                    removeNode(item.slice(1) as import('../../types/wavedrom').WaveSignalOrGroup[]);
                } else if ('name' in item && item.node) {
                    let newNodeStr = '';
                    for (let j = 0; j < item.node.length; j++) {
                        const char = item.node[j];
                        if (char === nodeName) {
                            newNodeStr += '.';
                        } else {
                            newNodeStr += char;
                        }
                    }
                    // 末尾の '.' を削除
                    newNodeStr = newNodeStr.replace(/\.+$/, '');
                    if (newNodeStr === '') {
                        delete item.node;
                    } else {
                        item.node = newNodeStr;
                    }
                }
            }
        };
        removeNode(newData.signal);
        setWaveformData(newData);
    };

    const handleNodeDoubleClick = (e: React.MouseEvent, nodeChar: string) => {
        if (!isEdgeMode) return;
        e.stopPropagation();
        setEditingNodeChar(nodeChar);
        setEditingNodeText(nodeChar);
    };

    const handleNodeTextBlur = () => {
        if (editingNodeChar !== null) {
            const newChar = editingNodeText.trim().charAt(0);
            if (newChar && newChar !== editingNodeChar && /^[a-zA-Z0-9]$/.test(newChar)) {
                let isUsed = false;
                signals.forEach(sig => {
                    if (sig.node && sig.node.includes(newChar)) {
                        isUsed = true;
                    }
                });

                if (!isUsed) {
                    const newData = { ...waveformData };

                    const updateNodeChar = (items: import('../../types/wavedrom').WaveSignalOrGroup[]): void => {
                        for (let i = 0; i < items.length; i++) {
                            const item = items[i];
                            if (Array.isArray(item)) {
                                updateNodeChar(item.slice(1) as import('../../types/wavedrom').WaveSignalOrGroup[]);
                            } else if ('name' in item && item.node) {
                                let newNodeStr = '';
                                for (let j = 0; j < item.node.length; j++) {
                                    if (item.node[j] === editingNodeChar) {
                                        newNodeStr += newChar;
                                    } else {
                                        newNodeStr += item.node[j];
                                    }
                                }
                                item.node = newNodeStr;
                            }
                        }
                    };
                    updateNodeChar(newData.signal);

                    if (newData.edge) {
                        newData.edge = newData.edge.map(edgeStr => {
                            const parsed = parseEdge(edgeStr);
                            if (parsed) {
                                let { startNode, endNode } = parsed;
                                const { type, text } = parsed;
                                if (startNode === editingNodeChar) startNode = newChar;
                                if (endNode === editingNodeChar) endNode = newChar;
                                return text ? `${startNode}${type}${endNode} ${text}` : `${startNode}${type}${endNode}`;
                            }
                            return edgeStr;
                        });
                    }

                    setWaveformData(newData);
                }
            }
            setEditingNodeChar(null);
        }
    };

    const handleNodeTextKeyDown = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') handleNodeTextBlur();
        if (e.key === 'Escape') setEditingNodeChar(null);
    };

    // ノードを描画
    const renderNodes = () => {
        const nodes: React.ReactNode[] = [];
        signals.forEach((sig, signalIndex) => {
            if (sig.node) {
                for (let stepIndex = 0; stepIndex < sig.node.length; stepIndex++) {
                    const nodeChar = sig.node[stepIndex];
                    if (nodeChar !== '.') {
                        const x = stepIndex * CELL_WIDTH;
                        const y = getYFromSignalIndex(signalIndex);
                        if (y === null) continue;

                        const isHovered = hoveredNode === nodeChar;
                        const isEditing = editingNodeChar === nodeChar;

                        nodes.push(
                            <g key={`${signalIndex}-${stepIndex}`}>
                                <circle
                                    cx={x}
                                    cy={y}
                                    r={isHovered && isEdgeMode ? 6 : 4}
                                    fill={isEdgeMode ? "#4a9df0" : "transparent"}
                                    opacity={isEdgeMode ? 0.8 : 0}
                                    style={{ pointerEvents: isEdgeMode ? 'auto' : 'none', cursor: isEdgeMode ? 'pointer' : 'default' }}
                                    onContextMenu={(e) => handleNodeContextMenu(e, nodeChar)}
                                    onDoubleClick={(e) => handleNodeDoubleClick(e, nodeChar)}
                                    onMouseEnter={() => isEdgeMode && setHoveredNode(nodeChar)}
                                    onMouseLeave={() => isEdgeMode && setHoveredNode(null)}
                                />
                                {isEditing ? (
                                    <foreignObject x={x - 10} y={y - 25} width={20} height={20}>
                                        <input
                                            type="text"
                                            value={editingNodeText}
                                            onChange={(e) => setEditingNodeText(e.target.value)}
                                            onBlur={handleNodeTextBlur}
                                            onKeyDown={handleNodeTextKeyDown}
                                            autoFocus
                                            maxLength={1}
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                fontSize: '12px',
                                                textAlign: 'center',
                                                background: '#1e1e2e',
                                                color: '#fff',
                                                border: '1px solid #4a9df0',
                                                borderRadius: '2px',
                                                outline: 'none',
                                                padding: 0
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            onDoubleClick={(e) => e.stopPropagation()}
                                            onMouseDown={(e) => e.stopPropagation()}
                                        />
                                    </foreignObject>
                                ) : (
                                    <text
                                        x={x}
                                        y={y - 10}
                                        fill={isHovered && isEdgeMode ? "#ff4444" : "#a0a0b0"}
                                        fontSize={12}
                                        textAnchor="middle"
                                        style={{ pointerEvents: 'none' }}
                                    >
                                        {nodeChar}
                                    </text>
                                )}
                            </g>
                        );
                    }
                }
            }
        });
        return nodes;
    };

    return (
        <svg
            ref={svgRef}
            className={styles.edgeOverlay}
            style={{
                width: totalWaveWidth,
                height: totalRowsHeight,
                pointerEvents: isEdgeMode ? 'auto' : 'none',
                userSelect: isEdgeMode ? 'none' : 'auto'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onClick={handleCanvasClick}
        >
            <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#4a9df0" />
                </marker>
                <marker id="arrowhead-start" markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto">
                    <polygon points="10 0, 0 3.5, 10 7" fill="#4a9df0" />
                </marker>
                <marker id="arrowhead-hover" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#ff4444" />
                </marker>
                <marker id="arrowhead-start-hover" markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto">
                    <polygon points="10 0, 0 3.5, 10 7" fill="#ff4444" />
                </marker>
            </defs>

            {renderNodes()}
            {renderEdges()}

            {/* 描画中のエッジ */}
            {drawingEdge && (
                <path
                    d={getEdgePath(
                        { x: drawingEdge.startX, y: drawingEdge.startY },
                        { x: drawingEdge.currentX, y: drawingEdge.currentY },
                        '~>'
                    )}
                    fill="none"
                    stroke="#4a9df0"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    markerEnd="url(#arrowhead)"
                    style={{ pointerEvents: 'none' }}
                />
            )}
        </svg>
    );
};

export default EdgeOverlay;
