import React from 'react';
import { useWaveformStore } from '../../store/useWaveformStore';
import { getSignalList } from '../../utils/waveformUtils';
import styles from './StatusBar.module.css';

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
    'select': '↖ 選択',
    'edge': '↗ エッジ',
};

const StatusBar: React.FC = () => {
    const hoverInfo = useWaveformStore((s) => s.hoverInfo);
    const waveformData = useWaveformStore((s) => s.waveformData);
    const selectedTool = useWaveformStore((s) => s.selectedTool);
    const insertCursor = useWaveformStore((s) => s.insertCursor);
    const stepSelection = useWaveformStore((s) => s.stepSelection);

    const signals = getSignalList(waveformData.signal);
    const maxLen = signals.reduce((m, s) => Math.max(m, s.wave.length), 0);

    const isSelectMode = selectedTool === 'select';

    const hoveredSignalName =
        hoverInfo !== null ? (signals[hoverInfo.signalIndex]?.name ?? '') : null;

    return (
        <div className={styles.statusBar}>
            {/* カーソル位置 or ホバー位置 */}
            {isSelectMode ? (
                <span className={styles.item}>
                    カーソル: {insertCursor !== null ? `境界 ${insertCursor}` : '—'}
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
                        選択: {stepSelection ? `${stepSelection.from}〜${stepSelection.to}` : '—'}
                    </span>
                    <span className={styles.separator}>｜</span>
                </>
            )}

            <span className={styles.item}>ツール: {TOOL_NAMES[selectedTool] ?? selectedTool}</span>
            <span className={styles.separator}>｜</span>
            <span className={styles.item}>{signals.length} 信号 × {maxLen} ステップ</span>
        </div>
    );
};

export default StatusBar;
