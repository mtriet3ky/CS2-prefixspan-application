export function plantedBomb(round) {
    const {start_tick, end_tick, tick_rate} = round.metadata;
    const events = round.events ?? [];
    const plant = events.find(e => e.source === 'bomb_planted'
        && Number.isFinite(e.x) && Number.isFinite(e.y)
        && e.tick >= start_tick && e.tick < end_tick);
    if (!plant) return null;

    let endTick = end_tick;
    for (const event of events) {
        if (event.tick >= plant.tick && ['bomb_defused', 'bomb_exploded'].includes(event.source)) {
            endTick = Math.min(endTick, event.tick);
        }
    }
    for (const frame of round.frames ?? []) {
        const bomb = frame.bomb_context;
        if (frame.tick < plant.tick || bomb?.source !== 'CPlantedC4_observed'
            || !Number.isFinite(bomb.bomb_source_tick) || bomb.bomb_source_tick < plant.tick
            || !Number.isFinite(bomb.bomb_seconds_remaining) || bomb.bomb_seconds_remaining <= 0) continue;
        endTick = Math.min(endTick, bomb.bomb_source_tick + Math.round(bomb.bomb_seconds_remaining * tick_rate));
        break;
    }
    return {x: plant.x, y: plant.y, startTick: plant.tick, endTick};
}

let rendered = '';

export function renderBomb(bomb, meta, radar, seconds) {
    let markup = '';
    if (bomb && radar && meta) {
        const tick = meta.start_tick + seconds * meta.tick_rate;
        if (bomb.startTick <= tick && tick < bomb.endTick) {
            const x = (bomb.x - radar.x) / radar.scale;
            const y = (radar.y - bomb.y) / radar.scale;
            markup = `<g data-effect="planted-bomb" transform="translate(${x} ${y})">
                <title>Bom C4 đã đặt</title>
                <circle r="21" fill="#bd263b" stroke="#fff0f1" stroke-width="2"/>
                <image href="assets/equipment/c4.svg" x="-10" y="-16" width="20" height="32"/>
            </g>`;
        }
    }
    if (markup !== rendered) {
        document.querySelector('#bomb-layer').innerHTML = markup;
        rendered = markup;
    }
}
