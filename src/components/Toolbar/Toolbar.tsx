import React, { useCallback } from 'react';
import { useWaveformStore } from '../../store/useWaveformStore';
import type { WaveTool, AppState } from '../../types/wavedrom';
import { DEFAULT_WAVEFORM } from '../../types/wavedrom';
import { downloadSVG, downloadPNG } from '../../utils/exportUtils';
import styles from './Toolbar.module.css';

const TOOLS: { key: WaveTool; label: string; title: string }[] = [
    { key: '0', label: '0', title: 'Low' },
    { key: '1', label: '1', title: 'High' },
    { key: 'p', label: 'p', title: 'Posedge Clock' },
    { key: 'n', label: 'n', title: 'Negedge Clock' },
    { key: 'P', label: 'P', title: 'Posedge Trigger' },
    { key: 'N', label: 'N', title: 'Negedge Trigger' },
    { key: 'z', label: 'z', title: 'High-Z' },
    { key: 'x', label: 'x', title: 'Undefined' },
    { key: '=', label: '=', title: 'Data' },
    { key: '2', label: '2', title: 'Data (Orange)' },
    { key: '3', label: '3', title: 'Data (Green)' },
    { key: '4', label: '4', title: 'Data (Red)' },
    { key: '.', label: '.', title: 'Continue' },
    { key: '|', label: '|', title: 'Gap' },
];

const EDGE_SHAPES: { key: AppState['edgeShape']; path: string; title: string; category: string }[] = [
    // 曲線系
    { key: '~', path: 'M2,3 C12,3 12,13 22,13', title: 'S字曲線', category: 'curve' },
    { key: '-~', path: 'M2,3 Q22,3 22,13', title: '下に凸', category: 'curve' },
    { key: '~-', path: 'M2,3 Q2,13 22,13', title: '上に凸', category: 'curve' },
    // 直線・直角系
    { key: '-', path: 'M2,3 L22,13', title: '直線', category: 'sharp' },
    { key: '-|', path: 'M2,3 L22,3 L22,13', title: '横→縦', category: 'sharp' },
    { key: '|-', path: 'M2,3 L2,13 L22,13', title: '縦→横', category: 'sharp' },
    { key: '-|-', path: 'M2,3 L12,3 L12,13 L22,13', title: '横→縦→横', category: 'sharp' },
    // 寸法線
    { key: '+', path: 'M2,3 L2,13 M2,8 L22,8 M22,3 L22,13', title: '寸法線', category: 'special' },
];

import { formatWaveDromJSON } from '../../utils/jsonFormatter';

