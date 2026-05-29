
'use client';

import { useEffect, useState } from 'react';

// This component is kept for potential future use (e.g., re-introducing themes)
// but currently it just renders its children as the theme is hardcoded to light.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
