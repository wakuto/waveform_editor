declare module 'wavedrom' {
    type OnmlNode = [string, Record<string, unknown>, ...unknown[]];

    function renderAny(
        index: number,
        source: Record<string, unknown>,
        skin: Record<string, unknown>,
        notFirstSignal?: boolean
    ): OnmlNode;

    const onml: {
        stringify(node: OnmlNode): string;
        tt(...args: unknown[]): unknown;
    };

    const waveSkin: Record<string, Record<string, unknown>>;

    export { renderAny, onml, waveSkin };
}

declare module 'wavedrom/skins/default.js' {
    const skin: Record<string, unknown>;
    export = skin;
}
