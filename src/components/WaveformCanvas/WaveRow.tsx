import React, { useCallback, useEffect, useRef } from 'react';
import {
    CELL_WIDTH,
    ROW_HEIGHT,
    WAVE_TOP,
    WAVE_BOT,
    getSegmentPath,
    buildDataIndexMap,
    resolveWave,
    DATA_COLORS,
} from '../../utils/waveformUtils';
import type { WaveSignal } from '../../types/wavedrom';
import { useWaveformStore } from '../../store/useWaveformStore';
import styles from './WaveRow.module.css';

interface WaveRowProps {
    signal: WaveSignal;
    signalIndex: number;
    hoverStep: number | null;
}

const WaveRow: React.FC<WaveRowProps> = ({ signal, signalIndex, hoverStep }) => {
    const { wave, data } = signal;
    const selectedTool = useWaveformStore((s) => s.selectedTool);
    const setCell = useWaveformStore((s) => s.setCell);
    const setCellRange = useWaveformStore((s) => s.setCellRange);
    const setHoverInfo = useWaveformStore((s) => s.setHoverInfo);
    const setDataLabel = useWaveformStore((s) => s.setDataLabel);

    const dataIndexMap = buildDataIndexMap(wave);
    const isDragging = useRef(false);
    const dragStart = useRef<number | null>(null);

    const getCellIndex = useCallback((e: React.MouseEvent<SVGElement>) => {
        const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
        const relX = e.clientX - rect.left;
        return Math.floor(relX / CELL_WIDTH);
    }, []);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent<SVGRectElement>, stepIndex: number) => {
            if (e.button !== 0) return;
            // ブラウザのネイティブドラッグを防止
            e.preventDefault();
            isDragging.current = true;
            dragStart.current = stepIndex;
            setCell(signalIndex, stepIndex, selectedTool);
        },
        [signalIndex, selectedTool, setCell]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<SVGElement>) => {
            const step = getCellIndex(e);
            setHoverInfo({ signalIndex, stepIndex: step });
            if (isDragging.current && dragStart.current !== null) {
                setCellRange(signalIndex, dragStart.current, step, selectedTool);
            }
        },
        [signalIndex, selectedTool, getCellIndex, setHoverInfo, setCellRange]
    );

    const stopDrag = useCallback(() => {
        isDragging.current = false;
        dragStart.current = null;
    }, []);

    // SVG 外でマウスボタンを離したときもドラッグを終了させる
    useEffect(() => {
        window.addEventListener('mouseup', stopDrag);
        return () => window.removeEventListener('mouseup', stopDrag);
    }, [stopDrag]);

    const handleMouseLeave = useCallback(() => {
        setHoverInfo(null);
        // ドラッグ中は isDragging を維持（window mouseup で終了）
    }, [setHoverInfo]);

    const handleDoubleClick = useCallback(
        (_e: React.MouseEvent<SVGRectElement>, stepIndex: number) => {
            // '.' の場合も含め、解決済みの文字でデータ判定する
            const resolved = resolveWave(wave);
            const rch = resolved[stepIndex];
            if (!rch || (rch !== '=' && (rch < '2' || rch > '9'))) return;
            const di = dataIndexMap.get(stepIndex) ?? 0;
            const current = data?.[di] ?? '';
            const label = window.prompt('データラベルを入力してください:', current);
            if (label !== null) {
                setDataLabel(signalIndex, stepIndex, label);
            }
        },
        [wave, data, dataIndexMap, signalIndex, setDataLabel]
    );

    const totalWidth = wave.length * CELL_WIDTH;

    // '.' を前の有効な状態に解決した配列（色・パス生成に使用）
    const resolved = resolveWave(wave);

    const segments: React.ReactNode[] = [];

    for (let i = 0; i < wave.length; i++) {
        const rawCh = wave[i];                          // 生の文字（継続判定用）
        const rch = resolved[i];                        // 解決済み文字（描画用）
        const rprev = i > 0 ? resolved[i - 1] : null;  // 解決済み前の文字
        const isContinue = rawCh === '.';               // このセルが '.' → 左端 < なし
        const nextRawCh = i + 1 < wave.length ? wave[i + 1] : null;
        const isNextContinue = nextRawCh === '.';       // 次のセルが '.' → 右端 > なし
        const x = i * CELL_WIDTH;
        const seg = getSegmentPath(rch, rprev, x, CELL_WIDTH, isContinue, isNextContinue);
        const isHovered = hoverStep === i;
        const di = dataIndexMap.get(i);
        const label = di !== undefined ? (data?.[di] ?? '') : undefined;

        segments.push(
            <g key={i} className={isHovered ? styles.hovered : undefined}>
                {/* ホバーハイライト背景 */}
                {isHovered && (
                    <rect
                        x={x}
                        y={0}
                        width={CELL_WIDTH}
                        height={ROW_HEIGHT}
                        fill="rgba(255,255,255,0.08)"
                    />
                )}

                {/* 塗りつぶし（Data / Undefined） */}
                {seg.fill && (
                    <path
                        d={seg.fill}
                        fill={seg.fillColor ?? 'rgba(100,100,200,0.3)'}
                        stroke="none"
                    />
                )}

                {/* 波形ライン */}
                {seg.d && (
                    <path
                        d={seg.d}
                        fill="none"
                        stroke={getStrokeColor(rch)}
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray={rch === 'z' ? '4 3' : undefined}
                    />
                )}

                {/* データラベル */}
                {label !== undefined && (
                    <text
                        x={x + CELL_WIDTH / 2}
                        y={ROW_HEIGHT / 2 + 4}
                        textAnchor="middle"
                        fontSize={11}
                        fill={DATA_COLORS[rch] ?? '#4a9df0'}
                        style={{ userSelect: 'none', pointerEvents: 'none' }}
                    >
                        {label}
                    </text>
                )}

                {/* インタラクティブ透明レイヤー */}
                <rect
                    x={x + 1}
                    y={0}
                    width={CELL_WIDTH - 2}
                    height={ROW_HEIGHT}
                    fill="transparent"
                    style={{ cursor: 'crosshair' }}
                    onMouseDown={(e) => handleMouseDown(e, i)}
                    onDoubleClick={(e) => handleDoubleClick(e, i)}
                />
            </g>
        );
    }

    return (
        <svg
            width={totalWidth}
            height={ROW_HEIGHT}
            className={styles.waveRow}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onDragStart={(e) => e.preventDefault()}
        >
            {/* グリッドライン */}
            {Array.from({ length: wave.length + 1 }, (_, i) => (
                <line
                    key={`grid-${i}`}
                    x1={i * CELL_WIDTH}
                    y1={WAVE_TOP}
                    x2={i * CELL_WIDTH}
                    y2={WAVE_BOT}
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={1}
                />
            ))}
            {segments}
        </svg>
    );
};

function getStrokeColor(ch: string): string {
    if (ch === 'x') return '#e05555';
    if (ch === 'z') return '#55aaee';
    if (ch === '0' || ch === '1') return '#88cc88';
    if (ch === 'p' || ch === 'n') return '#88cc88';
    if (ch === '=' || (ch >= '2' && ch <= '9')) return DATA_COLORS[ch] ?? '#4a9df0';
    return '#aaaaaa';
}

export default WaveRow;
