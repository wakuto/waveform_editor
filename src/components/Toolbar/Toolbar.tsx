import React, { useCallback, useMemo } from 'react';
import { useWaveformStore } from '../../store/useWaveformStore';
import type { WaveTool } from '../../types/wavedrom';
import { DEFAULT_WAVEFORM } from '../../types/wavedrom';
import { downloadSVG, downloadPNG } from '../../utils/exportUtils';
import styles from './Toolbar.module.css';

import { formatWaveDromJSON } from '../../utils/jsonFormatter';
import { useI18n } from '../../i18n';

const Toolbar: React.FC = () => {
    const { locale, setLocale, t } = useI18n();
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
    const tools: { key: WaveTool; label: string; title: string }[] = useMemo(() => ([
        { key: '0', label: '0', title: t('toolbar.tool.low') },
        { key: '1', label: '1', title: t('toolbar.tool.high') },
        { key: 'p', label: 'p', title: t('toolbar.tool.posedgeClock') },
        { key: 'n', label: 'n', title: t('toolbar.tool.negedgeClock') },
        { key: 'P', label: 'P', title: t('toolbar.tool.posedgeTrigger') },
        { key: 'N', label: 'N', title: t('toolbar.tool.negedgeTrigger') },
        { key: 'z', label: 'z', title: t('toolbar.tool.highZ') },
        { key: 'x', label: 'x', title: t('toolbar.tool.undefined') },
        { key: '=', label: '=', title: t('toolbar.tool.data') },
        { key: '2', label: '2', title: t('toolbar.tool.dataOrange') },
        { key: '3', label: '3', title: t('toolbar.tool.dataGreen') },
        { key: '4', label: '4', title: t('toolbar.tool.dataRed') },
        { key: '.', label: '.', title: t('toolbar.tool.continue') },
        { key: '|', label: '|', title: t('toolbar.tool.gap') },
    ]), [t]);

    /** 新規作成 */
    const handleNew = useCallback(() => {
        if (window.confirm(t('toolbar.confirmNew'))) {
            setWaveformData(DEFAULT_WAVEFORM, false);
        }
    }, [setWaveformData, t]);

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
                    alert(t('toolbar.openJsonParseError'));
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }, [setWaveformData, t]);

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
    const handleExportPNG = useCallback(() => downloadPNG(waveformData, 'waveform.png', t('toolbar.exportPngFailed')), [waveformData, t]);

    return (
        <div className={styles.toolbar}>
            {/* ファイル操作 */}
            <div className={styles.group}>
                <button className={styles.btn} onClick={handleNew} title={t('toolbar.title.new')}>{t('toolbar.new')}</button>
                <button className={styles.btn} onClick={handleOpen} title={t('toolbar.title.open')}>{t('toolbar.open')}</button>
                <button className={styles.btn} onClick={handleSave} title={t('toolbar.title.save')}>{t('toolbar.save')}</button>
                <button className={styles.btn} onClick={handleExportSVG} title={t('toolbar.title.exportSvg')}>{t('toolbar.exportSvg')}</button>
                <button className={styles.btn} onClick={handleExportPNG} title={t('toolbar.title.exportPng')}>{t('toolbar.exportPng')}</button>
            </div>

            <div className={styles.separator} />

            {/* Undo / Redo */}
            <div className={styles.group}>
                <button className={styles.btn} onClick={undo} disabled={!canUndo()} title={t('toolbar.title.undo')}>{t('toolbar.undo')}</button>
                <button className={styles.btn} onClick={redo} disabled={!canRedo()} title={t('toolbar.title.redo')}>{t('toolbar.redo')}</button>
            </div>

            <div className={styles.separator} />

            {/* 選択ツール + 選択操作ボタン */}
            <div className={styles.group}>
                <button
                    className={`${styles.btn} ${isSelectMode ? styles.active : ''}`}
                    onClick={() => setSelectedTool('select')}
                    title={t('toolbar.title.select')}
                >
                    {t('toolbar.select')}
                </button>
                <button
                    className={`${styles.btn} ${selectedTool === 'edge' ? styles.active : ''}`}
                    onClick={() => setSelectedTool('edge')}
                    title={t('toolbar.title.edge')}
                >
                    {t('toolbar.edge')}
                </button>
                {isSelectMode && (
                    <>
                        <button
                            className={styles.toolBtn}
                            onClick={() => insertStepsAtCursor()}
                            disabled={insertCursor === null}
                            title={t('toolbar.title.insert')}
                        >
                            ➕
                        </button>
                        <button
                            className={styles.toolBtn}
                            onClick={deleteSelectedSteps}
                            disabled={!stepSelection}
                            title={t('toolbar.title.deleteSelection')}
                        >
                            🗑️
                        </button>
                        <button
                            className={styles.toolBtn}
                            onClick={copySteps}
                            disabled={!stepSelection}
                            title={t('toolbar.title.copy')}
                        >
                            📄
                        </button>
                        <button
                            className={styles.toolBtn}
                            onClick={cutSteps}
                            disabled={!stepSelection}
                            title={t('toolbar.title.cut')}
                        >
                            ✂️
                        </button>
                        <button
                            className={styles.toolBtn}
                            onClick={pasteAtCursor}
                            disabled={!stepClipboard || insertCursor === null}
                            title={t('toolbar.title.paste')}
                        >
                            📋
                        </button>
                    </>
                )}
            </div>

            <div className={styles.separator} />

            {/* ツール選択パレット */}
            <div className={styles.group}>
                {tools.map((t) => (
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
                    title={t('toolbar.title.settingsToggle')}
                >
                    {t('toolbar.settings')}
                </button>
                <button
                    className={`${styles.btn} ${previewVisible ? styles.active : ''}`}
                    onClick={() => setPreviewVisible(!previewVisible)}
                    title={t('toolbar.title.previewToggle')}
                >
                    {t('toolbar.preview')}
                </button>
                <button
                    className={`${styles.btn} ${jsonPanelVisible ? styles.active : ''}`}
                    onClick={() => setJsonPanelVisible(!jsonPanelVisible)}
                    title={t('toolbar.title.jsonToggle')}
                >
                    {'{ } JSON'}
                </button>
                <button
                    className={styles.btn}
                    onClick={() => setLocale(locale === 'ja' ? 'en' : 'ja')}
                    title={t('toolbar.title.languageSwitch')}
                >
                    {t('toolbar.languageSwitch')}
                </button>
            </div>
        </div>
    );
};

export default Toolbar;
