import React, { useEffect, useRef } from 'react';
import { useWaveformStore } from '../../store/useWaveformStore';
import { renderAny, onml, waveSkin } from 'wavedrom';
// @ts-expect-error: no types for skins
import narrowSkin from 'wavedrom/skins/narrow.js';
// @ts-expect-error: no types for skins
import lowkeySkin from 'wavedrom/skins/lowkey.js';
import styles from './PreviewPanel.module.css';

const allSkins = {
    ...waveSkin,
    ...narrowSkin,
    ...lowkeySkin
};

const PreviewPanel: React.FC = () => {
    const waveformData = useWaveformStore((s) => s.waveformData);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            try {
                // WaveDromのrenderAnyは、waveformDataを直接変更してしまう可能性があるため、ディープコピーを渡す
                const dataCopy = JSON.parse(JSON.stringify(waveformData));
                // renderAnyの第3引数には、waveSkinオブジェクト全体を渡す必要がある
                const onmlNode = renderAny(0, dataCopy, allSkins as Record<string, unknown>);
                const svgString = onml.stringify(onmlNode);
                containerRef.current.innerHTML = svgString;
            } catch (e) {
                console.error('WaveDrom rendering error:', e);
                containerRef.current.innerHTML = '<div style="color: red; padding: 10px;">レンダリングエラーが発生しました</div>';
            }
        }
    }, [waveformData]);

    return (
        <div className={styles.previewPanel}>
            <div className={styles.header}>WaveDrom プレビュー</div>
            <div className={styles.content} ref={containerRef}>
                {/* ここにWaveDromのSVGがレンダリングされる */}
            </div>
        </div>
    );
};

export default PreviewPanel;
