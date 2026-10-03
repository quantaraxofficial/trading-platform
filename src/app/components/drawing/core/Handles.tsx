import React, { forwardRef, useLayoutEffect, useRef } from 'react';
import { Circle, Rect } from 'react-konva';

// A shape's drag handle. Konva keeps a dragged node on the raw cursor and react-konva only
// re-applies x/y when they change, so a plain handle stays stuck to the mouse mid-drag
// (off the edge it belongs to, or between candles). These put the handle back where the
// shape says it is after every move, so it only travels along its own path.
function useHandlePosition(props: { x?: number; y?: number; onDragMove?: (e: any) => void }, fwd: React.ForwardedRef<any>) {
  const node = useRef<any>(null);
  const pos = useRef({ x: 0, y: 0 });
  pos.current = { x: props.x ?? 0, y: props.y ?? 0 };

  useLayoutEffect(() => {
    const n = node.current;
    if (n && (n.x() !== pos.current.x || n.y() !== pos.current.y)) n.position(pos.current);
  });

  const ref = (n: any) => {
    node.current = n;
    if (typeof fwd === 'function') fwd(n);
    else if (fwd) fwd.current = n;
  };
  const onDragMove = (e: any) => {
    props.onDragMove?.(e);
    // The shape's re-render moves it on if the point changed; until then it stays put
    e.target.position(pos.current);
  };
  return { ref, onDragMove };
}

export const HandleCircle = forwardRef<any, React.ComponentProps<typeof Circle>>((props, fwd) => {
  const h = useHandlePosition(props, fwd);
  return <Circle {...props} ref={h.ref} onDragMove={h.onDragMove} />;
});
HandleCircle.displayName = 'HandleCircle';

export const HandleRect = forwardRef<any, React.ComponentProps<typeof Rect>>((props, fwd) => {
  const h = useHandlePosition(props, fwd);
  return <Rect {...props} ref={h.ref} onDragMove={h.onDragMove} />;
});
HandleRect.displayName = 'HandleRect';
