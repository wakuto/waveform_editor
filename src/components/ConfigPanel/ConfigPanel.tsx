import React from 'react';
import { useWaveformStore } from '../../store/useWaveformStore';
import styles from './ConfigPanel.module.css';

const ConfigPanel: React.FC = () => {
    const waveformData = useWaveformStore((s) => s.waveformData);
    const setWaveformData = useWaveformStore((s) => s.setWaveformData);

    const handleHeadTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newData = { ...waveformData };
        if (!newData.head) newData.head = {};
        newData.head.text = e.target.value;
        if (!newData.head.text) delete newData.head.text;
        if (Object.keys(newData.head).length === 0) delete newData.head;
        setWaveformData(newData);
    };

    const handleHeadTickChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newData = { ...waveformData };
        if (!newData.head) newData.head = {};
        const val = parseInt(e.target.value, 10);
        if (isNaN(val)) delete newData.head.tick;
        else newData.head.tick = val;
        if (Object.keys(newData.head).length === 0) delete newData.head;
        setWaveformData(newData);
    };

    const handleHeadTockChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newData = { ...waveformData };
        if (!newData.head) newData.head = {};
        const val = parseInt(e.target.value, 10);
        if (isNaN(val)) delete newData.head.tock;
        else newData.head.tock = val;
        if (Object.keys(newData.head).length === 0) delete newData.head;
        setWaveformData(newData);
    };

    const handleHeadEveryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newData = { ...waveformData };
        if (!newData.head) newData.head = {};
        const val = parseInt(e.target.value, 10);
        if (isNaN(val)) delete newData.head.every;
        else newData.head.every = val;
        if (Object.keys(newData.head).length === 0) delete newData.head;
        setWaveformData(newData);
    };

    const handleFootTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newData = { ...waveformData };
        if (!newData.foot) newData.foot = {};
        newData.foot.text = e.target.value;
        if (!newData.foot.text) delete newData.foot.text;
        if (Object.keys(newData.foot).length === 0) delete newData.foot;
        setWaveformData(newData);
    };

    const handleFootTickChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newData = { ...waveformData };
        if (!newData.foot) newData.foot = {};
        const val = parseInt(e.target.value, 10);
        if (isNaN(val)) delete newData.foot.tick;
        else newData.foot.tick = val;
        if (Object.keys(newData.foot).length === 0) delete newData.foot;
        setWaveformData(newData);
    };

    const handleFootTockChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newData = { ...waveformData };
        if (!newData.foot) newData.foot = {};
        const val = parseInt(e.target.value, 10);
        if (isNaN(val)) delete newData.foot.tock;
        else newData.foot.tock = val;
        if (Object.keys(newData.foot).length === 0) delete newData.foot;
        setWaveformData(newData);
    };

    const handleFootEveryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newData = { ...waveformData };
        if (!newData.foot) newData.foot = {};
        const val = parseInt(e.target.value, 10);
        if (isNaN(val)) delete newData.foot.every;
        else newData.foot.every = val;
        if (Object.keys(newData.foot).length === 0) delete newData.foot;
        setWaveformData(newData);
    };

    const handleConfigHscaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newData = { ...waveformData };
        if (!newData.config) newData.config = {};
        const val = parseInt(e.target.value, 10);
        if (isNaN(val)) delete newData.config.hscale;
        else newData.config.hscale = val;
        if (Object.keys(newData.config).length === 0) delete newData.config;
        setWaveformData(newData);
    };

    const handleConfigSkinChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newData = { ...waveformData };
        if (!newData.config) newData.config = {};
        newData.config.skin = e.target.value;
        if (!newData.config.skin) delete newData.config.skin;
        if (Object.keys(newData.config).length === 0) delete newData.config;
        setWaveformData(newData);
    };

    return (
        <div className={styles.configPanel}>
            <div className={styles.header}>設定 (head / foot / config)</div>
            <div className={styles.content}>
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>Head</div>
                    <div className={styles.field}>
                        <label>Text:</label>
                        <input type="text" value={waveformData.head?.text || ''} onChange={handleHeadTextChange} placeholder="Title" />
                    </div>
                    <div className={styles.field}>
                        <label>Tick:</label>
                        <input type="number" value={waveformData.head?.tick ?? ''} onChange={handleHeadTickChange} placeholder="Start tick" />
                    </div>
                    <div className={styles.field}>
                        <label>Tock:</label>
                        <input type="number" value={waveformData.head?.tock ?? ''} onChange={handleHeadTockChange} placeholder="Start tock" />
                    </div>
                    <div className={styles.field}>
                        <label>Every:</label>
                        <input type="number" value={waveformData.head?.every ?? ''} onChange={handleHeadEveryChange} placeholder="Tick interval" />
                    </div>
                </div>

                <div className={styles.section}>
                    <div className={styles.sectionTitle}>Foot</div>
                    <div className={styles.field}>
                        <label>Text:</label>
                        <input type="text" value={waveformData.foot?.text || ''} onChange={handleFootTextChange} placeholder="Footer text" />
                    </div>
                    <div className={styles.field}>
                        <label>Tick:</label>
                        <input type="number" value={waveformData.foot?.tick ?? ''} onChange={handleFootTickChange} placeholder="Start tick" />
                    </div>
                    <div className={styles.field}>
                        <label>Tock:</label>
                        <input type="number" value={waveformData.foot?.tock ?? ''} onChange={handleFootTockChange} placeholder="Start tock" />
                    </div>
                    <div className={styles.field}>
                        <label>Every:</label>
                        <input type="number" value={waveformData.foot?.every ?? ''} onChange={handleFootEveryChange} placeholder="Tick interval" />
                    </div>
                </div>

                <div className={styles.section}>
                    <div className={styles.sectionTitle}>Config</div>
                    <div className={styles.field}>
                        <label>HScale:</label>
                        <input type="number" value={waveformData.config?.hscale ?? ''} onChange={handleConfigHscaleChange} placeholder="Horizontal scale" />
                    </div>
                    <div className={styles.field}>
                        <label>Skin:</label>
                        <select value={waveformData.config?.skin || ''} onChange={handleConfigSkinChange}>
                            <option value="">Default</option>
                            <option value="narrow">Narrow</option>
                            <option value="lowkey">Lowkey</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfigPanel;
