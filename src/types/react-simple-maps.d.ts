declare module 'react-simple-maps' {
  import type { CSSProperties, ReactElement, ReactNode, SVGProps } from 'react';

  export type GeographyType = {
    rsmKey: string;
    id?: string | number;
    properties?: Record<string, unknown>;
  };

  export function ComposableMap(
    props: SVGProps<SVGSVGElement> & {
      height?: number;
      projection?: string;
      projectionConfig?: Record<string, unknown>;
      width?: number;
      children?: ReactNode;
    },
  ): ReactElement;

  export function ZoomableGroup(
    props: SVGProps<SVGGElement> & {
      center?: [number, number];
      maxZoom?: number;
      minZoom?: number;
      onMoveEnd?: (position: { coordinates: [number, number]; zoom: number }) => void;
      translateExtent?: [[number, number], [number, number]];
      zoom?: number;
      children?: ReactNode;
    },
  ): ReactElement;

  export function Geographies(props: {
    geography: string | Record<string, unknown>;
    children: (payload: { geographies: GeographyType[] }) => ReactNode;
  }): ReactElement;

  export function Geography(
    props: SVGProps<SVGPathElement> & {
      geography: GeographyType;
      style?: Record<string, CSSProperties>;
    },
  ): ReactElement;
}
