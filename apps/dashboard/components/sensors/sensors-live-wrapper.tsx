"use client"

import { SensorLiveProvider } from "./sensor-live-context"

export function SensorsLiveWrapper({ children }: { children: React.ReactNode }) {
  return <SensorLiveProvider>{children}</SensorLiveProvider>
}
