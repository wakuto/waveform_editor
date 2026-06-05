import React, { useState, useEffect, useCallback } from 'react';
import { useWaveformStore } from '../../store/useWaveformStore';
import { formatWaveDromJSON } from '../../utils/jsonFormatter';
import styles from './JsonEditor.module.css';
import { useI18n } from '../../i18n';

const JsonEditor: React.FC = () => {
    const { t } = useI18n();
    const waveformData = useWaveformStore((s) => s.waveformData);
    const setWaveformData = useWaveformStore((s) => s.setWaveformData);

    const [text, setText] = useState(() => formatWaveDromJSON(waveformData));
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);

    // 波形データが外部から変更されたときにテキストを更新
    useEffect(() => {
        if (!isEditing) {
            setText(formatWaveDromJSON(waveformData));
            setError(null);
        }
    }, [waveformData, isEditing]);

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const val = e.target.value;
            setText(val);
            setIsEditing(true);
            try {
                const parsed = JSON.parse(val);
                if (!Array.isArray(parsed.signal)) throw new Error(t('json.signalArrayRequired'));
                setWaveformData(parsed, true);
                setError(null);
            } catch (err) {
                setError((err as Error).message);
            }
        },
        [setWaveformData, t]
    );

    const handleBlur = useCallback(() => {
        setIsEditing(false);
        setText(formatWaveDromJSON(waveformData));
    }, [waveformData]);

    return (
        <div className={styles.panel}>
            <div className={styles.header}>
                <span>WaveDrom JSON</span>
                {error && <span className={styles.errorBadge}>{t('json.syntaxError')}</span>}
            </div>
            <textarea
                className={`${styles.editor} ${error ? styles.hasError : ''}`}
                value={text}
                onChange={handleChange}
                onBlur={handleBlur}
                spellCheck={false}
                wrap="off"
            />
            {error && (
                <div className={styles.errorMsg}>{error}</div>
            )}
        </div>
    );
};

export default JsonEditor;
