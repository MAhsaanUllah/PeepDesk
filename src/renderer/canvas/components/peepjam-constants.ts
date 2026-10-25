export interface PastelColor {
  name: string;
  bg: string;
  border: string;
  text: string;
}

export const PEEPJAM_PASTELS: PastelColor[] = [
  { name: 'Yellow', bg: '#FFF385', border: '#EBD734', text: '#2A2700' },
  { name: 'Green', bg: '#85E0A3', border: '#54C47B', text: '#053816' },
  { name: 'Blue', bg: '#8CE8FF', border: '#45CBE8', text: '#033440' },
  { name: 'Pink', bg: '#FFC7C7', border: '#EB9494', text: '#4A1111' },
  { name: 'Purple', bg: '#D3B5FF', border: '#AF87ED', text: '#260B4C' },
  { name: 'Orange', bg: '#FFD29D', border: '#E59C52', text: '#4D2100' },
  { name: 'White', bg: '#F6F6F4', border: '#D0D0CE', text: '#181917' }
];

export interface ConnectorColorOption {
  name: string;
  color: string;
}

export const PEEPJAM_CONNECTOR_COLORS: ConnectorColorOption[] = [
  { name: 'Purple', color: '#9747FF' },
  { name: 'Blue', color: '#3B82F6' },
  { name: 'Green', color: '#10B981' },
  { name: 'Yellow', color: '#F59E0B' },
  { name: 'Red', color: '#EF4444' },
  { name: 'Gray', color: '#6B7280' },
  { name: 'White', color: '#FFFFFF' },
  { name: 'Black', color: '#181917' }
];

export function getHighContrastConnectorColor(colorOrBg: string): string {
  const lower = (colorOrBg || '').toLowerCase();
  switch (lower) {
    case '#fff385': return '#F59E0B'; // Yellow pastel -> amber/yellow
    case '#85e0a3': return '#10B981'; // Green pastel -> emerald green
    case '#8ce8ff': return '#3B82F6'; // Blue pastel -> vibrant blue
    case '#ffc7c7': return '#EF4444'; // Pink pastel -> vivid red/rose
    case '#d3b5ff': return '#9747FF'; // Purple pastel -> purple
    case '#ffd29d': return '#F97316'; // Orange pastel -> vivid orange
    case '#f6f6f4': return '#6B7280'; // White pastel -> crisp gray
    default: return colorOrBg || '#9747FF';
  }
}

export const PEEPJAM_PEN_COLORS: string[] = [
  // Windows Snipping Tool 30-Color Palette Grid (5 rows × 6 columns)
  '#000000', '#FFFFFF', '#D1D5DB', '#9CA3AF', '#6B7280', '#374151',
  '#BE185D', '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#FACC15',
  '#84CC16', '#22C55E', '#10B981', '#06B6D4', '#3B82F6', '#6366F1',
  '#8B5CF6', '#A855F7', '#FEF3C7', '#D97706', '#92400E', '#78350F',
  '#F472B6', '#FDBA74', '#FEF08A', '#86EFAC', '#7DD3FC', '#C4B5FD'
];

export const PEEPJAM_HIGHLIGHTER_COLORS: string[] = [
  '#FFE600', // Neon Yellow
  '#72F19E', // Mint Green
  '#4DEBFF', // Sky Cyan
  '#FF60A8', // Neon Rose Pink
  '#B982FF', // Pastel Lavender
  '#FF9F40', // Tangerine Orange
  '#FF5252', // Coral Red
  '#A3E635', // Lime
  '#38BDF8', // Light Blue
  '#F472B6', // Pastel Pink
  '#FDE047', // Soft Yellow
  '#C084FC'  // Light Purple
];

export const PEEPJAM_SECTION_COLORS = [
  { name: 'Purple', bg: 'rgba(151, 71, 255, 0.12)', border: 'rgba(151, 71, 255, 0.35)', title: '#D3B5FF' },
  { name: 'Blue', bg: 'rgba(13, 153, 255, 0.12)', border: 'rgba(13, 153, 255, 0.35)', title: '#8CE8FF' },
  { name: 'Green', bg: 'rgba(20, 174, 92, 0.12)', border: 'rgba(20, 174, 92, 0.35)', title: '#85E0A3' },
  { name: 'Yellow', bg: 'rgba(255, 199, 0, 0.12)', border: 'rgba(255, 199, 0, 0.35)', title: '#FFF385' },
  { name: 'Coral', bg: 'rgba(242, 72, 34, 0.12)', border: 'rgba(242, 72, 34, 0.35)', title: '#FFC7C7' },
  { name: 'Slate', bg: 'rgba(255, 255, 255, 0.08)', border: 'rgba(255, 255, 255, 0.20)', title: '#F6F6F4' }
];

export const PEEPJAM_STAMPS = [
  { emoji: '❤️', name: 'Love' },
  { emoji: '👍', name: 'Thumbs Up' },
  { emoji: '🔥', name: 'Fire' },
  { emoji: '🚀', name: 'Rocket' },
  { emoji: '💡', name: 'Idea' },
  { emoji: '⭐', name: 'Star' },
  { emoji: '💯', name: '100' },
  { emoji: '❌', name: 'Cross' }
] as const;

// Backward-compatibility aliases
export const FIGJAM_PASTELS = PEEPJAM_PASTELS;
export const FIGJAM_PEN_COLORS = PEEPJAM_PEN_COLORS;
export const FIGJAM_HIGHLIGHTER_COLORS = PEEPJAM_HIGHLIGHTER_COLORS;
export const FIGJAM_SECTION_COLORS = PEEPJAM_SECTION_COLORS;
export const FIGJAM_STAMPS = PEEPJAM_STAMPS;

export type ActiveTool =
  | 'move'
  | 'select'
  | 'hand'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'sticky'
  | 'shape'
  | 'connector'
  | 'line'
  | 'text'
  | 'todo'
  | 'thought'
  | 'section'
  | 'stamp';
