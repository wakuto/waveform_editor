import React, { useEffect } from 'react';
import Toolbar from './components/Toolbar/Toolbar';
import WaveformCanvas from './components/WaveformCanvas/WaveformCanvas';
import JsonEditor from './components/JsonEditor/JsonEditor';
import StatusBar from './components/StatusBar/StatusBar';
import { useWaveformStore } from './store/useWaveformStore';
import type { WaveTool } from './types/wavedrom';
import styles from './App.module.css';

const KEY_TOOL_MAP: Record<string, WaveTool> = {
  '0': '0',
  '1': '1',
  'p': 'p',
  'n': 'n',
  'x': 'x',
  'z': 'z',
  'd': '=',
  '.': '.',
  '|': '|',
};

const App: React.FC = () => {
  const jsonPanelVisible = useWaveformStore((s) => s.jsonPanelVisible);
  const undo = useWaveformStore((s) => s.undo);
  const redo = useWaveformStore((s) => s.redo);
  const setSelectedTool = useWaveformStore((s) => s.setSelectedTool);
  const setWaveformData = useWaveformStore((s) => s.setWaveformData);
  const waveformData = useWaveformStore((s) => s.waveformData);
  const selectedSignalIndex = useWaveformStore((s) => s.selectedSignalIndex);
  const removeSignal = useWaveformStore((s) => s.removeSignal);

  // LocalStorageからの復元（初回マウント時のみ）
  useEffect(() => {
    const saved = localStorage.getItem('waveform-editor-data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.signal)) {
          setWaveformData(parsed, false);
        }
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // LocalStorageへの自動保存
  useEffect(() => {
    localStorage.setItem('waveform-editor-data', JSON.stringify(waveformData));
  }, [waveformData]);

  // キーボードショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if ((e.key === 'z' && e.shiftKey) || e.key === 'Z') { e.preventDefault(); redo(); return; }
        if (e.key === 's') {
          e.preventDefault();
          const json = JSON.stringify(waveformData, null, 2);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'waveform.json'; a.click();
          URL.revokeObjectURL(url);
          return;
        }
        return;
      }

      if (e.key === 'Delete' && selectedSignalIndex !== null) {
        removeSignal(selectedSignalIndex);
        return;
      }

      const tool = KEY_TOOL_MAP[e.key.toLowerCase()];
      if (tool) setSelectedTool(tool);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, setSelectedTool, waveformData, selectedSignalIndex, removeSignal]);

  return (
    <div className={styles.app}>
      <Toolbar />
      <div className={styles.main}>
        <WaveformCanvas />
        {jsonPanelVisible && <JsonEditor />}
      </div>
      <StatusBar />
    </div>
  );
};

export default App;
