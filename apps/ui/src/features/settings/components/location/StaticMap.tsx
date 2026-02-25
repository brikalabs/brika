import { MapPin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const MAP_ZOOM = 15;
const MAP_HEIGHT = 200;
const TILE_SIZE = 256;

function latLngToTile(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom;
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

interface StaticMapProps {
  latitude: number;
  longitude: number;
}

export function StaticMap({ latitude, longitude }: Readonly<StaticMapProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { x: tileX, y: tileY } = latLngToTile(latitude, longitude, MAP_ZOOM);
  const centerTileX = Math.floor(tileX);
  const centerTileY = Math.floor(tileY);
  const fracX = tileX - centerTileX;
  const fracY = tileY - centerTileY;

  const cols = width > 0 ? Math.ceil(width / TILE_SIZE) + 2 : 0;
  const rows = Math.ceil(MAP_HEIGHT / TILE_SIZE) + 2;
  const halfCol = Math.floor(cols / 2);
  const halfRow = Math.floor(rows / 2);

  const offsetX = width / 2 - (fracX + halfCol) * TILE_SIZE;
  const offsetY = MAP_HEIGHT / 2 - (fracY + halfRow) * TILE_SIZE;

  const tiles: Array<{ key: string; tx: number; ty: number; left: number; top: number }> = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tx = centerTileX - halfCol + col;
      const ty = centerTileY - halfRow + row;
      tiles.push({
        key: `${tx}-${ty}`,
        tx,
        ty,
        left: offsetX + col * TILE_SIZE,
        top: offsetY + row * TILE_SIZE,
      });
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-md"
      style={{ height: MAP_HEIGHT }}
    >
      {tiles.map((t) => {
        const src = `https://a.basemaps.cartocdn.com/rastertiles/voyager/${MAP_ZOOM}/${t.tx}/${t.ty}.png`;
        const src2x = `https://a.basemaps.cartocdn.com/rastertiles/voyager/${MAP_ZOOM}/${t.tx}/${t.ty}@2x.png`;
        return (
          <img
            key={t.key}
            src={src}
            srcSet={`${src} 1x, ${src2x} 2x`}
            alt=""
            width={TILE_SIZE}
            height={TILE_SIZE}
            className="absolute"
            style={{ left: t.left, top: t.top }}
            loading="lazy"
            draggable={false}
          />
        );
      })}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <MapPin className="size-8 text-primary drop-shadow-md" style={{ marginTop: -16 }} />
      </div>
      <span className="absolute right-1 bottom-1 rounded bg-white/70 px-1 text-[10px] text-gray-600 dark:bg-black/50 dark:text-gray-300">
        {'© '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="hover:underline"
        >
          OSM
        </a>
        {' © '}
        <a
          href="https://carto.com/attributions"
          target="_blank"
          rel="noreferrer"
          className="hover:underline"
        >
          CARTO
        </a>
      </span>
    </div>
  );
}
