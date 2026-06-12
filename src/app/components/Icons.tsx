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
  ChartBar,
  Tag,
  Bell,
  Palette,
  LinkSimple,
  Star,
  Question,
  CaretRight,
  CaretLeft,
  CaretDown,
  Clock,
  PushPin,
  SmileySad,
  Sparkle,
  CheckSquare,
  ForkKnife,
  Broom,
  Briefcase,
  Car,
  Coffee,
  MusicNote,
  Book,
  Barbell,
  Heart,
  Phone,
  House,
  GraduationCap,
  Wallet,
  GameController,
  Camera,
  Plus,
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
  stats:     make(ChartBar, 18),
  tag:       make(Tag, 18),
  bell:      make(Bell, 18),
  palette:   make(Palette, 18),
  link:      make(LinkSimple, 18),
  star:      make(Star, 18),
  question:  make(Question, 18),
  caretRight: make(CaretRight, 18),
  caretLeft:  make(CaretLeft, 18),
  caretDown:   make(CaretDown, 14),
  clock:       make(Clock, 18),
  pin:         make(PushPin, 18),
  smileySad:   make(SmileySad, 40),
  sparkle:     make(Sparkle, 40),
  checkSquare: make(CheckSquare, 12),
  food:       make(ForkKnife, 18),
  clean:      make(Broom, 18),
  work:       make(Briefcase, 18),
  travel:     make(Car, 18),
  rest:       make(Coffee, 18),
  music:      make(MusicNote, 18),
  book:       make(Book, 18),
  exercise:   make(Barbell, 18),
  health:     make(Heart, 18),
  phone:      make(Phone, 18),
  home:       make(House, 18),
  study:      make(GraduationCap, 18),
  money:      make(Wallet, 18),
  game:       make(GameController, 18),
  camera:     make(Camera, 18),
  plus:       make(Plus, 28),
};
