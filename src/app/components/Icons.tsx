import {
  CalendarBlank,
  MagnifyingGlass,
  Gear,
  SunHorizon,
  Moon,
  Note,
  ClockCountdown,
  ArrowsClockwise,
  ShoppingCart,
  ArrowCounterClockwise,
  Trash,
} from '@phosphor-icons/react';

type PhosphorComp = React.ComponentType<{
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
  size?: number | string;
  className?: string;
  color?: string;
}>;

type P = { size?: number; className?: string };

const make = (Ic: PhosphorComp, defaultSize = 20) => {
  function PhosphorIcon({ size = defaultSize, className }: P) {
    return <Ic weight="bold" size={size} className={className} />;
  }
  return PhosphorIcon;
};

export const AppIcons = {
  calendar:  make(CalendarBlank),
  search:    make(MagnifyingGlass),
  settings:  make(Gear),
  wake:      make(SunHorizon, 18),
  sleep:     make(Moon, 18),
  task:      make(Note, 18),
  freeTime:  make(ClockCountdown, 12),
  repeat:    make(ArrowsClockwise, 12),
  shopping:  make(ShoppingCart, 40),
  postponed: make(ArrowCounterClockwise, 12),
  trash:     make(Trash, 28),
};
