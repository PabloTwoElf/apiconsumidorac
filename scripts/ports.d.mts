/** Tipos de scripts/ports.mjs, para poder importarlo desde vite.config.ts. */

export type ServiceKind = 'seat-api' | 'otra-api' | 'vite' | 'desconocido';

export interface Service {
  port: number;
  /** URL base con `localhost`, lista para usar en configuración. */
  base: string;
  kind: ServiceKind;
  detail: string;
}

export interface Scan {
  seatApi: Service | null;
  viteApps: Service[];
  otherApis: Service[];
  unknown: Service[];
  all: Service[];
}

export declare const CANDIDATES: {
  seatApi: number[];
  mainFrontend: number[];
  mainBackend: number[];
  demoFrontend: number[];
};

export declare function identify(port: number): Promise<Service | null>;
export declare function findSeatApi(ports?: number[]): Promise<Service | null>;
export declare function scanAll(): Promise<Scan>;
