import { AppNav } from "@/components/ascii-hub/app-nav"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      {children}
    </>
  )
}
