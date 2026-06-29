import type { ReactNode } from 'react'

/** iPhone bezel + screen — used only in the browser layout harness. In the iOS
 *  shell the Simulator supplies the real device chrome, so this is not rendered. */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative shrink-0" style={{ width: 393, height: 852 }}>
      <div className="absolute inset-0 rounded-[55px] bg-[#0a0a0a] shadow-phone" />
      <div className="absolute inset-[4px] flex flex-col overflow-hidden rounded-[51px] bg-white">
        {children}
      </div>
      <div className="absolute left-1/2 top-[12px] z-[60] h-[28px] w-[96px] -translate-x-1/2 rounded-full bg-black" />
    </div>
  )
}