const Toolbar: React.FC = () => {
    const selectedTool = useWaveformStore((s) => s.selectedTool);
    const setSelectedTool = useWaveformStore((s) => s.setSelectedTool);
    const setWaveformData = useWaveformStore((s) => s.setWaveformData);
    const waveformData = useWaveformStore((s) => s.waveformData);
    const jsonPanelVisible = useWaveformStore((s) => s.jsonPanelVisible);
    const setJsonPanelVisible = useWaveformStore((s) => s.setJsonPanelVisible);
    const previewVisible = useWaveformStore((s) => s.previewVisible);
    const setPreviewVisible = useWaveformStore((s) => s.setPreviewVisible);
    const configPanelVisible = useWaveformStore((s) => s.configPanelVisible);
    const setConfigPanelVisible = useWaveformStore((s) => s.setConfigPanelVisible);
    const undo = useWaveformStore((s) => s.undo);
    const redo = useWaveformStore((s) => s.redo);
    const canUndo = useWaveformStore((s) => s.canUndo);
    const canRedo = useWaveformStore((s) => s.canRedo);

    // 選択ツール操作
    const stepSelection = useWaveformStore((s) => s.stepSelection);
    const insertCursor = useWaveformStore((s) => s.insertCursor);
    const stepClipboard = useWaveformStore((s) => s.stepClipboard);
    const insertStepsAtCursor = useWaveformStore((s) => s.insertStepsAtCursor);
    const deleteSelectedSteps = useWaveformStore((s) => s.deleteSelectedSteps);
    const copySteps = useWaveformStore((s) => s.copySteps);
    const cutSteps = useWaveformStore((s) => s.cutSteps);
    const pasteAtCursor = useWaveformStore((s) => s.pasteAtCursor);

    // エッジプロパティ操作
    const edgeShape = useWaveformStore((s) => s.edgeShape);
    const edgeStartArrow = useWaveformStore((s) => s.edgeStartArrow);
    const edgeEndArrow = useWaveformStore((s) => s.edgeEndArrow);
    const setEdgeShape = useWaveformStore((s) => s.setEdgeShape);
    const setEdgeStartArrow = useWaveformStore((s) => s.setEdgeStartArrow);
    const setEdgeEndArrow = useWaveformStore((s) => s.setEdgeEndArrow);

    const isSelectMode = selectedTool === 'select';
    const isEdgeMode = selectedTool === 'edge';

    /** 新規作成 */
    const handleNew = useCallback(() => {
        if (window.confirm('新規作成すると現在の編集内容が失われます。続けますか？')) {
            setWaveformData(DEFAULT_WAVEFORM, false);
        }
    }, [setWaveformData]);

    /** ファイルを開く */
    const handleOpen = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const parsed = JSON.parse(ev.target?.result as string);
                    setWaveformData(parsed, false);
                } catch {
                    alert('JSONの解析に失敗しました。');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }, [setWaveformData]);

    /** 保存（ダウンロード） */
    const handleSave = useCallback(() => {
        const json = formatWaveDromJSON(waveformData);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'waveform.json';
        a.click();
        URL.revokeObjectURL(url);
    }, [waveformData]);

    const handleExportSVG = useCallback(() => downloadSVG(waveformData), [waveformData]);
    const handleExportPNG = useCallback(() => downloadPNG(waveformData), [waveformData]);

    return (
        <div className={styles.toolbar}>
            {/* ファイル操作 */}
            <div className={styles.group}>
                <button className={styles.btn} onClick={handleNew} title="新規作成 (Ctrl+N)">新規</button>
                <button className={styles.btn} onClick={handleOpen} title="開く (Ctrl+O)">開く</button>
                <button className={styles.btn} onClick={handleSave} title="保存 (Ctrl+S)">保存</button>
                <button className={styles.btn} onClick={handleExportSVG} title="SVGエクスポート">SVG</button>
                <button className={styles.btn} onClick={handleExportPNG} title="PNGエクスポート">PNG</button>
            </div>

            <div className={styles.separator} />

            {/* Undo / Redo */}
            <div className={styles.group}>
                <button className={styles.btn} onClick={undo} disabled={!canUndo()} title="元に戻す (Ctrl+Z)">↩ Undo</button>
                <button className={styles.btn} onClick={redo} disabled={!canRedo()} title="やり直す (Ctrl+Shift+Z)">↪ Redo</button>
            </div>

            <div className={styles.separator} />

            {/* ツール選択パレットとコンテキストメニュー */}
            <div className={styles.group}>
                <button
                    className={`${styles.btn} ${isSelectMode ? styles.active : ''}`}
                    onClick={() => setSelectedTool('select')}
                    title="選択ツール (S)"
                >
                    ↖ 選択
                </button>
                <button
                    className={`${styles.btn} ${isEdgeMode ? styles.active : ''}`}
                    onClick={() => setSelectedTool('edge')}
                    title="エッジツール (E)"
                >
                    ↗ エッジ
                </button>
                <button
                    className={`${styles.btn} ${!isSelectMode && !isEdgeMode ? styles.active : ''}`}
                    onClick={() => {
                        if (isSelectMode || isEdgeMode) setSelectedTool('0');
                    }}
                    title="描画ツール"
                >
                    ✎ 描画
                </button>

                {isSelectMode && (
                    <>
                        <div className={styles.separator} />
                        <button
                            className={styles.toolBtn}
                            onClick={() => insertStepsAtCursor()}
                            disabled={insertCursor === null}
                            title="カーソル位置にステップを挿入 (Insert)"
                        >
                            ➕
                        </button>
                        <button
                            className={styles.toolBtn}
                            onClick={deleteSelectedSteps}
                            disabled={!stepSelection}
                            title="選択範囲を削除 (Delete)"
                        >
                            🗑️
                        </button>
                        <button
                            className={styles.toolBtn}
                            onClick={copySteps}
                            disabled={!stepSelection}
                            title="コピー (Ctrl+C)"
                        >
                            📄
                        </button>
                        <button
                            className={styles.toolBtn}
                            onClick={cutSteps}
                            disabled={!stepSelection}
                            title="カット (Ctrl+X)"
                        >
                            ✂️
                        </button>
                        <button
                            className={styles.toolBtn}
                            onClick={pasteAtCursor}
                            disabled={!stepClipboard || insertCursor === null}
                            title="ペースト (Ctrl+V)"
                        >
                            📋
                        </button>
                    </>
                )}
                {isEdgeMode && (
                    <>
                        <div className={styles.separator} />
                        <button
                            className={`${styles.toolBtn} ${edgeStartArrow && edgeShape !== '+' ? styles.active : ''}`}
                            onClick={() => setEdgeStartArrow(!edgeStartArrow)}
                            disabled={edgeShape === '+'}
                            title="始点矢印"
                        >
                            ◀
                        </button>
                        <div className={styles.separator} />
                        {EDGE_SHAPES.map(s => (
                            <button
                                key={s.key}
                                className={`${styles.edgeShapeBtn} ${edgeShape === s.key ? styles.active : ''}`}
                                onClick={() => setEdgeShape(s.key)}
                                title={s.title}
                            >
                                <svg viewBox="0 0 24 16" width="24" height="16">
                                    <path d={s.path} />
                                </svg>
                            </button>
                        ))}
                        <div className={styles.separator} />
                        <button
                            className={`${styles.toolBtn} ${edgeEndArrow && edgeShape !== '+' ? styles.active : ''}`}
                            onClick={() => setEdgeEndArrow(!edgeEndArrow)}
                            disabled={edgeShape === '+'}
                            title="終点矢印"
                        >
                            ▶
                        </button>
                    </>
                )}
                {!isSelectMode && !isEdgeMode && (
                    <>
                        <div className={styles.separator} />
                        {TOOLS.map((t) => (
                            <button
                                key={t.key}
                                className={`${styles.toolBtn} ${selectedTool === t.key ? styles.active : ''}`}
                                onClick={() => setSelectedTool(t.key)}
                                title={t.title}
                            >
                                {t.label}
                            </button>
                        ))}
                    </>
                )}
            </div>

            <div className={styles.separator} />

            {/* パネルトグル */}
            <div className={`${styles.group} ${styles.rightAlignedGroup}`}>
                <button
                    className={`${styles.btn} ${configPanelVisible ? styles.active : ''}`}
                    onClick={() => setConfigPanelVisible(!configPanelVisible)}
                    title="設定パネルを表示/非表示"
                >
                    ⚙ 設定
                </button>
                <button
                    className={`${styles.btn} ${previewVisible ? styles.active : ''}`}
                    onClick={() => setPreviewVisible(!previewVisible)}
                    title="WaveDromプレビューを表示/非表示"
                >
                    👁 プレビュー
                </button>
                <button
                    className={`${styles.btn} ${jsonPanelVisible ? styles.active : ''}`}
                    onClick={() => setJsonPanelVisible(!jsonPanelVisible)}
                    title="JSONエディタを表示/非表示"
                >
                    {'{ } JSON'}
                </button>
            </div>
        </div>
    );
};

export default Toolbar;
