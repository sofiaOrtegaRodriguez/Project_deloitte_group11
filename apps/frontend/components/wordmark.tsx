import { cn } from '@/lib/utils';

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn('text-lg font-bold tracking-tight text-primary', className)}>Hosstock</span>;
}
