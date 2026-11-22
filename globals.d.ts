declare module '*.css';
declare module 'next/link' {
  import type { ReactElement, ReactNode } from 'react';
  export default function Link(
    props: { href: string; children?: ReactNode } & Record<string, unknown>
  ): ReactElement;
}
