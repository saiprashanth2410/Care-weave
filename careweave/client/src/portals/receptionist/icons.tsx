// The lab design system has no icon set: labels carry the meaning.
// These keep the receptionist markup unchanged while rendering text or nothing.
type IconProps = { size?: number; className?: string; strokeWidth?: number; style?: React.CSSProperties }
const none = (_: IconProps) => null

export const AlertCircle = none
export const AlertTriangle = none
export const ArrowRight = none
export const Ban = none
export const Calendar = none
export const CalendarDays = none
export const Check = none
export const CheckCircle2 = none
export const ChevronRight = none
export const Clock3 = none
export const ClockIcon = none
export const HeartPulse = none
export const LayoutDashboard = none
export const LogOut = none
export const Mail = none
export const Pencil = none
export const Phone = none
export const Plus = none
export const RefreshCw = none
export const Search = none
export const ShieldCheck = none
export const Stethoscope = none
export const UserCheck = none
export const UserPlus = none
export const Users = none
export const X = ({ className }: IconProps) => <span aria-hidden className={className}>×</span>
export const Menu = ({ className }: IconProps) => <span className={className}>Menu</span>
