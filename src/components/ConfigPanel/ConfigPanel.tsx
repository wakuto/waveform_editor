import React from 'react';
import { useWaveformStore } from '../../store/useWaveformStore';
import styles from './ConfigPanel.module.css';
import { useI18n } from '../../i18n';

const ConfigPanel: React.FC = () => {
    const { t } = useI18n();
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
            <div className={styles.header}>{t('config.header')}</div>
            <div className={styles.content}>
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>{t('config.head')}</div>
                    <div className={styles.field}>
                        <label>{t('config.label.text')}:</label>
                        <input type="text" value={waveformData.head?.text || ''} onChange={handleHeadTextChange} placeholder={t('config.placeholder.title')} />
                    </div>
                    <div className={styles.field}>
                        <label>{t('config.label.tick')}:</label>
                        <input type="number" value={waveformData.head?.tick ?? ''} onChange={handleHeadTickChange} placeholder={t('config.placeholder.startTick')} />
                    </div>
                    <div className={styles.field}>
                        <label>{t('config.label.tock')}:</label>
                        <input type="number" value={waveformData.head?.tock ?? ''} onChange={handleHeadTockChange} placeholder={t('config.placeholder.startTock')} />
                    </div>
                    <div className={styles.field}>
                        <label>{t('config.label.every')}:</label>
                        <input type="number" value={waveformData.head?.every ?? ''} onChange={handleHeadEveryChange} placeholder={t('config.placeholder.tickInterval')} />
                    </div>
                </div>

                <div className={styles.section}>
                    <div className={styles.sectionTitle}>{t('config.foot')}</div>
                    <div className={styles.field}>
                        <label>{t('config.label.text')}:</label>
                        <input type="text" value={waveformData.foot?.text || ''} onChange={handleFootTextChange} placeholder={t('config.placeholder.footerText')} />
                    </div>
                    <div className={styles.field}>
                        <label>{t('config.label.tick')}:</label>
                        <input type="number" value={waveformData.foot?.tick ?? ''} onChange={handleFootTickChange} placeholder={t('config.placeholder.startTick')} />
                    </div>
                    <div className={styles.field}>
                        <label>{t('config.label.tock')}:</label>
                        <input type="number" value={waveformData.foot?.tock ?? ''} onChange={handleFootTockChange} placeholder={t('config.placeholder.startTock')} />
                    </div>
                    <div className={styles.field}>
                        <label>{t('config.label.every')}:</label>
                        <input type="number" value={waveformData.foot?.every ?? ''} onChange={handleFootEveryChange} placeholder={t('config.placeholder.tickInterval')} />
                    </div>
                </div>

                <div className={styles.section}>
                    <div className={styles.sectionTitle}>{t('config.body')}</div>
                    <div className={styles.field}>
                        <label>{t('config.label.hscale')}:</label>
                        <input type="number" value={waveformData.config?.hscale ?? ''} onChange={handleConfigHscaleChange} placeholder={t('config.placeholder.hscale')} />
                    </div>
                    <div className={styles.field}>
                        <label>{t('config.label.skin')}:</label>
                        <select value={waveformData.config?.skin || ''} onChange={handleConfigSkinChange}>
                            <option value="">{t('config.skin.default')}</option>
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
