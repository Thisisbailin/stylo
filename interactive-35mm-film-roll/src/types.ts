export type FilmFilter = 'positive' | 'negative' | 'grayscale' | 'vintage' | 'cyanotype' | 'sunset';

export interface FilmFrame {
  id: string;
  index: number; // e.g., 1, 2, 3...
  imageUrl: string | null;
  filter: FilmFilter;
  label?: string;
  date?: string;
  isScanned?: boolean;
}

export interface FilmRoll {
  id: string;
  frames: FilmFrame[];
  splitIndex?: number; // index of where it was split, if any
}

export interface PhysicsParams {
  stiffness: number;
  damping: number;
  mass: number;
  rotationMultiplier: number;
  filmstripHeight?: number;
  frameWidth?: number;
  closedWidth?: number;
  openWidth?: number;
}

export type CanisterBrand = 'retro-yellow' | 'fuji-green' | 'ilford-black' | 'agfa-red';

export interface CanisterStyle {
  id: CanisterBrand;
  name: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  brandText: string;
  iso: number;
  exp: number;
}
