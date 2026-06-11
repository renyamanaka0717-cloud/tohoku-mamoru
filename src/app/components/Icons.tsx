import {
  Calendar,
  Search,
  Settings,
  Sunrise,
  Moon,
  Clock3,
  Pencil,
  ShoppingCart,
  Repeat,
  RotateCcw,
} from 'lucide-react';

type P = { size?: number; className?: string };

const sw = 1.5;

export const IcCalendar  = ({ size = 20, className }: P) => <Calendar     size={size} strokeWidth={sw} className={className} />;
export const IcSearch    = ({ size = 20, className }: P) => <Search        size={size} strokeWidth={sw} className={className} />;
export const IcSettings  = ({ size = 20, className }: P) => <Settings      size={size} strokeWidth={sw} className={className} />;
export const IcWake      = ({ size = 18, className }: P) => <Sunrise       size={size} strokeWidth={sw} className={className} />;
export const IcSleep     = ({ size = 18, className }: P) => <Moon          size={size} strokeWidth={sw} className={className} />;
export const IcFreeTime  = ({ size = 12, className }: P) => <Clock3        size={size} strokeWidth={sw} className={className} />;
export const IcPencil    = ({ size = 10, className }: P) => <Pencil        size={size} strokeWidth={sw} className={className} />;
export const IcShopping  = ({ size = 40, className }: P) => <ShoppingCart  size={size} strokeWidth={sw} className={className} />;
export const IcRepeat    = ({ size = 12, className }: P) => <Repeat        size={size} strokeWidth={sw} className={className} />;
export const IcRotateCcw = ({ size = 12, className }: P) => <RotateCcw     size={size} strokeWidth={sw} className={className} />;
