import React, { useCallback } from 'react';
import { useWaveformStore } from '../../store/useWaveformStore';
import type { WaveTool } from '../../types/wavedrom';
import { DEFAULT_WAVEFORM } from '../../types/wavedrom';
import { downloadSVG, downloadPNG } from '../../utils/exportUtils';
import styles from './Toolbar.module.css';

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

    const isSelectMode = selectedTool === 'select';

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

            {/* 選択ツール + 選択操作ボタン */}
            <div className={styles.group}>
                <button
                    className={`${styles.btn} ${isSelectMode ? styles.active : ''}`}
                    onClick={() => setSelectedTool('select')}
                    title="選択ツール (S)"
                >
                    ▷ 選択
                </button>
                <button
                    className={`${styles.btn} ${selectedTool === 'edge' ? styles.active : ''}`}
                    onClick={() => setSelectedTool('edge')}
                    title="エッジツール (E)"
                >
                    ↗ エッジ
                </button>
                {isSelectMode && (
                    <>
                        <button
                            className={styles.toolBtn}
                            onClick={() => insertStepsAtCursor()}
                            disabled={insertCursor === null}
                            title="カーソル位置にステップを挿入 (Insert)"
                        >
                            ⊕
                        </button>
                        <button
                            className={styles.toolBtn}
                            onClick={deleteSelectedSteps}
                            disabled={!stepSelection}
                            title="選択範囲を削除 (Delete)"
                        >
                            ⊖
                        </button>
                        <button
                            className={styles.toolBtn}
                            onClick={copySteps}
                            disabled={!stepSelection}
                            title="コピー (Ctrl+C)"
                        >
                            ⎘
                        </button>
                        <button
                            className={styles.toolBtn}
                            onClick={cutSteps}
                            disabled={!stepSelection}
                            title="カット (Ctrl+X)"
                        >
                            ✂
                        </button>
                        <button
                            className={styles.toolBtn}
                            onClick={pasteAtCursor}
                            disabled={!stepClipboard || insertCursor === null}
                            title="ペースト (Ctrl+V)"
                        >
                            ⎗
                        </button>
                    </>
                )}
            </div>

            <div className={styles.separator} />

            {/* ツール選択パレット */}
            <div className={styles.group}>
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
            </div>

            <div className={styles.separator} />

            {/* パネルトグル */}
            <div className={styles.group}>
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
