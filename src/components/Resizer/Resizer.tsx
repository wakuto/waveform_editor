import React, { useCallback, useEffect, useState } from 'react';
import styles from './Resizer.module.css';

interface ResizerProps {
    direction: 'horizontal' | 'vertical';
    onResize: (delta: number) => void;
}

const Resizer: React.FC<ResizerProps> = ({ direction, onResize }) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            // horizontal は右側パネルの左端をドラッグする前提なので、右へ動かす(deltaX > 0)と幅は縮む -> 逆向きのデルタ
            // vertical は下側パネルの上端をドラッグする前提なので、下へ動かす(deltaY > 0)と高さは縮む -> 逆向きのデルタ
            const delta = direction === 'horizontal' ? -e.movementX : -e.movementY;
            onResize(delta);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        
        // ドラッグ中のカーソル固定
        document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
        };
    }, [isDragging, direction, onResize]);

    return (
        <div
            className={`${styles.resizer} ${styles[direction]}`}
            onMouseDown={handleMouseDown}
        />
    );
};

export default Resizer;
