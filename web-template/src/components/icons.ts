import {
  Home,
  Inbox,
  User,
  ShoppingBag,
  Tag,
  Gift,
  Search,
  Heart,
  CreditCard,
  Ticket,
  Clover,
  Menu,
  type LucideIcon,
} from 'lucide-react'

/** Resolve a brandConfig icon name (lucide) to a component, with a safe default. */
const MAP: Record<string, LucideIcon> = {
  Home,
  Inbox,
  User,
  ShoppingBag,
  Tag,
  Gift,
  Search,
  Heart,
  CreditCard,
  Ticket,
  Clover,
  Menu,
}

export function resolveIcon(name: string): LucideIcon {
  return MAP[name] ?? Home
}
