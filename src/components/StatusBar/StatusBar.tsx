import React from 'react';
import { useWaveformStore } from '../../store/useWaveformStore';
import { getSignalList } from '../../utils/waveformUtils';
import styles from './StatusBar.module.css';
import { useI18n } from '../../i18n';

const TOOL_NAMES: Record<string, string> = {
    '0': 'Low (0)',
    '1': 'High (1)',
    'p': 'Posedge Clock (p)',
    'n': 'Negedge Clock (n)',
    'z': 'High-Z (z)',
    'x': 'Undefined (x)',
    '=': 'Data (=)',
    '2': 'Data Orange (2)',
    '3': 'Data Green (3)',
    '4': 'Data Red (4)',
    '5': 'Data Purple (5)',
    '6': 'Data Yellow (6)',
    '7': 'Data Cyan (7)',
    '8': 'Data Pink (8)',
    '9': 'Data Lime (9)',
    '.': 'Continue (.)',
    '|': 'Gap (|)',
};

const StatusBar: React.FC = () => {
    const { t } = useI18n();
    const hoverInfo = useWaveformStore((s) => s.hoverInfo);
    const waveformData = useWaveformStore((s) => s.waveformData);
    const selectedTool = useWaveformStore((s) => s.selectedTool);
    const insertCursor = useWaveformStore((s) => s.insertCursor);
    const stepSelection = useWaveformStore((s) => s.stepSelection);

    const signals = getSignalList(waveformData.signal);
    const maxLen = signals.reduce((m, s) => Math.max(m, s.wave.length), 0);

    const isSelectMode = selectedTool === 'select';
    const toolName = selectedTool === 'select'
        ? t('status.tool.select')
        : selectedTool === 'edge'
            ? t('status.tool.edge')
            : (TOOL_NAMES[selectedTool] ?? selectedTool);

    const hoveredSignalName =
        hoverInfo !== null ? (signals[hoverInfo.signalIndex]?.name ?? '') : null;

    return (
        <div className={styles.statusBar}>
            {/* カーソル位置 or ホバー位置 */}
            {isSelectMode ? (
                <span className={styles.item}>
                    {t('status.cursor')}: {insertCursor !== null ? t('status.boundary', { index: insertCursor }) : '—'}
                </span>
            ) : hoveredSignalName !== null ? (
                <span className={styles.item}>
                    {hoveredSignalName} / step {hoverInfo!.stepIndex}
                </span>
            ) : (
                <span className={styles.item}>—</span>
            )}

            <span className={styles.separator}>｜</span>

            {/* 選択範囲（選択モード時のみ） */}
            {isSelectMode && (
                <>
                    <span className={styles.item}>
                        {t('status.selection')}: {stepSelection ? `${stepSelection.from}〜${stepSelection.to}` : '—'}
                    </span>
                    <span className={styles.separator}>｜</span>
                </>
            )}

            <span className={styles.item}>{t('status.tool')}: {toolName}</span>
            <span className={styles.separator}>｜</span>
            <span className={styles.item}>{t('status.signalsSteps', { signals: signals.length, steps: maxLen })}</span>
        </div>
    );
};

export default StatusBar;
