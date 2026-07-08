interface LegacyCode {
    color?: string;
    style?: string;
    class?: string;
}

const LEGACY_CODES: Record<string, LegacyCode> = {
    '0': { color: '#000000' }, '1': { color: '#0000AA' }, '2': { color: '#00AA00' }, '3': { color: '#00AAAA' },
    '4': { color: '#AA0000' }, '5': { color: '#AA00AA' }, '6': { color: '#FFAA00' }, '7': { color: '#AAAAAA' },
    '8': { color: '#555555' }, '9': { color: '#5555FF' }, 'a': { color: '#55FF55' }, 'b': { color: '#55FFFF' },
    'c': { color: '#FF5555' }, 'd': { color: '#FF55FF' }, 'e': { color: '#FFFF55' }, 'f': { color: '#FFFFFF' },
    'l': { style: 'font-weight: bold;' },
    'm': { style: 'text-decoration: line-through;' },
    'n': { style: 'text-decoration: underline;' },
    'o': { style: 'font-style: italic;' },
    'k': { class: 'obfuscated' }
};

const JSON_NAME_COLOR_MAP: Record<string, string> = {
    'black': '#000000', 'dark_blue': '#0000AA', 'dark_green': '#00AA00', 'dark_aqua': '#00AAAA',
    'dark_red': '#AA0000', 'dark_purple': '#AA00AA', 'gold': '#FFAA00', 'gray': '#AAAAAA',
    'dark_gray': '#555555', 'blue': '#5555FF', 'green': '#55FF55', 'aqua': '#55FFFF',
    'red': '#FF5555', 'light_purple': '#FF55FF', 'yellow': '#FFFF55', 'white': '#FFFFFF',
};

/** 仅允许命名色或 #rgb / #rrggbb / #rrggbbaa，防止 JSON MOTD 的 color 字段注入 style/HTML。 */
function safeJsonMotdColor(raw: string | undefined): string | null {
    if (raw == null || typeof raw !== 'string') {return null;}
    const key = raw.trim().toLowerCase();
    if (!key) {return null;}
    const named = JSON_NAME_COLOR_MAP[key];
    if (named) {return named;}
    const s = raw.trim();
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) {return s;}
    return null;
}

function escapeHtml(text: string): string {
    if (typeof document === 'undefined') {
        return text.replace(/&/g, '&amp;')
                   .replace(/</g, '&lt;')
                   .replace(/>/g, '&gt;')
                   .replace(/"/g, '&quot;')
                   .replace(/'/g, '&#39;');
    }
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function parseLegacyMotd(str: string): string {
    if (!str) {return '';}
    const parts = str.split('§');
    let html = `<span>${escapeHtml(parts[0])}</span>`;
    let activeStyles: string[] = [];
    const activeClasses = new Set<string>();

    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (!part) {continue;}

        const code = part[0].toLowerCase();
        const text = part.substring(1);
        let isObfuscated = activeClasses.has('obfuscated');

        if (code === 'r') {
            activeStyles = [];
            activeClasses.clear();
            isObfuscated = false;
        } else {
            const format = LEGACY_CODES[code];
            if (format) {
                if (format.color) {
                    activeStyles = [`color: ${format.color};`];
                    activeClasses.clear();
                }
                if (format.style) {activeStyles.push(format.style);}
                if (format.class) {
                    activeClasses.add(format.class);
                    if (format.class === 'obfuscated') {isObfuscated = true;}
                }
            }
        }

        if (text) {
            const styleAttr = activeStyles.length > 0 ? `style="${[...new Set(activeStyles)].join(' ')}"` : '';
            const classAttr = activeClasses.size > 0 ? `class="${[...activeClasses].join(' ')}"` : '';

            if (isObfuscated) {
                for (let j = 0; j < text.length; j++) {
                    html += `<span ${styleAttr} ${classAttr}></span>`;
                }
            } else {
                html += `<span ${styleAttr} ${classAttr}>${escapeHtml(text)}</span>`;
            }
        }
    }
    return html;
}

export interface MotdJson {
    text?: string;
    extra?: (string | MotdJson)[];
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underlined?: boolean;
    strikethrough?: boolean;
    obfuscated?: boolean;
}

export function parseJsonComponent(component: string | MotdJson): string {
    if (typeof component === 'string') {return parseLegacyMotd(component);}
    if (typeof component !== 'object' || component === null) {return '';}

    let content = '';
    if (Array.isArray(component.extra)) {
        content = component.extra.map((c) => parseJsonComponent(c)).join('');
    }

    if (typeof component.text === 'string' && component.text) {
        if (component.obfuscated) {
            let tempContent = '';
            for (let i = 0; i < component.text.length; i++) {
                tempContent += '<span></span>';
            }
            content += tempContent;
        } else {
            content += parseLegacyMotd(component.text);
        }
    }

    if (content === '') {return '';}

    let style = '';
    const safeColor = safeJsonMotdColor(component.color);
    if (safeColor) {
        style += `color: ${safeColor};`;
    }
    if (component.bold) {style += 'font-weight: bold;';}
    if (component.italic) {style += 'font-style: italic;';}
    if (component.underlined) {style += 'text-decoration: underline;';}
    if (component.strikethrough) {style += 'text-decoration: line-through;';}

    return `<span style="${style}">${content}</span>`;
}

export function parseMotdToHtml(motd: string | MotdJson | (string | MotdJson)[]): string {
    if (!motd) {return '';}
    if (typeof motd === 'string') {return parseLegacyMotd(motd);}
    if (Array.isArray(motd)) {return motd.map(line => parseJsonComponent(line)).join('<br>');}
    return parseJsonComponent(motd);
}
