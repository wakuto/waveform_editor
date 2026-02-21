import React, { useState, useEffect, useCallback } from 'react';
import { useWaveformStore } from '../../store/useWaveformStore';
import { formatWaveDromJSON } from '../../utils/jsonFormatter';
import styles from './JsonEditor.module.css';

const JsonEditor: React.FC = () => {
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
                if (!Array.isArray(parsed.signal)) throw new Error('"signal" 配列が必要です');
                setWaveformData(parsed, true);
                setError(null);
            } catch (err) {
                setError((err as Error).message);
            }
        },
        [setWaveformData]
    );

    const handleBlur = useCallback(() => {
        setIsEditing(false);
        setText(formatWaveDromJSON(waveformData));
    }, [waveformData]);

    return (
        <div className={styles.panel}>
            <div className={styles.header}>
                <span>WaveDrom JSON</span>
                {error && <span className={styles.errorBadge}>構文エラー</span>}
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
