export function enableWheelZoom(viewport, slider, scrollContent = null) {
    viewport.addEventListener('wheel', event => {
        if (event.deltaY === 0) return;
        event.preventDefault();
        const step = Number(slider.step) || 0.1;
        const value = Number(slider.value);
        const next = Math.max(Number(slider.min), Math.min(Number(slider.max),
            Number((value + (event.deltaY < 0 ? step : -step)).toFixed(3))));
        if (next === value) return;

        const before = scrollContent?.getBoundingClientRect();
        const position = before && {
            x: (event.clientX - before.left) / before.width,
            y: (event.clientY - before.top) / before.height,
        };
        slider.value = String(next);
        slider.dispatchEvent(new Event('input', {bubbles: true}));
        if (position) {
            const after = scrollContent.getBoundingClientRect();
            viewport.scrollLeft += after.left + position.x * after.width - event.clientX;
            viewport.scrollTop += after.top + position.y * after.height - event.clientY;
        }
    }, {passive: false});
}


export function enableDragPan(viewport, move = (dx, dy) => {
    viewport.scrollLeft -= dx;
    viewport.scrollTop -= dy;
}) {
    let drag = null;
    viewport.style.cursor = 'grab';
    viewport.style.touchAction = 'none';
    viewport.style.userSelect = 'none';
    viewport.addEventListener('dragstart', event => event.preventDefault());
    viewport.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.button !== 0) return;
        drag = {id: event.pointerId, x: event.clientX, y: event.clientY};
        viewport.setPointerCapture(event.pointerId);
        viewport.style.cursor = 'grabbing';
        event.preventDefault();
    });
    viewport.addEventListener('pointermove', event => {
        if (!drag || drag.id !== event.pointerId) return;
        move(event.clientX - drag.x, event.clientY - drag.y);
        drag.x = event.clientX;
        drag.y = event.clientY;
    });
    const release = event => {
        if (!drag || drag.id !== event.pointerId) return;
        drag = null;
        viewport.style.cursor = 'grab';
        if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    };
    viewport.addEventListener('pointerup', release);
    viewport.addEventListener('pointercancel', release);
    viewport.addEventListener('lostpointercapture', release);
}
