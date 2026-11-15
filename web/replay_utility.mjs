const labels = {smoke:'Smoke', flash:'Flash', fire:'Lửa'};
const colors = {smoke:'#b6c5d7', flash:'#fff1a0', fire:'#ff8838'};
const utilityByDemo = new Map();

export async function replayUtility(round) {
    if (round.metadata.game?.toUpperCase() !== 'CS2') return null;
    const demoId = round.metadata.demo_id;
    if (!utilityByDemo.has(demoId)) {
        const fileId = encodeURIComponent(demoId.replace(/^cs2_/, ''));
        utilityByDemo.set(demoId, fetch('data/utility-'+fileId+'.json').then(response => {
            if (response.status === 404) return null;
            if (!response.ok) throw Error('Cannot load utility data');
            return response.json();
        }).catch(error => { utilityByDemo.delete(demoId); throw error; }));
    }
    const data = await utilityByDemo.get(demoId);
    return data?.[round.metadata.round_id] ?? null;
}

export function utilityControls(round, effects, seek, redraw) {
    const panel = document.querySelector('#replay-utility');
    panel.replaceChildren();
    panel.hidden = !effects?.length;
    if (panel.hidden) return;
    for (const [kind, name] of Object.entries(labels)) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = true;
        input.dataset.utility = kind;
        label.append(input, ' '+name);
        panel.append(label);
        input.addEventListener('change', () => {
            for (const marker of panel.querySelectorAll('button[data-kind="'+kind+'"]')) marker.hidden = !input.checked;
            redraw();
        });
    }
    const timeline = document.createElement('div');
    timeline.className = 'utility-timeline';
    timeline.setAttribute('aria-label', 'Mốc utility phát tác');
    const {start_tick, end_tick, tick_rate} = round.metadata;
    for (const e of effects) {
        const marker = document.createElement('button');
        const seconds = (e.start_tick-start_tick)/tick_rate;
        marker.type = 'button';
        marker.dataset.kind = e.kind;
        marker.style.left = (100*(e.start_tick-start_tick)/(end_tick-start_tick))+'%';
        marker.style.backgroundColor = colors[e.kind];
        marker.title = labels[e.kind]+' · '+seconds.toFixed(1)+'s';
        marker.setAttribute('aria-label', marker.title);
        marker.addEventListener('click', () => seek(Math.ceil(seconds)));
        timeline.append(marker);
    }
    panel.append(timeline);
}

function utilityIcon(kind) {
    if (kind === 'smoke') {
        return `<path d="M-21 13C-31 13-33-1-24-6C-24-15-15-21-7-17C-2-27 13-26 17-15C27-16 33-7 29 2C33 8 28 15 20 15Z" fill="#edf4fc" stroke="#536479" stroke-width="2.5"/>
                <path d="M-21 8C-25 5-24-1-20-3M-8-12C-4-17 3-18 7-15" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`;
    }
    if (kind === 'fire') {
        return `<path d="M-21 6C-21-5-12-9-13-19C-7-17-4-12-4-7C4-12 8-19 6-27C20-17 23-6 22 5C21 17 13 24 0 24C-13 24-21 17-21 6Z" fill="#ff872e" stroke="#74301a" stroke-width="2.5"/>
                <path d="M-10 12C-10 6-3 2 0-5C7-2 11 5 11 11C11 17 6 21 0 21C-6 21-10 18-10 12Z" fill="#ffdb55"/>`;
    }
    return `<path d="M0-26L5-8L19-18L12-4L28 0L12 5L19 18L5 10L0 27L-5 10L-19 18L-12 5L-28 0L-12-4L-19-18L-5-8Z" fill="#fff2a7" stroke="#80662a" stroke-width="2"/>
            <circle r="6" fill="#fff"/>`;
}

export function renderUtility(effects, meta, radar, seconds) {
    const layer = document.querySelector('#utility-layer');
    if (!effects?.length || !radar || !meta || seconds >= (meta.end_tick-meta.start_tick)/meta.tick_rate) {
        layer.replaceChildren();
        return;
    }
    const tick = meta.start_tick + seconds*meta.tick_rate;
    const enabled = new Set([...document.querySelectorAll('#replay-utility input:checked')].map(input => input.dataset.utility));
    const active = effects.filter(e => enabled.has(e.kind)
        && e.start_tick <= tick && tick < (e.end_tick ?? e.start_tick+meta.tick_rate));
    layer.innerHTML = active.map(e => {
        const x = (e.x-radar.x)/radar.scale;
        const y = (radar.y-e.y)/radar.scale;
        return `<g data-effect="${e.kind}" transform="translate(${x} ${y})">
            <title>${labels[e.kind]}</title>${utilityIcon(e.kind)}
        </g>`;
    }).join('');
}
