import type { WaveDromData, WaveSignalOrGroup, WaveSignal } from '../types/wavedrom';

export function formatWaveDromJSON(data: WaveDromData): string {
    // 1. まず、すべての信号の "name" の長さを調べて、"wave" の開始位置を揃えるための最大長を計算する
    // ネストの深さによるインデントの増加分も考慮する
    let maxNameLen = 0;

    const traverseForMaxLen = (items: WaveSignalOrGroup[], depth: number) => {
        for (const item of items) {
            if (Array.isArray(item)) {
                traverseForMaxLen(item.slice(1) as WaveSignalOrGroup[], depth + 1);
            } else if (item && typeof (item as WaveSignal).name === 'string') {
                const name = (item as WaveSignal).name;
                // JSON.stringify されたときの長さを考慮
                const nameStrLen = JSON.stringify(name).length;
                // ネストの深さによるインデントの増加分 (depth * 2) を加算
                maxNameLen = Math.max(maxNameLen, nameStrLen + depth * 2);
            }
        }
    };

    if (Array.isArray(data.signal)) {
        traverseForMaxLen(data.signal, 0);
    }

    // 2. カスタムフォーマットで文字列化
    const formatSignalArray = (items: WaveSignalOrGroup[], indentLevel: number, depth: number): string => {
        const innerIndent = '  '.repeat(indentLevel + 1);

        const lines: string[] = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const isLast = i === items.length - 1;
            const comma = isLast ? '' : ',';

            if (Array.isArray(item)) {
                const groupName = JSON.stringify(item[0]);
                const children = item.slice(1) as WaveSignalOrGroup[];
                if (children.length === 0) {
                    lines.push(`${innerIndent}[${groupName}]${comma}`);
                } else {
                    lines.push(`${innerIndent}[${groupName},`);
                    lines.push(formatSignalArray(children, indentLevel + 1, depth + 1));
                    lines.push(`${innerIndent}]${comma}`);
                }
            } else if (item && typeof (item as WaveSignal).wave === 'string') {
                const sig = item as WaveSignal;
                const nameStr = JSON.stringify(sig.name || '');
                // 現在のネストの深さによるインデント分を引いた長さでパディングする
                const targetLen = maxNameLen - (depth * 2);
                const paddedName = nameStr.padEnd(targetLen, ' ');

                // name と wave 以外のプロパティを抽出
                const rest = { ...sig } as Record<string, unknown>;
                delete rest.name;
                delete rest.wave;

                let line = `{ "name": ${paddedName}, "wave": ${JSON.stringify(sig.wave)}`;

                // その他のプロパティ（dataなど）を追加
                const restKeys = Object.keys(rest);
                if (restKeys.length > 0) {
                    for (const key of restKeys) {
                        line += `, ${JSON.stringify(key)}: ${JSON.stringify(rest[key])}`;
                    }
                }

                line += ` }${comma}`;
                lines.push(`${innerIndent}${line}`);
            } else {
                // 空のオブジェクトなど
                lines.push(`${innerIndent}${JSON.stringify(item)}${comma}`);
            }
        }

        return lines.join('\n');
    };

    // 全体を構築
    const rootKeys = Object.keys(data).filter(k => k !== 'signal');

    let result = '{\n';

    if (Array.isArray(data.signal)) {
        result += '  "signal": [\n';
        result += formatSignalArray(data.signal, 1, 0) + '\n';
        result += `  ]${rootKeys.length > 0 ? ',' : ''}\n`;
    } else {
        result += `  "signal": ${JSON.stringify(data.signal)}${rootKeys.length > 0 ? ',' : ''}\n`;
    }

    for (let i = 0; i < rootKeys.length; i++) {
        const key = rootKeys[i];
        const isLast = i === rootKeys.length - 1;
        const comma = isLast ? '' : ',';
        // signal 以外のプロパティは通常の JSON.stringify で整形（インデント付き）
        const valStr = JSON.stringify((data as unknown as Record<string, unknown>)[key], null, 2).split('\n').map((l, idx) => idx === 0 ? l : '  ' + l).join('\n');
        result += `  ${JSON.stringify(key)}: ${valStr}${comma}\n`;
    }

    result += '}\n';

    return result;
}
